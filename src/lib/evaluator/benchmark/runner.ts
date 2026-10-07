import { buildEvaluationInput, emptyState } from '../input.ts';
import { defaultGuardConfig, preGuard } from '../guards.ts';
import { evaluate } from '../engine.ts';
import { calculateProgress, isComplete, reduceReasoningState } from '../state.ts';
import { estimateCost } from './metrics.ts';
import type { EvaluationInput, EvaluatorProfile, EvaluatorProvider } from '../contracts.ts';
import type { BenchmarkCase, CaseReport } from './contracts.ts';

function prepareInput(testCase: BenchmarkCase, maxMessageChars:number): EvaluationInput {
  const guardConfig={...defaultGuardConfig,maxMessageChars};
  const allowed=preGuard(testCase.message.content,testCase.guardContext??{active:true},guardConfig).allowed;
  return allowed?buildEvaluationInput(testCase.problem,testCase.message,{state:testCase.initialState,recentContext:testCase.recentContext,evaluationMode:testCase.evaluationMode,limits:{maxMessageChars,maxRecentMessages:4,maxRecentChars:6000,maxPackageChars:40000,maxInputChars:60000}}):{contractVersion:1,problem:testCase.problem,state:testCase.initialState??emptyState(testCase.problem),message:testCase.message,recentContext:[],evaluationMode:'default'};
}
export async function runCase(testCase: BenchmarkCase, profile: EvaluatorProfile, provider: EvaluatorProvider, retry:0|1=0, maxMessageChars=4000): Promise<CaseReport> {
  const input=prepareInput(testCase,maxMessageChars);
  const run=await evaluate(input,provider,profile,{retry,guardContext:testCase.guardContext,guardConfig:{...defaultGuardConfig,maxMessageChars}});
  let progress:number|null=null,complete:boolean|null=null;
  if(run.value) {
    const reduced=reduceReasoningState(input.state,run.value,`${testCase.id}:${input.message.sequence}`);
    progress=calculateProgress(input.problem,reduced.state);complete=isComplete(reduced.state,input.problem.completion);
  }
  const result=run.value?.result;
  return {
    caseId:testCase.id,source:testCase.source,tags:testCase.tags,profileId:profile.id,problemVersionId:input.problem.problemVersionId,
    ...(testCase.annotation ? { annotation: {datasetVersion:testCase.annotation.datasetVersion,split:testCase.annotation.split,family:testCase.annotation.family,author:testCase.annotation.author,reviewStatus:testCase.annotation.reviewStatus,reviewPriority:testCase.annotation.reviewPriority} } : {}),
    rubricNodeCount:input.problem.rubric.length,
    expected:testCase.expected,status:run.status,guardReason:run.guardReason,errorType:run.errorType,issueCodes:run.issueCodes,requests:run.requests,retryCount:run.retryCount,latencyMs:run.latencyMs,escalation:run.escalation,
    predicted:result?{intent:result.intent,rubricStatuses:Object.fromEntries(result.rubricAssessments.map(a=>[a.rubricNodeId,a.status])),misconceptionIds:result.detectedMisconceptionIds,needsEscalation:result.needsEscalation}:null,
    evidenceRequirementsMet:testCase.expected.evidenceRequiredFor?!!result&&testCase.expected.evidenceRequiredFor.every(id=>result.rubricAssessments.some(a=>a.rubricNodeId===id&&a.evidence.some(e=>e.messageId===input.message.id))):null,
    progress,complete,cost:estimateCost(run.requests.map(r=>r.usage),profile),
  };
}
export async function runBenchmark(cases: BenchmarkCase[], profiles: EvaluatorProfile[], providerFor: (profile:EvaluatorProfile,testCase:BenchmarkCase)=>EvaluatorProvider, options:{concurrency?:number;retry?:0|1;maxMessageChars?:number}={}) {
  const concurrency=options.concurrency??1;
  if(!Number.isInteger(concurrency)||concurrency<1||concurrency>4)throw new Error('Benchmark concurrency must be between 1 and 4.');
  // Detect dataset/configuration failures before ANY provider starts charging.
  for(const c of cases)prepareInput(c,options.maxMessageChars??4000);
  const tasks=profiles.flatMap(profile=>cases.map(testCase=>({profile,testCase}))),results:CaseReport[]=new Array(tasks.length);
  let next=0;
  await Promise.all(Array.from({length:Math.min(concurrency,tasks.length)},async()=>{
    while(next<tasks.length){const index=next++,{profile,testCase}=tasks[index];results[index]=await runCase(testCase,profile,providerFor(profile,testCase),options.retry,options.maxMessageChars);}
  }));
  return results;
}
