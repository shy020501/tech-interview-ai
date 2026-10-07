import test from 'node:test';
import assert from 'node:assert/strict';
import seed from '../supabase/seed-data.json' with {type:'json'};
import { buildCompactPackage, buildEvaluationInput, emptyState, selectContext, defaultInputLimits } from '../src/lib/evaluator/input.ts';
import { parseResult } from '../src/lib/evaluator/schema.ts';
import { validateEvaluation } from '../src/lib/evaluator/validation.ts';
import { reduceReasoningState, calculateProgress, isComplete, selectHintTarget } from '../src/lib/evaluator/state.ts';
import { preGuard, nextAbuseStrikes, canSpendEscalation, defaultGuardConfig } from '../src/lib/evaluator/guards.ts';
import { shouldEscalate } from '../src/lib/evaluator/escalation.ts';
import { evaluate } from '../src/lib/evaluator/engine.ts';
import { MockEvaluatorProvider } from '../src/lib/evaluator/providers/mock.ts';
import { EvaluationError } from '../src/lib/evaluator/contracts.ts';
import { buildPrompt } from '../src/lib/evaluator/prompt.ts';
import { globalCases } from '../benchmarks/fixtures/global.ts';
import { mockProfile } from '../scripts/evals/cli.mjs';

const original=seed.problems.find(p=>p.versionId==='pv-drone-1');
const full=seed.evaluationPackages.find(p=>p.problemVersionId===original.versionId);
const compact=buildCompactPackage(original,full);
const fixtures=globalCases(compact),fixture=id=>structuredClone(fixtures.find(c=>c.id===id));
function inputFor(c){return buildEvaluationInput(c.problem,c.message,{state:c.initialState,recentContext:c.recentContext});}
function validated(c){const v=validateEvaluation(JSON.stringify(c.mockOutput),inputFor(c));assert.equal(v.ok,true,JSON.stringify(v));return v.value;}
const signal='drone_signal';

test('compact/input/prompt exclude full private package, examples, admin notes and unbounded context',()=>{
  const source=structuredClone(full);source.referenceAnswer='PRIVATE_ANSWER_SENTINEL';source.reasoningRubric[0].notes='ADMIN_SENTINEL';source.evaluationExamples[0].response='GROUND_TRUTH_SENTINEL';source.hintLadder[0].text='UNREVEALED_HINT_SENTINEL';
  const p=buildCompactPackage(original,source),c=fixture('reason-signal');c.problem=p;
  const prompt=JSON.stringify(buildPrompt(inputFor(c)));
  for(const marker of ['PRIVATE_ANSWER_SENTINEL','ADMIN_SENTINEL','GROUND_TRUTH_SENTINEL','UNREVEALED_HINT_SENTINEL','referenceAnswer','hintLadder','evaluationExamples'])assert.ok(!prompt.includes(marker));
  assert.ok(prompt.includes('UNTRUSTED_CURRENT_USER_MESSAGE'));assert.ok(prompt.includes('never a general chatbot'));
  assert.throws(()=>buildCompactPackage({...original,versionId:'wrong'},full),/version/);
  assert.throws(()=>buildEvaluationInput(compact,{id:'long',sequence:1,content:'x'.repeat(4001)}),/over-limit/);
  assert.throws(()=>buildEvaluationInput(compact,c.message,{limits:{...defaultInputLimits,maxPackageChars:1}}),/budget/);
});
test('context selection is bounded, chronological, deduplicated and can prioritize a referenced message',()=>{
  const messages=Array.from({length:20},(_,i)=>({id:`m${i}`,sequence:i+1,content:'text'}));
  const current={id:'now',sequence:22,content:'As I said earlier'};
  const selected=selectContext([...messages,messages[0]],current,{...defaultInputLimits,maxRecentChars:12},['m0']);
  assert.deepEqual(selected.map(m=>m.id),['m0','m18','m19']);
  assert.ok(!selectContext([...messages,{id:'future',sequence:99,content:'x'}],current).some(m=>m.id==='future'));
  const c=fixture('reason-signal'),a=buildPrompt(inputFor(c));c.message.content='Different reasoning';const b=buildPrompt(inputFor(c));assert.equal(a[0].content,b[0].content);assert.notEqual(a[1].content,b[1].content);
});
test('structured output accepts only the strict contract; invalid JSON/intent/status/extras fail',()=>{
  const c=fixture('reason-signal');assert.equal(parseResult(JSON.stringify(c.mockOutput)).ok,true);
  for(const output of ['not json','```json\n{}\n```','{"intent":'])assert.equal(parseResult(output).errorType,'malformed_output');
  for(const mutate of [r=>r.intent='chatbot',r=>r.progress=73,r=>r.answer='secret',r=>r.rubricAssessments[0].status='correct',r=>delete r.intent,r=>r.rubricAssessments[0].evidence[0].explanation='free response',r=>r.confidence=0.99]){
    const r=structuredClone(c.mockOutput);mutate(r);assert.equal(parseResult(JSON.stringify(r)).errorType,'schema_validation_error');
  }
});
test('semantic validator rejects IDs, missing/fabricated evidence, duplicates, contradictions and escalation mismatch',()=>{
  const c=fixture('reason-signal');
  const cases=[
    [r=>r.rubricAssessments[0].rubricNodeId='unknown','unknown_rubric_id'],
    [r=>r.rubricAssessments[0].evidence=[],'missing_current_evidence'],
    [r=>r.rubricAssessments[0].evidence[0].quote='the drone weighs 15kg','fabricated_evidence'],
    [r=>r.rubricAssessments[0].evidence[0].messageId='nonexistent','unknown_evidence_message'],
    [r=>r.rubricAssessments.push(r.rubricAssessments[0]),'duplicate_id'],
    [r=>r.detectedMisconceptionIds=['invented'],'unknown_misconception_id'],
    [r=>r.rubricAssessments[0].status='misconception','misconception_without_criterion'],
    [r=>r.contradictions=[{rubricNodeIds:['drone_dynamics'],evidence:r.rubricAssessments[0].evidence}],'contradictory_status'],
    [r=>r.escalationReason='state_conflict','escalation_reason_mismatch'],
  ];
  for(const [mutate,code] of cases){const result=structuredClone(c.mockOutput);mutate(result);const v=validateEvaluation(JSON.stringify(result),inputFor(c));assert.equal(v.ok,false);assert.equal(v.errorType,'semantic_validation_error');assert.ok(v.issues.some(i=>i.code===code),code);}
});
test('off-topic/injection/direct-answer/clarification cannot smuggle progress or evidence',()=>{
  for(const intent of ['off_topic','prompt_injection','direct_answer_request','clarification','hint_request','meta_interview']) {
    const c=fixtures.find(c=>c.mockOutput.intent===intent);assert.equal(validated(c).result.intent,intent);
    const r=structuredClone(c.mockOutput);r.rubricAssessments=[{rubricNodeId:signal,status:'confirmed',evidence:[{messageId:c.message.id,quote:c.message.content}]}];
    assert.ok(validateEvaluation(JSON.stringify(r),inputFor(c)).issues.some(i=>i.code==='nonreasoning_progress'));
  }
});
test('a prior quote alone cannot confirm or downgrade a node in a new message',()=>{
  const c=fixture('reason-signal');c.message.sequence=2;c.recentContext=[{id:'before',sequence:1,content:c.message.content}];
  c.mockOutput.rubricAssessments.forEach(a=>a.evidence[0].messageId='before');
  const result=validateEvaluation(JSON.stringify(c.mockOutput),inputFor(c));assert.equal(result.ok,false);assert.ok(result.issues.some(i=>i.code==='missing_current_evidence'));
});
test('baseline mock intent outputs validate; valid questions and uncertainty are not abuse',()=>{
  for(const c of fixtures.filter(c=>!c.expected.guardReason)){assert.equal(validated(c).result.intent,c.expected.intent);}
  for(const intent of ['clarification','meta_interview','uncertain','reasoning','hint_request','direct_answer_request'])assert.equal(nextAbuseStrikes(2,intent),0);
  assert.equal(nextAbuseStrikes(2,'prompt_injection'),3);assert.equal(nextAbuseStrikes(1,'off_topic'),2);
});
test('raw, forged or modified validated objects cannot update state',()=>{
  const c=fixture('reason-signal'),v=validated(c),state=emptyState(compact);
  assert.throws(()=>reduceReasoningState(state,{...v},'a'),/validated/);
  assert.throws(()=>v.result.rubricAssessments[0].status='unseen',TypeError);
  assert.throws(()=>v.messageSequence=99,TypeError);
  assert.throws(()=>reduceReasoningState({...state,problemVersionId:'other'},v,'a'),/version/);
});
test('reducer supports partial → confirmed → contradicted → corrected; retains provenance without mutation',()=>{
  let state=emptyState(compact);
  const update=(status,seq)=>{
    const c=fixture('reason-signal');c.message.sequence=seq;c.initialState=state;
    c.mockOutput.rubricAssessments=[{rubricNodeId:signal,status,evidence:[{messageId:c.message.id,quote:c.message.content}]}];
    if(status==='contradicted'){c.mockOutput.contradictions=[{rubricNodeIds:[signal],evidence:c.mockOutput.rubricAssessments[0].evidence}];c.mockOutput.feedbackCategory='contradiction';}
    const before=structuredClone(state);const next=reduceReasoningState(state,validated(c),`assessment-${seq}`);assert.deepEqual(state,before);state=next.state;assert.equal(state.nodes[signal].status,status);
  };
  update('partial',1);update('confirmed',2);update('contradicted',3);assert.ok(state.unresolvedNodeIds.includes(signal));update('confirmed',4);assert.ok(!state.unresolvedNodeIds.includes(signal));
  assert.deepEqual(state.nodes[signal].assessmentIds,['assessment-1','assessment-2','assessment-3','assessment-4']);assert.ok(state.nodes[signal].conflictingMessageIds.length);
});
test('confirmed can become uncertain/partial/misconception; unseen never erases prior evidence',()=>{
  for(const status of ['uncertain','partial','misconception','unseen']) {
    const c=fixture('wrong-reason-right-name');c.initialState=emptyState(compact);c.initialState.nodes[signal].status='confirmed';c.initialState.revision=1;c.initialState.lastSequence=1;c.message.sequence=2;
    c.mockOutput.rubricAssessments[0].status=status;if(status==='unseen')c.mockOutput.rubricAssessments[0].evidence=[];
    if(status!=='misconception'){c.mockOutput.detectedMisconceptionIds=[];c.mockOutput.misconceptionEvidence=[];c.mockOutput.feedbackCategory=status==='partial'?'valid_progress':'insufficient_reasoning';}
    const state=reduceReasoningState(c.initialState,validated(c),'a2').state;assert.equal(state.nodes[signal].status,status==='unseen'?'confirmed':status);
  }
});
test('stale sequence and stale base revision cannot overwrite newer state, including concurrent newer messages',()=>{
  const c=fixture('reason-signal'),v=validated(c),state=emptyState(compact),first=reduceReasoningState(state,v,'first').state;
  assert.equal(reduceReasoningState(first,v,'duplicate').reason,'stale_sequence');
  c.message.sequence=3;const concurrent=validated(c);assert.equal(reduceReasoningState(first,concurrent,'late').reason,'stale_revision');
});
test('weighted progress has explicit defaults, supports regressions and zero weight',()=>{
  const state=emptyState(compact);state.nodes.drone_dynamics.status='confirmed';state.nodes.drone_signal.status='partial';assert.equal(calculateProgress(compact,state),31.25);
  state.nodes.drone_signal.status='confirmed';assert.equal(calculateProgress(compact,state),50);
  for(const status of ['misconception','uncertain','contradicted']){state.nodes.drone_signal.status=status;assert.equal(calculateProgress(compact,state),12.5);}
  assert.equal(calculateProgress({...compact,rubric:compact.rubric.map(n=>({...n,weight:0}))},state),0);
  assert.throws(()=>calculateProgress({...compact,rubric:[{...compact.rubric[0],weight:-1}]},state),/weight/);
  assert.throws(()=>calculateProgress(compact,state,{}),/Contributions/);
});
test('completion means all required AND any one alternative group, never an empty/unknown criterion',()=>{
  const state=emptyState(compact);state.nodes.drone_dynamics.status='confirmed';state.nodes.drone_signal.status='confirmed';
  assert.equal(isComplete(state,compact.completion),false);state.nodes.drone_validation.status='confirmed';assert.equal(isComplete(state,compact.completion),true);
  state.nodes.drone_signal.status='contradicted';assert.equal(isComplete(state,compact.completion),false);
  assert.equal(isComplete(state,{requiredNodeIds:[],alternativeNodeGroups:[]}),false);assert.equal(isComplete(state,{requiredNodeIds:['unknown'],alternativeNodeGroups:[]}),false);
  assert.equal(isComplete(state,{requiredNodeIds:['drone_dynamics'],alternativeNodeGroups:[]}),true);
});
test('hint target core prioritizes blockers/prerequisites, avoids confirmed nodes, repeats and stronger hints',()=>{
  const state=emptyState(compact);state.nodes.drone_dynamics.status='confirmed';state.nodes.drone_validation.status='misconception';
  const hints=[{id:'downstream',targetRubricNodeId:'drone_validation',level:1,text:'private'},{id:'strong',targetRubricNodeId:signal,level:3,text:'private'},{id:'weak',targetRubricNodeId:signal,level:1,text:'private'}];
  assert.deepEqual(selectHintTarget(compact,state,hints,[]),{rubricNodeId:signal,hintId:'weak'});
  assert.equal(selectHintTarget(compact,state,hints,['weak']).hintId,'strong');assert.equal(selectHintTarget(compact,state,hints,['weak','strong']),null);
  state.nodes[signal].status='confirmed';assert.equal(selectHintTarget(compact,state,hints,[]).hintId,'downstream');
});
test('pre-guards reject length/empty/duplicate/inactive/rate/quota/strikes before transport',async()=>{
  const c=fixture('reason-signal');
  for(const [message,context,reason] of [['',{active:true},'empty_message'],['x'.repeat(4001),{active:true},'message_too_long'],['same',{active:true,previousMessage:'same'},'duplicate_message'],['x',{active:false},'inactive_attempt'],['x',{active:true,recentRequestCount:12},'rate_limit'],['x',{active:true,attemptEvaluations:100},'attempt_quota'],['x',{active:true,dailyEvaluations:300},'daily_quota'],['x',{active:true,dailyInputTokens:200000},'input_budget'],['x',{active:true,consecutiveAbuse:3},'abuse_cooldown']]){
    assert.equal(preGuard(message,context).reason,reason);const provider=new MockEvaluatorProvider(()=>{throw new Error('must not run');});
    const run=await evaluate({...inputFor(c),message:{...c.message,content:message}},provider,mockProfile,{guardContext:context});assert.equal(run.guardReason,reason);assert.equal(provider.calls,0);
  }
  assert.equal(canSpendEscalation({active:true,dailyEscalations:defaultGuardConfig.maxDailyEscalations}),false);
});
test('single schema retry is bounded, malformed is never progress, semantic failures do not retry',async()=>{
  const c=fixture('reason-signal'),input=inputFor(c);
  const recovery=new MockEvaluatorProvider((_i,n)=>n===1?'oops':JSON.stringify(c.mockOutput));
  const good=await evaluate(input,recovery,mockProfile,{retry:1});assert.equal(good.status,'valid');assert.equal(good.retryCount,1);assert.equal(good.requests[0].errorType,'malformed_output');
  const bad=new MockEvaluatorProvider(()=>'{');const failure=await evaluate(input,bad,mockProfile,{retry:1});assert.equal(bad.calls,2);assert.equal(failure.value,null);assert.equal(failure.escalation.recommended,true);
  const forged=structuredClone(c.mockOutput);forged.rubricAssessments[0].evidence[0].quote='invented';const suspicious=new MockEvaluatorProvider(()=>JSON.stringify(forged));const invalid=await evaluate(input,suspicious,mockProfile,{retry:1});assert.equal(invalid.errorType,'semantic_validation_error');assert.equal(suspicious.calls,1);
});
test('provider failures stay distinct, sanitized and never get a fake successful evaluation',async()=>{
  for(const type of ['provider_timeout','provider_rate_limit','provider_auth_error','provider_error']){
    const p=new MockEvaluatorProvider(()=>{throw new EvaluationError(type);});const run=await evaluate(inputFor(fixture('reason-signal')),p,mockProfile,{retry:1});assert.equal(run.errorType,type);assert.equal(run.value,null);assert.equal(p.calls,1);
  }
  const p=new MockEvaluatorProvider(()=>{throw new Error('SECRET_SENTINEL');});const run=await evaluate(inputFor(fixture('reason-signal')),p,mockProfile);assert.equal(run.errorType,'internal_error');assert.ok(!JSON.stringify(run).includes('SECRET_SENTINEL'));
});
test('escalation is policy simulation only, normal reasoning does not trigger it',()=>{
  const c=fixture('reason-signal');assert.equal(shouldEscalate(inputFor(c),c.mockOutput).recommended,false);
  for(const id of ['unknown-approach','later-contradiction','unclear-intent']){const c=fixture(id);assert.equal(shouldEscalate(inputFor(c),c.mockOutput).recommended,true);}
  assert.equal(shouldEscalate(inputFor(c),null,'semantic_validation_error').recommended,true);
  assert.equal(shouldEscalate({...inputFor(c),evaluationMode:'complex'},c.mockOutput).recommended,true);
});
