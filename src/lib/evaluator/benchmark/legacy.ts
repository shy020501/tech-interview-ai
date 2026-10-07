import type { ProblemEvaluationPackage } from '../../../types/evaluation';
import type { CompactPackage, EvaluatorResult, FeedbackCategory } from '../contracts.ts';
import type { BenchmarkCase } from './contracts.ts';

/** M3 did not label intent. Do NOT invent ground-truth intent or score missing node labels. */
export function casesFromM3Examples(problem: CompactPackage, examples: ProblemEvaluationPackage['evaluationExamples']): BenchmarkCase[] {
  return examples.map(example => {
    const message={id:`benchmark-${example.id}`,sequence:1,content:example.response};
    const old=example.expectedResult;
    const evidence=(items:{messageId:string;quote?:string}[]) => items.filter(e=>e.quote&&example.response.includes(e.quote)).map(e=>({messageId:message.id,quote:e.quote!}));
    const rubricAssessments=old.rubricAssessments.map(a=>({...a,evidence:a.status==='unseen'?[]:evidence(a.evidence).length?evidence(a.evidence):[{messageId:message.id,quote:example.response}]}));
    let feedbackCategory:FeedbackCategory='insufficient_reasoning';
    if(old.detectedMisconceptions.length)feedbackCategory='possible_misconception';
    else if(rubricAssessments.some(a=>['confirmed','partial'].includes(a.status)))feedbackCategory='valid_progress';
    const mockOutput: EvaluatorResult={intent:'reasoning',rubricAssessments:rubricAssessments.map(({rubricNodeId,status,evidence})=>({rubricNodeId,status,evidence})),detectedMisconceptionIds:old.detectedMisconceptions.map(m=>m.misconceptionId),misconceptionEvidence:old.detectedMisconceptions.map(m=>({misconceptionId:m.misconceptionId,evidence:evidence(m.evidence).length?evidence(m.evidence):[{messageId:message.id,quote:example.response}]})),contradictions:[],needsEscalation:old.needsEscalation,escalationReason:old.needsEscalation?'ambiguous_evidence':null,feedbackCategory,clarification:null};
    return {id:`${problem.problemVersionId}:${example.id}`,source:'m3_example',tags:['legacy_labels'],problem,message,
      expected:{rubricStatuses:Object.fromEntries(old.rubricAssessments.map(a=>[a.rubricNodeId,a.status])),misconceptionIds:old.detectedMisconceptions.map(m=>m.misconceptionId),needsEscalation:old.needsEscalation},mockOutput};
  });
}
