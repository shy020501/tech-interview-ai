import { EvaluationError, unavailableUsage } from './contracts.ts';
import type { ErrorType, EvaluationInput, EvaluatorProfile, EvaluatorProvider, TokenUsage, ProviderDiagnostic } from './contracts.ts';
import { preGuard, defaultGuardConfig, type GuardContext, type GuardReason } from './guards.ts';
import { validateEvaluation, type ValidatedEvaluation } from './validation.ts';
import { shouldEscalate } from './escalation.ts';

export interface RequestObservation { latencyMs:number;usage:TokenUsage;errorType:ErrorType|null;schemaValid:boolean;semanticValid:boolean;providerDiagnostic?:ProviderDiagnostic }
export interface EvaluationRun {
  status:'valid'|'failed'|'guarded';value:ValidatedEvaluation|null;guardReason:GuardReason|null;
  errorType:ErrorType|null;issueCodes:string[];requests:RequestObservation[];
  latencyMs:number;retryCount:number;escalation:ReturnType<typeof shouldEscalate>;
}
export async function evaluate(input: EvaluationInput, provider: EvaluatorProvider, profile: EvaluatorProfile, options: {retry?:0|1;guardContext?:GuardContext;guardConfig?:typeof defaultGuardConfig} = {}): Promise<EvaluationRun> {
  const started=performance.now(); const requests: RequestObservation[]=[];
  const guard=preGuard(input.message.content,options.guardContext??{active:true},options.guardConfig);
  if(!guard.allowed)return {status:'guarded',value:null,guardReason:guard.reason,errorType:null,issueCodes:[],requests,latencyMs:performance.now()-started,retryCount:0,escalation:{recommended:false,reasons:[]}};
  const retry=options.retry??0;
  if(retry!==0&&retry!==1)throw new Error('At most one structured-output retry is allowed.');
  let errorType:ErrorType|null=null,issueCodes:string[]=[];
  for(let index=0;index<=retry;index++) {
    const start=performance.now();let usage=unavailableUsage();let schemaValid=false,semanticValid=false;
    let providerDiagnostic:ProviderDiagnostic|undefined;
    try {
      const response=await provider.evaluate(input,profile,{structuredRetry:index>0});usage=response.usage;
      const result=validateEvaluation(response.raw,input);schemaValid=result.schemaValid;semanticValid=result.semanticValid;
      if(result.ok) {
        requests.push({latencyMs:performance.now()-start,usage,errorType:null,schemaValid,semanticValid});
        return {status:'valid',value:result.value,guardReason:null,errorType:null,issueCodes:[],requests,latencyMs:performance.now()-started,retryCount:index,escalation:shouldEscalate(input,result.value.result)};
      }
      errorType=result.errorType;issueCodes=[...new Set(result.issues.map(i=>i.code))];
    } catch(error) {
      errorType=error instanceof EvaluationError?error.type:'internal_error';issueCodes=[];
      if(error instanceof EvaluationError)providerDiagnostic=error.providerDiagnostic;
    }
    requests.push({latencyMs:performance.now()-start,usage,errorType,schemaValid,semanticValid,...(providerDiagnostic?{providerDiagnostic}:{})});
    // Do not retry auth/rate/timeout failures or suspicious evidence. No strong-model call.
    if(!['malformed_output','schema_validation_error'].includes(errorType!))break;
  }
  return {status:'failed',value:null,guardReason:null,errorType,issueCodes,requests,latencyMs:performance.now()-started,retryCount:requests.length-1,escalation:shouldEscalate(input,null,errorType)};
}
