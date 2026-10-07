import type { EvaluatorProfile, TokenUsage } from '../contracts.ts';
import { statuses } from '../contracts.ts';
import type { CaseReport } from './contracts.ts';

export function estimateCost(usages: TokenUsage[], profile: EvaluatorProfile): CaseReport['cost'] {
  const unknown=(reason:string):CaseReport['cost']=>({amount:null,currency:'USD',usageStatus:'unavailable',reason});
  if(!usages.length)return {amount:0,currency:'USD',usageStatus:'exact',reason:'no_provider_request'};
  if(!profile.pricing)return unknown('pricing_unavailable');
  let amount=0;
  for(const u of usages) {
    if(u.status==='unavailable'||u.inputTokens===null||u.outputTokens===null)return unknown('usage_unavailable');
    const p=profile.pricing;
    if(p.cachedInputPerMillion!==undefined&&p.cachedInputPerMillion!==p.inputPerMillion&&u.cachedInputTokens===null)return unknown('cached_usage_unavailable');
    const cached=u.cachedInputTokens??0;
    amount+=((u.inputTokens-cached)*p.inputPerMillion+cached*(p.cachedInputPerMillion??p.inputPerMillion)+u.outputTokens*p.outputPerMillion)/1_000_000;
  }
  return {amount,currency:'USD',usageStatus:usages.some(u=>u.status==='estimated')?'estimated':'exact',reason:null};
}
const fraction=(numerator:number,denominator:number)=>({numerator,denominator,value:denominator?numerator/denominator:null});
function percentile(values:number[],quantile:number) {const sorted=[...values].sort((a,b)=>a-b);return sorted.length?sorted[Math.max(0,Math.ceil(sorted.length*quantile)-1)]:null;}
export function summarize(cases: CaseReport[]) {
  const attempted=cases.filter(c=>c.status!=='guarded'),valid=attempted.filter(c=>c.status==='valid'),requests=cases.flatMap(c=>c.requests);
  const intentCases=attempted.filter(c=>c.expected.intent!==undefined);
  const detection=(intent:string)=>{
    const positives=intentCases.filter(c=>c.expected.intent===intent),negatives=intentCases.filter(c=>c.expected.intent!==intent);
    return {accuracy:fraction(positives.filter(c=>c.predicted?.intent===intent).length+negatives.filter(c=>c.predicted&&c.predicted.intent!==intent).length,intentCases.length),recall:fraction(positives.filter(c=>c.predicted?.intent===intent).length,positives.length),falsePositiveRate:fraction(negatives.filter(c=>c.predicted?.intent===intent).length,negatives.length)};
  };
  let nodeTotal=0,nodeCorrect=0,negativeNodes=0,positiveNodes=0,falsePositive=0,falseNegative=0,mt=0,mp=0,mf=0,possibleNodes=0,unscoredConfirmed=0;
  const statusCounts=Object.fromEntries(statuses.map(status=>[status,{correct:0,total:0}]));
  for(const c of attempted) {
    if(c.expected.intent==='reasoning'||Object.keys(c.expected.rubricStatuses).length)possibleNodes+=c.rubricNodeCount;
    unscoredConfirmed+=Object.entries(c.predicted?.rubricStatuses??{}).filter(([id,status])=>status==='confirmed'&&!Object.hasOwn(c.expected.rubricStatuses,id)).length;
    for(const [id,status] of Object.entries(c.expected.rubricStatuses)) {
      // Unspecified prediction = unseen ONLY for a valid reasoning result. Invalid is not a correct label.
      const predicted=c.predicted?.intent==='reasoning'?(c.predicted.rubricStatuses[id]??'unseen'):null;
      nodeTotal++;if(predicted===status)nodeCorrect++;
      statusCounts[status].total++;if(predicted===status)statusCounts[status].correct++;
      if(status==='confirmed'){positiveNodes++;if(predicted!=='confirmed')falseNegative++;}
      else{negativeNodes++;if(predicted==='confirmed')falsePositive++;}
    }
    if(c.expected.misconceptionIds!==undefined) {
      const expected=new Set(c.expected.misconceptionIds),predicted=new Set(c.predicted?.misconceptionIds??[]);
      for(const id of predicted) {if(expected.has(id))mt++;else mp++;}
      for(const id of expected)if(!predicted.has(id))mf++;
    }
  }
  const escalationCases=attempted.filter(c=>c.expected.needsEscalation!==undefined),needs=escalationCases.filter(c=>c.expected.needsEscalation),doesnt=escalationCases.filter(c=>!c.expected.needsEscalation);
  const latency=attempted.map(c=>c.latencyMs),knownCosts=attempted.filter(c=>c.cost.amount!==null),knownUsage=requests.filter(r=>r.usage.status!=='unavailable');
  const guards=cases.filter(c=>c.expected.guardReason!==undefined);
  const providerFailures: { errorType: string; httpStatus: number | null; code: string | null; type: string | null; param: string | null; count: number }[] = [];
  for (const request of requests.filter(r=>r.errorType?.startsWith('provider_'))) {
    const d=request.providerDiagnostic;
    const failure={errorType:request.errorType!,httpStatus:d?.httpStatus??null,code:d?.code??null,type:d?.type??null,param:d?.param??null};
    const existing=providerFailures.find(f=>f.errorType===failure.errorType&&f.httpStatus===failure.httpStatus&&f.code===failure.code&&f.type===failure.type&&f.param===failure.param);
    if(existing)existing.count++;else providerFailures.push({...failure,count:1});
  }
  return {
    counts:{cases:cases.length,attempted:attempted.length,valid:valid.length,guarded:cases.length-attempted.length,providerRequests:requests.length},
    providerFailures,
    intentAccuracy:fraction(intentCases.filter(c=>c.predicted?.intent===c.expected.intent).length,intentCases.length),
    intentDetection:Object.fromEntries(['off_topic','prompt_injection','direct_answer_request','clarification','meta_interview','hint_request','reasoning','uncertain'].map(i=>[i,detection(i)])),
    rubricStatusAccuracy:fraction(nodeCorrect,nodeTotal),confirmedFalsePositiveRate:fraction(falsePositive,negativeNodes),confirmedFalseNegativeRate:fraction(falseNegative,positiveNodes),
    rubricLabelCoverage:fraction(nodeTotal,possibleNodes),unscoredConfirmedPredictions:unscoredConfirmed,
    rubricByExpectedStatus:Object.fromEntries(statuses.map(status=>[status,fraction(statusCounts[status].correct,statusCounts[status].total)])),
    annotationReview:{needsHumanReview:cases.filter(c=>c.annotation?.reviewStatus==='needs_human_review').length,untracked:cases.filter(c=>!c.annotation).length},
    misconceptionPrecision:fraction(mt,mt+mp),misconceptionRecall:fraction(mt,mt+mf),
    expectedEscalationRecall:fraction(needs.filter(c=>c.escalation.recommended).length,needs.length),unnecessaryEscalationRate:fraction(doesnt.filter(c=>c.escalation.recommended).length,doesnt.length),
    schemaFailureRate:fraction(requests.filter(r=>['malformed_output','schema_validation_error'].includes(r.errorType??'')).length,requests.length),
    semanticFailureRate:fraction(requests.filter(r=>r.errorType==='semantic_validation_error').length,requests.length),
    retryRate:fraction(attempted.filter(c=>c.retryCount>0).length,attempted.length),providerErrorRate:fraction(requests.filter(r=>r.errorType?.startsWith('provider_')).length,requests.length),
    internalErrorRate:fraction(requests.filter(r=>r.errorType==='internal_error').length,requests.length),validResultRate:fraction(valid.length,attempted.length),
    guardAccuracy:fraction(guards.filter(c=>c.guardReason===c.expected.guardReason&&c.requests.length===0).length,guards.length),
    evidenceRequirementAccuracy:fraction(attempted.filter(c=>c.evidenceRequirementsMet===true).length,attempted.filter(c=>c.evidenceRequirementsMet!==null).length),
    latencyMs:{average:latency.length?latency.reduce((a,b)=>a+b,0)/latency.length:null,p50:percentile(latency,0.5),p95:percentile(latency,0.95)},
    tokens:{knownRequests:knownUsage.length,unavailableRequests:requests.length-knownUsage.length,input:knownUsage.reduce((s,r)=>s+(r.usage.inputTokens??0),0),output:knownUsage.reduce((s,r)=>s+(r.usage.outputTokens??0),0),cachedInput:knownUsage.some(r=>r.usage.cachedInputTokens!==null)?knownUsage.reduce((s,r)=>s+(r.usage.cachedInputTokens??0),0):null},
    estimatedCostUSD:{knownEvaluations:knownCosts.length,unavailableEvaluations:attempted.length-knownCosts.length,knownSubtotal:knownCosts.reduce((s,c)=>s+c.cost.amount!,0),averagePerKnownEvaluation:knownCosts.length?knownCosts.reduce((s,c)=>s+c.cost.amount!,0)/knownCosts.length:null,total:knownCosts.length===attempted.length?knownCosts.reduce((s,c)=>s+c.cost.amount!,0):null},
  };
}
