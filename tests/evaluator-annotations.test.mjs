import test from 'node:test';
import assert from 'node:assert/strict';
import { loadStaticCases, loadLegacyCases, selectSplit, validateDataset } from '../scripts/evals/datasets.mjs';
import { parseArgs, mockProfile } from '../scripts/evals/cli.mjs';
import { reviewMarkdown } from '../scripts/evals/review.mjs';
import { buildCompactPackage, buildEvaluationInput } from '../src/lib/evaluator/input.ts';
import { buildPrompt } from '../src/lib/evaluator/prompt.ts';
import { gradingPolicyVersion } from '../src/lib/evaluator/grading-policy.ts';
import { validateEvaluation } from '../src/lib/evaluator/validation.ts';
import { reduceReasoningState, calculateProgress } from '../src/lib/evaluator/state.ts';
import { runCase } from '../src/lib/evaluator/benchmark/runner.ts';
import { summarize } from '../src/lib/evaluator/benchmark/metrics.ts';
import { MockEvaluatorProvider } from '../src/lib/evaluator/providers/mock.ts';
import seed from '../supabase/seed-data.json' with {type:'json'};

const cases=await loadStaticCases();
const fixture=id=>structuredClone(cases.find(c=>c.id===id));
const input=c=>buildEvaluationInput(c.problem,c.message,{state:c.initialState,recentContext:c.recentContext});
const check=(c,output=c.mockOutput)=>validateEvaluation(JSON.stringify(output),input(c));

test('compact package keeps authored detection conditions but excludes unrelated private data',()=>{
  const problem=seed.problems.find(p=>p.versionId==='pv-drone-1');
  const full=structuredClone(seed.evaluationPackages.find(p=>p.problemVersionId===problem.versionId));
  full.misconceptions[0].detectionNotes='DETECTION_RULE_SENTINEL';
  full.reasoningRubric[0].notes='ADMIN_NOTE_SENTINEL';full.referenceAnswer='ANSWER_SENTINEL';
  const compact=buildCompactPackage(problem,full);
  assert.equal(compact.misconceptions[0].detectionCriteria,'DETECTION_RULE_SENTINEL');
  assert.equal(compact.misconceptions[0].label,full.misconceptions[0].title);
  const text=JSON.stringify(compact);assert.ok(!text.includes('ADMIN_NOTE_SENTINEL'));assert.ok(!text.includes('ANSWER_SENTINEL'));
});

test('curated proposals have complete reasoning labels, reasons, explicit review status and disjoint families',()=>{
  validateDataset(cases);
  assert.ok(selectSplit(cases,'calibration').length>0);assert.ok(selectSplit(cases,'holdout').length>0);
  assert.ok(selectSplit(cases).every(c=>c.annotation.split==='calibration'));
  for(const c of cases){
    assert.equal(c.annotation.author,'ai_draft');assert.equal(c.annotation.reviewStatus,'needs_human_review');
    if(c.expected.intent==='reasoning'&&!c.expected.guardReason)assert.equal(Object.keys(c.expected.rubricStatuses).length,c.problem.rubric.length);
  }
  const duplicate=fixture('reason-dynamics');duplicate.id='different-id';
  assert.throws(()=>validateDataset([...cases,duplicate]),/Duplicate proposed benchmark input/);
  duplicate.message.content='An unrelated different fixture';duplicate.annotation.split='holdout';
  assert.throws(()=>validateDataset([...cases,duplicate]),/family crosses/);
  const missing=fixture('reason-signal');delete missing.expected.rubricStatuses.drone_shortcuts;
  assert.throws(()=>validateDataset([missing]),/Missing proposed benchmark node labels/);
});

test('legacy inputs/labels remain available, disputed seed labels are not silently rewritten',async()=>{
  const legacy=await loadLegacyCases();assert.equal(legacy.length,47);
  for(const id of ['pv-camera-1:pv-camera-1-example1','pv-representation-1:pv-representation-1-example1']){
    const old=legacy.find(c=>c.id===id);assert.deepEqual(old.expected.misconceptionIds,[]);
    assert.deepEqual(Object.values(old.expected.rubricStatuses),['partial']);
    const proposal=cases.find(c=>c.annotation.supersedes?.includes(id));assert.equal(proposal.annotation.reviewStatus,'needs_human_review');assert.equal(proposal.expected.misconceptionIds.length,1);
  }
  assert.equal(cases.filter(c=>c.message.content==='Maybe the encoder should reconstruct the current observation.').length,1);
});

test('policy v2 distinguishes substantive claims from hedging and keeps all labels out of prompts',()=>{
  assert.equal(fixture('hedged-answer').expected.rubricStatuses.drone_signal,'uncertain');
  assert.equal(fixture('drone-hedged-justified').expected.rubricStatuses.drone_signal,'confirmed');
  assert.equal(fixture('drone-explicit-reconstruction-only').expected.rubricStatuses.drone_signal,'misconception');
  assert.deepEqual(fixture('auxiliary-reconstruction').expected.misconceptionIds,[]);
  assert.deepEqual(fixture('holdout-camera-quoted-error').expected.misconceptionIds,[]);
  const c=fixture('drone-explicit-reconstruction-only');c.annotation.rationale='ANNOTATION_SENTINEL';
  const prompt=JSON.stringify(buildPrompt(input(c)));
  assert.ok(prompt.includes(gradingPolicyVersion));assert.ok(prompt.includes('detectionCriteria'));
  assert.ok(!prompt.includes('ANNOTATION_SENTINEL'));assert.ok(!prompt.includes('rubricStatuses'));assert.ok(!prompt.includes('needs_human_review'));
});

test('a detected misconception cannot coexist with partial credit on its own node',async()=>{
  const c=fixture('wrong-reason-right-name');c.mockOutput.rubricAssessments[0].status='partial';
  const invalid=check(c);assert.equal(invalid.ok,false);assert.ok(invalid.issues.some(i=>i.code==='partial_with_misconception'));
  const report=await runCase(c,mockProfile,new MockEvaluatorProvider(()=>JSON.stringify(c.mockOutput)));
  assert.equal(report.status,'failed');assert.equal(report.progress,null);assert.equal(report.predicted,null);
  assert.equal(report.escalation.recommended,true);
});

test('a misconception blocks its own node, while a different valid node retains credit',()=>{
  const c=fixture('drone-explicit-reconstruction-only');
  c.message.content+=' At fixed state and motor command, a larger payload reduces acceleration.';
  c.mockOutput.rubricAssessments.push({rubricNodeId:'drone_dynamics',status:'confirmed',evidence:[{messageId:c.message.id,quote:'a larger payload reduces acceleration'}]});
  const v=check(c);assert.equal(v.ok,true);
  const state=reduceReasoningState(input(c).state,v.value,'mixed-claim').state;
  assert.equal(state.nodes.drone_signal.status,'misconception');assert.equal(state.nodes.drone_dynamics.status,'confirmed');
  assert.equal(calculateProgress(c.problem,state),12.5);
});

test('detected misconceptions need an assessed anchor; uncatalogued errors cannot invent a link',()=>{
  const c=fixture('drone-explicit-reconstruction-only');c.mockOutput.rubricAssessments=[];
  assert.ok(check(c).issues.some(i=>i.code==='unassessed_misconception'));
  const contradiction=fixture('later-contradiction');
  contradiction.mockOutput.rubricAssessments[0].status='misconception';
  const invalid=check(contradiction);assert.equal(invalid.ok,false);assert.ok(invalid.issues.some(i=>i.code==='misconception_without_criterion'));
});

test('explicit contradiction and supported correction validate without fabricating misconceptions',()=>{
  for(const [id,status] of [['holdout-drone-retraction','contradicted'],['holdout-drone-resolved-conflict','confirmed']]){
    const c=fixture(id),v=check(c);assert.equal(v.ok,true,JSON.stringify(v));
    const state=reduceReasoningState(c.initialState,v.value,id).state;
    assert.equal(state.nodes.drone_dynamics.status,status);assert.deepEqual(v.value.result.detectedMisconceptionIds,[]);
  }
});

test('alternative-valid feedback requires supplied alternative criteria and supporting assessments',()=>{
  const c=fixture('valid-alternative');assert.equal(check(c).ok,true);
  c.mockOutput.rubricAssessments=[];assert.ok(check(c).issues.some(i=>i.code==='unsupported_alternative'));
  const other=fixture('valid-alternative');other.problem.alternatives=[];
  assert.ok(check(other).issues.some(i=>i.code==='unsupported_alternative'));
});

test('full node coverage catches overconfirmation outside formerly labelled nodes',async()=>{
  const c=fixture('reason-dynamics');
  c.mockOutput.rubricAssessments.push({rubricNodeId:'drone_validation',status:'confirmed',evidence:[{messageId:c.message.id,quote:c.message.content}]});
  // Evidence exists, but it does not justify the node. Semantic truth must be checked by labelled evals.
  const result=await runCase(c,mockProfile,new MockEvaluatorProvider(()=>JSON.stringify(c.mockOutput)));
  assert.equal(result.status,'valid');const s=summarize([result]);
  assert.equal(s.confirmedFalsePositiveRate.numerator,1);assert.equal(s.confirmedFalsePositiveRate.denominator,3);
  assert.equal(s.rubricLabelCoverage.value,1);assert.equal(s.unscoredConfirmedPredictions,0);
  const sparse=structuredClone(result);sparse.expected.rubricStatuses={drone_dynamics:'confirmed'};
  const old=summarize([sparse]);assert.equal(old.rubricLabelCoverage.value,0.25);assert.equal(old.unscoredConfirmedPredictions,1);
  assert.equal(s.rubricByExpectedStatus.unseen.numerator,2);assert.equal(s.rubricByExpectedStatus.unseen.denominator,3);
  assert.equal(s.rubricByExpectedStatus.confirmed.value,1);
});

test('CLI requires deliberate holdout selection and review export excludes it by default',()=>{
  assert.equal(parseArgs(['--dry','--all-cases']).split,'calibration');
  assert.equal(parseArgs(['--dry','--split','holdout']).split,'holdout');
  assert.equal(parseArgs(['--dry','--dataset','legacy']).dataset,'legacy');
  for(const args of [['--dry','--split','other'],['--dry','--dataset','legacy','--split','holdout']])assert.throws(()=>parseArgs(args));
  const text=reviewMarkdown(selectSplit(cases),'calibration','all');
  assert.match(text,/AI-authored proposals/);assert.ok(text.includes('Expected labels'));assert.ok(text.includes('Rationale:'));
  assert.ok(!text.includes('holdout-drone-teacher'));
  // Injection fixture text may literally request "referenceAnswer"; no actual answer/ladder is exported.
  for(const p of seed.evaluationPackages){assert.ok(!text.includes(p.referenceAnswer));for(const h of p.hintLadder)assert.ok(!text.includes(h.text));}
});
