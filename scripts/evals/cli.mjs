import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { parseEvaluatorRegistry, selectEvaluatorProfile, selectProfiles, resolveConnection } from '../../src/lib/evaluator/registry.ts';
import { evaluationModes } from '../../src/lib/evaluator/contracts.ts';
import { OpenAICompatibleProvider } from '../../src/lib/evaluator/providers/openai-compatible.ts';
import { MockEvaluatorProvider } from '../../src/lib/evaluator/providers/mock.ts';
import { runBenchmark } from '../../src/lib/evaluator/benchmark/runner.ts';
import { summarize } from '../../src/lib/evaluator/benchmark/metrics.ts';
import { evaluatorPolicy } from '../../src/lib/evaluator/prompt.ts';
import { gradingPolicyVersion } from '../../src/lib/evaluator/grading-policy.ts';
import { loadStaticCases, loadLegacyCases, selectSplit, validateDataset } from './datasets.mjs';

export const help=`Evaluator benchmark (M4-A; never connected to interview chat)
  pnpm eval:dry [--limit 10 | --all-cases] [--dataset static|legacy|supabase|combined]
  pnpm eval:live --profile <id> [--profile <id> ... | --profile all] [--limit 10 | --all-cases]
  pnpm eval:live --evaluation-mode default|complex|strong_only [--limit 10 | --all-cases]
Options:
  --registry <path>     Default: config/evaluator-profiles.json (local overrides must be explicit)
  --evaluation-mode    Select the configured default or difficult profile instead of --profile.
                       Sets the model profile for this run; does not relabel benchmark case difficulty.
  --dataset <name>      Default: static. Supabase/combined require --version <id> and admin sign-in.
                       legacy preserves the original 47 messages/labels, not the old prompt/input builder.
  --split <name>        calibration (default), holdout, or all. Static/combined only; --all-cases
                       means all cases in the SELECTED split. Holdout requires explicit selection.
  --version <id>        Repeat for explicit DB problem versions (max 20).
  --concurrency <1..4>  Default: BENCHMARK_CONCURRENCY or 1
  --retry <0|1>         Default: 0. Retry malformed/schema output only, never provider errors.
  --plan               Print counts and stop before provider calls. DB selection still reads the chosen DB examples.
  --help               No connections, no files written.
Live calls may cost money. Dry mode replays fixtures; its accuracy is not model quality.
Artifacts: artifacts/evals/<timestamp>-<mode>/summary.json, cases.json, report.md.`;

export function parseArgs(args, env={}) {
  const options={mode:null,profiles:[],evaluationMode:null,limit:10,allCases:false,dataset:'static',split:'calibration',versions:[],registry:'config/evaluator-profiles.json',concurrency:Number(env.BENCHMARK_CONCURRENCY||1),retry:0,plan:false,help:false};
  const names={'--registry':'registry','--dataset':'dataset','--split':'split','--limit':'limit','--concurrency':'concurrency','--retry':'retry','--evaluation-mode':'evaluationMode'};
  let sawLimit=false,sawSplit=false;
  for(let i=0;i<args.length;i++) {
    const arg=args[i];if(arg==='--')continue;
    if(arg==='--dry'||arg==='--live'){if(options.mode)throw new Error('Choose exactly one benchmark mode.');options.mode=arg.slice(2);}
    else if(arg==='--help')options.help=true;
    else if(arg==='--plan')options.plan=true;
    else if(arg==='--all-cases')options.allCases=true;
    else if(arg==='--profile'||arg==='--version'||names[arg]) {
      const value=args[++i];if(!value||value.startsWith('--'))throw new Error('Missing option value.');
      if(arg==='--profile')options.profiles.push(value);
      else if(arg==='--version')options.versions.push(value);
      else {if(arg==='--evaluation-mode'&&options.evaluationMode!==null)throw new Error('Choose one evaluation mode.');options[names[arg]]=['--limit','--concurrency','--retry'].includes(arg)?Number(value):value;if(arg==='--limit')sawLimit=true;if(arg==='--split')sawSplit=true;}
    } else throw new Error('Unknown benchmark option. Use --help.');
  }
  if(options.help)return options;
  if(!options.mode)throw new Error('Choose eval:dry or eval:live.');
  if(!['static','legacy','supabase','combined'].includes(options.dataset))throw new Error('Invalid dataset.');
  if(!['calibration','holdout','all'].includes(options.split))throw new Error('Invalid benchmark split.');
  if(sawSplit&&!['static','combined'].includes(options.dataset))throw new Error('Use --split only with static or combined datasets.');
  if(options.allCases&&sawLimit)throw new Error('Use either --limit or --all-cases.');
  if(!Number.isInteger(options.limit)||options.limit<1||options.limit>10000)throw new Error('Limit must be between 1 and 10000.');
  if(!Number.isInteger(options.concurrency)||options.concurrency<1||options.concurrency>4)throw new Error('Concurrency must be between 1 and 4.');
  if(![0,1].includes(options.retry))throw new Error('Retry must be 0 or 1.');
  if(options.evaluationMode!==null&&!evaluationModes.includes(options.evaluationMode))throw new Error('Invalid evaluation mode.');
  if(options.evaluationMode!==null&&options.profiles.length)throw new Error('Choose either --profile or --evaluation-mode.');
  if(options.mode==='live'&&!options.profiles.length&&options.evaluationMode===null)throw new Error('Live mode requires an explicit --profile or --evaluation-mode.');
  if(options.mode==='dry'&&(options.profiles.length||options.evaluationMode!==null))throw new Error('Dry mode uses only fixture-playback, never a live profile.');
  if(options.profiles.includes('all')&&options.profiles.length!==1)throw new Error('Use all by itself.');
  if(['supabase','combined'].includes(options.dataset)&&!options.versions.length)throw new Error('DB datasets require explicit --version IDs.');
  return options;
}
export const mockProfile={id:'fixture-playback',providerType:'mock',model:'fixture-playback',baseUrlEnv:'UNUSED_URL',apiKeyEnv:'UNUSED_KEY',maxOutputTokens:2000,timeoutMs:1000,enabled:true,role:'benchmark_only',capabilities:{supportsJsonSchema:true,supportsJsonMode:true,supportsUsageReporting:false,supportsTemperature:false,outputTokenParameter:'max_completion_tokens'}};
export function requestPlan(profiles,cases,retry=0) {return {profiles:profiles.length,cases:cases.length,maxRequests:profiles.length*cases.length*(1+retry)};}
export function reportMarkdown(summary) {
  const pct=m=>m.value===null?'N/A':`${(m.value*100).toFixed(1)}% (${m.numerator}/${m.denominator})`;
  const sections=Object.entries(summary.profiles).map(([id,s])=>[
    `## ${id}`, '',
    `- Valid results: ${pct(s.validResultRate)}`,
    `- Intent accuracy: ${pct(s.intentAccuracy)}`,
    `- Rubric status accuracy: ${pct(s.rubricStatusAccuracy)}`,
    `- Rubric label coverage: ${pct(s.rubricLabelCoverage)}; unscored confirmed predictions: ${s.unscoredConfirmedPredictions}`,
    `- Annotation status: ${s.annotationReview.needsHumanReview} AI-draft cases awaiting human review; ${s.annotationReview.untracked} cases without review metadata`,
    `- Confirmed false positives: ${pct(s.confirmedFalsePositiveRate)}`,
    `- Confirmed false negatives: ${pct(s.confirmedFalseNegativeRate)}`,
    `- Misconception precision / recall: ${pct(s.misconceptionPrecision)} / ${pct(s.misconceptionRecall)}`,
    `- Escalation recall / unnecessary: ${pct(s.expectedEscalationRecall)} / ${pct(s.unnecessaryEscalationRate)}`,
    `- Schema / semantic failures: ${pct(s.schemaFailureRate)} / ${pct(s.semanticFailureRate)}`,
    `- Retry / provider error rate: ${pct(s.retryRate)} / ${pct(s.providerErrorRate)}`,
    `- Latency average / p50 / p95 (ms): ${s.latencyMs.average?.toFixed(1)??'N/A'} / ${s.latencyMs.p50?.toFixed(1)??'N/A'} / ${s.latencyMs.p95?.toFixed(1)??'N/A'}`,
    `- Known input / output tokens: ${s.tokens.input} / ${s.tokens.output}; unavailable requests: ${s.tokens.unavailableRequests}`,
    `- Estimated total USD: ${s.estimatedCostUSD.total??'unavailable'}; missing-price/usage evaluations: ${s.estimatedCostUSD.unavailableEvaluations}`,
    ...(s.providerFailures??[]).map(f=>`- Provider failure (${f.count} request(s)): ${f.errorType}; HTTP ${f.httpStatus??'unavailable'}; code=${f.code??'unavailable'}; type=${f.type??'unavailable'}; param=${f.param??'unavailable'}`),
    ...(s.counts.attempted>0&&s.counts.valid===0?['', 'No validated evaluation was received. These scores do not establish this model’s reasoning quality.']:[]),
  ].join('\n'));
  return [
    '# Evaluator benchmark', '',
    `Mode: ${summary.mode}. ${summary.mode==='dry'?'Fixture playback only; these scores do not measure model quality.':'Live API benchmark; transport failures and output validation are recorded separately. No model selected automatically.'}`,
    '', `Dataset: ${summary.dataset??'unspecified'}; split: ${summary.config?.split??'unspecified'}; grading policy: ${summary.gradingPolicyVersion??'unspecified'}.`,
    'AI-authored proposed labels are not human-reviewed gold. A changed dataset/policy is a new baseline, not a directly comparable improvement.',
    '', sections.join('\n\n'), '',
    ...(summary.validationFailures??[]).map(f=>`- Rejected ${f.profileId} / ${f.caseId}: ${f.errorType}; ${f.issueCodes.join(', ')}`),
    ...(summary.splitProfiles?['Per-split metrics are stored separately in summary.json (splitProfiles); do not use a mixed aggregate as holdout accuracy.']:[]),
    'Failed requests count as missed labels in end-to-end accuracy/recall. Inspect provider failures before comparing reasoning quality.',
    'See summary.json for intent detection recall/false-positive rates, denominators and accounting coverage. No prompts or raw responses are saved.', '',
  ].join('\n');
}
export async function main(args=process.argv.slice(2)) {
  let options=parseArgs(args,process.env);if(options.help){console.log(help);return;}
  const root=fileURLToPath(new URL('../../',import.meta.url));
  const require=createRequire(import.meta.url);
  const {loadEnvConfig}=require(require.resolve('@next/env',{paths:[path.dirname(require.resolve('next/package.json'))]}));
  loadEnvConfig(root,true,{info(){},error(){}});
  options=parseArgs(args,process.env);
  let profiles=[mockProfile];
  if(options.mode==='live') {
    let registry;try{registry=JSON.parse(await readFile(path.resolve(root,options.registry),'utf8'));}catch{throw new Error('Set --registry to an existing evaluator registry JSON file.');}
    registry=parseEvaluatorRegistry(registry);
    profiles=options.evaluationMode===null?selectProfiles(registry.profiles,options.profiles):[selectEvaluatorProfile(registry,options.evaluationMode)];
    // Preflight ALL profiles before any paid calls or DB sign-in.
    for(const profile of profiles){if(profile.providerType!=='openai_compatible')throw new Error('No registered adapter for this provider type.');if(profile.model.includes('REPLACE_'))throw new Error('Set an explicit provider model ID.');if(!options.plan)resolveConnection(profile,process.env);}
  }
  const maxMessageChars=Number(process.env.MAX_EVALUATION_MESSAGE_CHARS||4000);
  if(!Number.isInteger(maxMessageChars)||maxMessageChars<1||maxMessageChars>20000)throw new Error('Invalid MAX_EVALUATION_MESSAGE_CHARS.');
  let cases=options.dataset==='supabase'?[]:options.dataset==='legacy'?await loadLegacyCases(maxMessageChars):validateDataset(await loadStaticCases(maxMessageChars));
  if(['static','combined'].includes(options.dataset))cases=selectSplit(cases,options.split);
  if(['supabase','combined'].includes(options.dataset)){const {readAdminDataset}=await import('./supabase.mjs');cases.push(...await readAdminDataset(options.versions));}
  validateDataset(cases);
  if(!options.allCases)cases=cases.slice(0,options.limit);
  if(!cases.length)throw new Error('No benchmark cases selected.');
  const plan=requestPlan(profiles,cases,options.retry);
  console.log(`Mode: ${options.mode}\nProfiles: ${plan.profiles}\nCases: ${plan.cases}\nExpected provider requests: up to ${plan.maxRequests}\nConcurrency: ${options.concurrency}\nRetries: ${options.retry}`);
  console.log(`Dataset: ${options.dataset}; split: ${['static','combined'].includes(options.dataset)?options.split:'unassigned'}; policy: ${gradingPolicyVersion}`);
  console.log(`Proposed labels awaiting human review: ${cases.filter(c=>c.annotation?.reviewStatus==='needs_human_review').length}. Not an expert-reviewed quality certificate.`);
  for(const profile of profiles)console.log(`Selected profile: ${profile.id}; model: ${profile.model}; reasoning effort: ${profile.reasoningEffort??'provider default'}`);
  if(options.mode==='dry')console.log('Offline fixture playback. No paid API calls; scores are harness checks only.');
  else console.log('Explicit live benchmark. No strong-model chaining or production routing.');
  if(options.plan)return;
  const results=await runBenchmark(cases,profiles,(_profile,c)=>options.mode==='dry'?new MockEvaluatorProvider(()=>JSON.stringify(c.mockOutput)):new OpenAICompatibleProvider(),{concurrency:options.concurrency,retry:options.retry,maxMessageChars});
  const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
  const splitNames=[...new Set(results.map(r=>r.annotation?.split??'unassigned'))];
  const summary={contractVersion:2,mode:options.mode,dataset:options.dataset,gradingPolicyVersion,createdAt:new Date().toISOString(),datasetHash:hash(cases.map(c=>({id:c.id,problem:c.problem,message:c.message,context:c.recentContext,state:c.initialState,expected:c.expected}))),annotationHash:hash(cases.map(c=>({id:c.id,annotation:c.annotation}))),policyHash:hash(evaluatorPolicy),registryHash:hash(profiles),plan,config:{concurrency:options.concurrency,retry:options.retry,maxMessageChars,evaluationMode:options.evaluationMode,split:['static','combined'].includes(options.dataset)?options.split:'unassigned'},profileMetadata:profiles.map(p=>({id:p.id,providerType:p.providerType,model:p.model,reasoningEffort:p.reasoningEffort??null,role:p.role,capabilities:p.capabilities,maxOutputTokens:p.maxOutputTokens,timeoutMs:p.timeoutMs,pricing:p.pricing??null})),profiles:Object.fromEntries(profiles.map(p=>[p.id,summarize(results.filter(r=>r.profileId===p.id))])),splitProfiles:Object.fromEntries(splitNames.map(split=>[split,Object.fromEntries(profiles.map(p=>[p.id,summarize(results.filter(r=>r.profileId===p.id&&(r.annotation?.split??'unassigned')===split))]))])),validationFailures:results.filter(r=>r.status==='failed').map(r=>({profileId:r.profileId,caseId:r.caseId,errorType:r.errorType,issueCodes:r.issueCodes}))};
  const directory=path.join(root,'artifacts/evals',`${summary.createdAt.replace(/[:.]/g,'-')}-${options.mode}-${process.pid}`);
  await mkdir(directory,{recursive:true,mode:0o700});
  await writeFile(path.join(directory,'summary.json'),JSON.stringify(summary,null,2)+'\n',{mode:0o600});
  await writeFile(path.join(directory,'cases.json'),JSON.stringify(results,null,2)+'\n',{mode:0o600});
  const report=reportMarkdown(summary);await writeFile(path.join(directory,'report.md'),report,{mode:0o600});console.log(report);console.log(`Artifacts: ${path.relative(root,directory)}`);
  if(results.some(r=>r.status==='failed'||r.expected.guardReason&&r.guardReason!==r.expected.guardReason))process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  try {await main();} catch(error) {
    // Expected configuration messages are authored locally. Never echo arbitrary provider/DB errors.
    const safe=/^(Choose|Use |Profile |Invalid |Missing |Unknown benchmark|Limit |Concurrency |Retry |Live mode |Dry mode |DB datasets |Create the local|No registered|Set |The DB loader |Configure Supabase|Run the Supabase|Admin sign-in failed|Benchmark dataset |Unable to read|These versions |Duplicate dataset|No benchmark)/;
    console.error(error instanceof Error&&safe.test(error.message)?error.message:'Benchmark could not complete. Check configuration/dataset; raw errors and secrets were not printed.');process.exitCode=1;
  }
}
