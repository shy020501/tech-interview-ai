import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile,readdir } from 'node:fs/promises';
import { loadStaticCases,loadLegacyCases,loadSupabaseCases } from '../scripts/evals/datasets.mjs';
import { main,parseArgs,requestPlan,mockProfile,reportMarkdown } from '../scripts/evals/cli.mjs';
import { MockEvaluatorProvider } from '../src/lib/evaluator/providers/mock.ts';
import { runBenchmark,runCase } from '../src/lib/evaluator/benchmark/runner.ts';
import { summarize,estimateCost } from '../src/lib/evaluator/benchmark/metrics.ts';
import seed from '../supabase/seed-data.json' with {type:'json'};

const cases=await loadStaticCases();
const factory=(_p,c)=>new MockEvaluatorProvider(()=>JSON.stringify(c.mockOutput));
test('static dataset includes required abuse categories, legitimate questions, correction and three problem versions',async()=>{
  assert.ok(cases.length>=40);assert.equal(new Set(cases.map(c=>c.id)).size,cases.length);
  for(const intent of ['reasoning','clarification','meta_interview','off_topic','prompt_injection','direct_answer_request','hint_request','uncertain'])assert.ok(cases.some(c=>c.expected.intent===intent));
  for(const tag of ['answer_correction','correct_conclusion_wrong_reasoning','wrong_conclusion_useful_partial','alternative_valid_approach','very_short','hedged','contradictory_answer'])assert.ok(cases.some(c=>c.tags.includes(tag)));
  assert.equal(new Set(cases.map(c=>c.problem.problemVersionId)).size,3);
  const legacy=await loadLegacyCases();assert.equal(legacy.length,47);
  for(const c of legacy.filter(c=>c.source==='m3_example'))assert.equal(c.expected.intent,undefined);
});
test('full offline benchmark uses guards, validated results, state/progress simulation and sanitized artifacts',async()=>{
  const results=await runBenchmark(cases,[mockProfile],factory,{concurrency:2});
  assert.ok(results.every(r=>r.status!=='failed'));assert.equal(results.filter(r=>r.status==='guarded').length,3);
  const s=summarize(results);assert.equal(s.guardAccuracy.value,1);assert.equal(s.intentAccuracy.value,1);assert.equal(s.confirmedFalsePositiveRate.value,0);assert.equal(s.estimatedCostUSD.total,null);assert.equal(s.tokens.unavailableRequests,cases.length-3);
  const text=JSON.stringify(results);for(const key of ['mockOutput','referenceAnswer','hintLadder','reasoningRubric','quote','raw','content','Authorization'])assert.ok(!text.includes(`"${key}":`),key);
  const report=reportMarkdown({mode:'dry',profiles:{test:s}});assert.match(report,/do not measure model quality/);assert.match(report,/unavailable/);
});
test('structured scoring counts false positives/negatives, misconception precision/recall and failures',async()=>{
  const correct=await runCase(cases.find(c=>c.id==='reason-signal'),mockProfile,factory(mockProfile,cases.find(c=>c.id==='reason-signal')));
  const falsePositive=structuredClone(correct);falsePositive.expected.rubricStatuses={drone_signal:'partial'};falsePositive.expected.misconceptionIds=['missed'];falsePositive.predicted.misconceptionIds=['spurious'];
  const failed=structuredClone(correct);failed.status='failed';failed.predicted=null;failed.errorType='malformed_output';failed.requests[0].errorType='malformed_output';failed.requests[0].schemaValid=false;failed.requests[0].semanticValid=false;
  const report=summarize([falsePositive,failed]);assert.equal(report.confirmedFalsePositiveRate.numerator,1);assert.equal(report.confirmedFalsePositiveRate.denominator,3);assert.equal(report.confirmedFalseNegativeRate.value,1);assert.equal(report.misconceptionPrecision.value,0);assert.equal(report.misconceptionRecall.value,0);assert.equal(report.schemaFailureRate.value,0.5);assert.equal(report.intentAccuracy.value,0.5);
  assert.equal(summarize([]).intentAccuracy.value,null);assert.equal(summarize([]).latencyMs.p95,null);
});
test('latency percentiles and retry requests are measured with defined denominators',async()=>{
  const c=cases.find(c=>c.id==='reason-signal');const result=await runCase(c,mockProfile,new MockEvaluatorProvider((_i,n)=>n===1?'bad':JSON.stringify(c.mockOutput)),1);
  const report=summarize([result]);assert.equal(report.schemaFailureRate.value,0.5);assert.equal(report.retryRate.value,1);assert.equal(report.counts.providerRequests,2);
  const samples=[10,20,30,40,100].map(latencyMs=>({...result,latencyMs}));const latency=summarize(samples).latencyMs;assert.deepEqual(latency,{average:40,p50:30,p95:100});
});
test('cost accounts for cached input and every retry, distinguishes unknown/estimated usage',()=>{
  const p={...mockProfile,pricing:{currency:'USD',inputPerMillion:2,outputPerMillion:4,cachedInputPerMillion:1,asOf:'2026-10-06'}};
  const usage={status:'exact',inputTokens:100,outputTokens:10,cachedInputTokens:40};
  assert.ok(Math.abs(estimateCost([usage,usage],p).amount-0.0004)<1e-12);
  assert.equal(estimateCost([{...usage,status:'estimated'}],p).usageStatus,'estimated');
  assert.equal(estimateCost([{...usage,cachedInputTokens:null}],p).reason,'cached_usage_unavailable');
  assert.equal(estimateCost([usage],mockProfile).amount,null);assert.equal(estimateCost([],mockProfile).amount,0);
});
test('concurrency stays low and configurable without reordering case reports',async()=>{
  let active=0,maximum=0;const subset=cases.slice(0,7);
  const reports=await runBenchmark(subset,[mockProfile],(_p,c)=>new MockEvaluatorProvider(async()=>{active++;maximum=Math.max(active,maximum);await new Promise(resolve=>setTimeout(resolve,5));active--;return JSON.stringify(c.mockOutput);}),{concurrency:2});
  assert.equal(maximum,2);assert.deepEqual(reports.map(r=>r.caseId),subset.map(c=>c.id));await assert.rejects(runBenchmark(subset,[mockProfile],factory,{concurrency:99}),/concurrency/);
});
test('all-case preflight prevents partial paid execution, and guard fixtures follow configured message limits',async()=>{
  let calls=0;const c=cases.find(c=>c.id==='reason-signal');
  const oversized=structuredClone(c);oversized.id='oversized';oversized.problem.question='x'.repeat(50000);
  await assert.rejects(runBenchmark([c,oversized],[mockProfile],()=>new MockEvaluatorProvider(()=>{calls++;return '{}';})),/budget/);assert.equal(calls,0);
  const changed=(await loadStaticCases(5000)).filter(c=>c.id==='guard-over-limit');assert.equal(changed[0].message.content.length,5001);
  const reports=await runBenchmark(changed,[mockProfile],()=>new MockEvaluatorProvider(()=>{calls++;return '{}';}),{maxMessageChars:5000});assert.equal(reports[0].guardReason,'message_too_long');assert.equal(calls,0);
});
test('CLI makes paid execution explicit, limits default size and validates options',()=>{
  assert.equal(parseArgs(['--dry']).limit,10);assert.equal(parseArgs(['--live','--profile','a','--limit','10']).limit,10);
  assert.equal(parseArgs(['--live','--evaluation-mode','default']).evaluationMode,'default');
  assert.equal(parseArgs(['--live','--evaluation-mode','complex']).registry,'config/evaluator-profiles.json');
  for(const args of [[],['--live'],['--dry','--live'],['--dry','--profile','a'],['--dry','--limit','0'],['--dry','--retry','2'],['--dry','--concurrency','8'],['--dry','--all-cases','--limit','10'],['--dry','--dataset','supabase'],['--dry','--nonsense']])assert.throws(()=>parseArgs(args));
  for(const args of [['--dry','--evaluation-mode','default'],['--live','--evaluation-mode','max'],['--live','--evaluation-mode','complex','--profile','eval-luna-medium'],['--live','--evaluation-mode','default','--evaluation-mode','complex']])assert.throws(()=>parseArgs(args));
  assert.deepEqual(requestPlan([1,2,3],Array(120),1),{profiles:3,cases:120,maxRequests:720});
});
test('CLI help/plan and missing registry make no provider requests',async()=>{
  const log=console.log,request=globalThis.fetch;const lines=[];let requests=0;
  console.log=(...args)=>lines.push(args.join(' '));globalThis.fetch=async()=>{requests++;throw new Error('No network in CLI tests.');};
  try {
    await main(['--live','--help']);assert.match(lines.join('\n'),/eval:dry/);lines.length=0;
    await main(['--dry','--plan','--limit','10']);assert.match(lines.join('\n'),/Cases: 10/);assert.ok(!lines.some(s=>s.includes('Artifacts:')));
    await assert.rejects(main(['--live','--profile','absent','--registry','/tmp/no-such-evaluator-registry.json']),/Set --registry/);
    for(const [mode,effort] of [['default','medium'],['complex','xhigh'],['strong_only','xhigh']]){
      lines.length=0;
      await main(['--live','--evaluation-mode',mode,'--limit','10','--plan']);
      assert.match(lines.join('\n'),new RegExp(`Selected profile: eval-luna-${effort}; model: gpt-6-luna; reasoning effort: ${effort}`));
      assert.match(lines.join('\n'),/Expected provider requests: up to 10/);
    }
    lines.length=0;
    await main(['--live','--profile','eval-luna-medium','--profile','eval-luna-xhigh','--limit','10','--plan']);
    assert.match(lines.join('\n'),/Expected provider requests: up to 20/);
    assert.equal(requests,0);
  } finally {console.log=log;globalThis.fetch=request;}
});
function stubDB(role='admin') {
  const user={id:'user-a'},calls=[];const original=seed.problems.find(p=>p.versionId==='pv-drone-1'),p=seed.evaluationPackages.find(p=>p.problemVersionId===original.versionId);
  const rows={profiles:{user_id:user.id,role},problem_versions:{id:original.versionId,problem_id:original.id,scenario:original.scenario,question:original.question,assumptions:original.assumptions},problem_evaluation_packages:{problem_version_id:p.problemVersionId,reasoning_rubric:p.reasoningRubric,acceptable_alternative_approaches:p.acceptableAlternativeApproaches,misconceptions:p.misconceptions,completion_criteria:p.completionCriteria,evaluation_examples:p.evaluationExamples}};
  return {calls,auth:{getUser:async()=>({data:{user},error:null})},from(table){calls.push(table);return {select(columns){calls.push(columns);return {eq(){return {single:async()=>({data:rows[table],error:null})};}};}};}};
}
test('DB loader verifies Auth and database role before reading private examples, no elevated credentials needed',async()=>{
  const regular=stubDB('user');await assert.rejects(loadSupabaseCases(regular,['pv-drone-1']),/admin role/);assert.ok(!regular.calls.includes('problem_evaluation_packages'));
  const admin=stubDB();const loaded=await loadSupabaseCases(admin,['pv-drone-1']);assert.equal(loaded.length,1);assert.equal(loaded[0].source,'m3_example');assert.equal(loaded[0].expected.intent,undefined);
  assert.ok(!admin.calls.some(c=>c.includes('reference_answer')||c.includes('hint_ladder')));
  const unauth=stubDB();unauth.auth.getUser=async()=>({data:{user:null},error:{message:'hidden'}});await assert.rejects(loadSupabaseCases(unauth,['pv-drone-1']),/verified admin/);assert.equal(unauth.calls.length,0);
});
test('M4-B shares the evaluator only on the server; benchmarks and providers stay out of UI',async()=>{
  async function files(dir){return(await Promise.all((await readdir(dir,{withFileTypes:true})).map(e=>e.isDirectory()?files(`${dir}/${e.name}`):[`${dir}/${e.name}`]))).flat();}
  for(const file of await files('src/app')){
    const s=await readFile(file,'utf8');
    assert.ok(!/from ['"][^'"]*benchmarks[^'"]*['"]/.test(s),file);
    assert.ok(!file.includes('/api/chat/'), 'No generic chat endpoint');
    if(s.includes('lib/evaluator'))assert.ok(!/^['"]use client['"]/m.test(s),file);
  }
  for(const file of await files('src/components')){const s=await readFile(file,'utf8');assert.ok(!s.includes('lib/evaluator'),file);}
});
