import type { EvaluatorProvider, EvaluatorProfile, EvaluatorState, EvaluationMessage, EvaluationInput, EvaluatorResult } from '../contracts.ts';
import type { ProblemEvaluationPackage } from '../../../types/evaluation';
import type { ProblemPublic } from '../../../types/problem';
import type { LiveConfig } from './config.ts';
import { buildCompactPackage, buildEvaluationInput, emptyState, defaultInputLimits } from '../input.ts';
import { evaluate, type EvaluationRun } from '../engine.ts';
import { defaultGuardConfig } from '../guards.ts';
import { calculateProgress, isComplete, reduceReasoningState, selectHintTarget } from '../state.ts';
import { estimateCost } from '../benchmark/metrics.ts';
import { gradingPolicyVersion } from '../grading-policy.ts';
import { controlledFeedback, unavailableFeedback, unreliableFeedback } from './feedback.ts';
import { createHash } from 'node:crypto';

export interface LiveContext {
 attemptId:string;state:EvaluatorState|{revision:number};progress:number;
 problem:Pick<ProblemPublic,'id'|'versionId'|'scenario'|'question'|'assumptions'>;
 package:ProblemEvaluationPackage;message:EvaluationMessage;recentContext:EvaluationMessage[];usedHints:{hintId:string;text:string}[];
}
export interface OperationResult {guard?:string;duplicate?:boolean;evaluationId?:string;claimToken?:string;context?:LiveContext;runId?:string;ok?:boolean}
export interface RuntimeStore { operation(name:string,attemptId:string,data:Record<string,unknown>):Promise<OperationResult> }
export interface RuntimeDependencies {store:RuntimeStore;config:LiveConfig;provider:(role:'primary'|'escalation')=>EvaluatorProvider}
function inputFrom(context:LiveContext,config:LiveConfig):EvaluationInput {
 const compact=buildCompactPackage(context.problem,context.package);
 const state='contractVersion' in context.state?context.state:emptyState(compact);
 const input=buildEvaluationInput(compact,context.message,{state,recentContext:context.recentContext,limits:{...defaultInputLimits,maxMessageChars:config.limits.maxMessageChars}});
 // Only already-released hints, with explicit provenance; never the hidden ladder.
 const revealedHints: NonNullable<EvaluationInput['revealedHints']>=[];
 for(const hint of context.usedHints.slice(-4)){
  const next=[...revealedHints,{hintId:hint.hintId,text:hint.text}];
  if(JSON.stringify({...input,revealedHints:next}).length<=defaultInputLimits.maxInputChars)revealedHints.push(next[next.length-1]);
 }
 if(revealedHints.length)input.revealedHints=revealedHints;
 return input;
}
const isUnreliable=(result:EvaluatorResult)=>result.intent==='uncertain'||result.needsEscalation&&['unknown_approach','ambiguous_evidence','uncertain_intent'].includes(result.escalationReason??'');
/** Same evaluator/validators/reducer as CLI. No raw provider output reaches this API. */
export async function processMessage(deps:RuntimeDependencies,attemptId:string,requestId:string,content?:string,retryEvaluationId?:string) {
 const {store,config}=deps;
 const claim=await store.operation('claim',attemptId,{requestId,content,retryEvaluationId,mode:config.mode,limits:config.limits});
 if(claim.guard||claim.duplicate)return claim;
 if(!claim.context||!claim.evaluationId||!claim.claimToken)throw new Error('Invalid evaluation claim.');
 const binding={evaluationId:claim.evaluationId,claimToken:claim.claimToken};
 let finalRunId:string|null=null;
 let failure='internal_error';
 let input:EvaluationInput;
 try { input=inputFrom(claim.context,config); } catch {
  await store.operation('finalize',attemptId,{...binding,status:'failed',state:null,finalRunId:null,errorType:'input_unavailable',feedback:unavailableFeedback,limits:config.limits});return {ok:true};
 }
 async function call(role:'primary'|'escalation',profile:EvaluatorProfile,reasons:string[]):Promise<EvaluationRun> {
  let run:EvaluationRun|undefined;
  for(let i=0;i<=config.limits.structuredRetries;i++){
   const reserved=await store.operation('reserve_run',attemptId,{...binding,role,callIndex:i,profile:config.mode==='mock'?'development-mock':profile.id,
    provider:config.mode==='mock'?'mock':profile.providerType,model:config.mode==='mock'?'scripted-fixture':profile.model,
    policyVersion:gradingPolicyVersion,schemaVersion:'1',profileVersion:createHash('sha256').update(JSON.stringify(profile)).digest('hex'),limits:config.limits,reasons,revealedHintIds:input.revealedHints?.map(h=>h.hintId)??[],recentMessageIds:input.recentContext.map(m=>m.id)});
   if(reserved.guard||!reserved.runId)throw new Error(reserved.guard??'logging_unavailable');
   const provider=deps.provider(role);
   run=await evaluate(input,{evaluate:(value,p)=>provider.evaluate(value,p,{structuredRetry:i>0})},profile,{retry:0,guardConfig:{...defaultGuardConfig,maxMessageChars:config.limits.maxMessageChars}});
   const observation=run.requests[0];
   if(!observation)throw new Error('internal_error');
   const cost=estimateCost([observation.usage],profile);
   const saved=await store.operation('finish_run',attemptId,{...binding,runId:reserved.runId,result:run.value?.result??null,errorType:run.errorType,
    schemaValid:observation.schemaValid,semanticValid:observation.semanticValid,issueCodes:run.issueCodes,
    inputTokens:observation.usage.inputTokens,outputTokens:observation.usage.outputTokens,cachedTokens:observation.usage.cachedInputTokens,usageStatus:observation.usage.status,
    latencyMs:run.latencyMs,estimatedCost:config.mode==='mock'?0:cost.amount,costStatus:config.mode==='mock'?'no_provider_request':cost.usageStatus});
   if(saved.guard)throw new Error(saved.guard);
   finalRunId=reserved.runId;
   if(run.value||!['malformed_output','schema_validation_error'].includes(run.errorType??''))break;
  }
  return run!;
 }
 try {
  let run=await call('primary',config.primary,[]);
  if(run.escalation.recommended)run=await call('escalation',config.escalation,run.escalation.reasons);
  failure=run.errorType??'unreliable_evaluation';
  if(run.value&&!isUnreliable(run.value.result)){
   const reasoning=run.value.result.intent==='reasoning';
   const state=reasoning?reduceReasoningState(input.state,run.value,finalRunId!).state:null;
   const result=await store.operation('finalize',attemptId,{...binding,status:'succeeded',finalRunId,state,
    progress:state?calculateProgress(input.problem,state):claim.context.progress,coreComplete:state?isComplete(state,input.problem.completion):false,
    feedback:controlledFeedback(run.value.result,input.problem,input.message.content),errorType:null,limits:config.limits});
   return result;
  }
 } catch(error) {
  const safe=['request_quota','escalation_quota','stale_evaluation','logging_unavailable'];
  failure=error instanceof Error&&safe.includes(error.message)?error.message:'internal_error';
 }
 return store.operation('finalize',attemptId,{...binding,status:'failed',state:null,finalRunId,errorType:failure,
  feedback:failure==='unreliable_evaluation'?unreliableFeedback:unavailableFeedback,limits:config.limits});
}
export async function deliverHint(store:RuntimeStore,attemptId:string,requestId:string){
 const result=await store.operation('hint_context',attemptId,{requestId});
 if(result.guard||result.duplicate)return result;
 const context=result as unknown as LiveContext;
 const problem=buildCompactPackage(context.problem,context.package);
 const state='contractVersion' in context.state?context.state:emptyState(problem);
 const hint=selectHintTarget(problem,state,context.package.hintLadder,context.usedHints.map(h=>h.hintId));
 if(!hint)return {guard:'hints_unavailable'};
 return store.operation('hint_commit',attemptId,{requestId,hintId:hint.hintId,revision:state.revision});
}
