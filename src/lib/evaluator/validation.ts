import type { EvaluationInput, EvaluatorResult, Evidence, ValidationIssue } from './contracts.ts';
import { parseResult } from './schema.ts';

const validated = new WeakSet<object>();
export interface ValidatedEvaluation {
  readonly result: EvaluatorResult;
  readonly problemVersionId: string;
  readonly messageId: string;
  readonly messageSequence: number;
  readonly basedOnRevision: number;
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
export function assertValidated(value: ValidatedEvaluation): void {
  if (!validated.has(value)) throw new Error('Only validated evaluator output can update reasoning state.');
}
export function semanticIssues(result: EvaluatorResult, input: EvaluationInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const issue = (code: string, path = '$') => issues.push({code,path});
  const nodes = new Set(input.problem.rubric.map(n => n.id));
  const messages = new Map([...input.recentContext,input.message].map(m => [m.id,m.content]));
  const checkEvidence = (items: Evidence[], path: string, required = true) => {
    if (required && !items.some(e => e.messageId === input.message.id && e.quote.trim())) issue('missing_current_evidence',path);
    for (const e of items) {
      if (!messages.has(e.messageId)) issue('unknown_evidence_message',path);
      else if (!e.quote.trim() || !messages.get(e.messageId)!.includes(e.quote)) issue('fabricated_evidence',path);
    }
  };
  const unique = (ids: string[], path: string) => { if (new Set(ids).size !== ids.length) issue('duplicate_id',path); };
  unique(result.rubricAssessments.map(a => a.rubricNodeId),'rubricAssessments');
  unique(result.detectedMisconceptionIds,'detectedMisconceptionIds');
  unique(result.misconceptionEvidence.map(m => m.misconceptionId),'misconceptionEvidence');
  const byNode = new Map(result.rubricAssessments.map(a => [a.rubricNodeId,a]));
  for (const a of result.rubricAssessments) {
    if (!nodes.has(a.rubricNodeId)) issue('unknown_rubric_id','rubricAssessments');
    checkEvidence(a.evidence,'rubricAssessments',a.status !== 'unseen');
    if (a.status === 'unseen' && a.evidence.length) issue('unseen_with_evidence','rubricAssessments');
    if (a.status === 'misconception' && !input.problem.misconceptions.some(m => result.detectedMisconceptionIds.includes(m.id) && m.relatedRubricNodeIds.includes(a.rubricNodeId))) issue('misconception_without_criterion','rubricAssessments');
    if (a.status === 'confirmed' && input.problem.misconceptions.some(m => result.detectedMisconceptionIds.includes(m.id) && m.relatedRubricNodeIds.includes(a.rubricNodeId))) issue('confirmed_with_misconception','rubricAssessments');
    if (a.status === 'partial' && input.problem.misconceptions.some(m => result.detectedMisconceptionIds.includes(m.id) && m.relatedRubricNodeIds.includes(a.rubricNodeId))) issue('partial_with_misconception','rubricAssessments');
    if (a.status === 'contradicted' && !result.contradictions.some(c => c.rubricNodeIds.includes(a.rubricNodeId))) issue('missing_contradiction','rubricAssessments');
  }
  for (const id of result.detectedMisconceptionIds) {
    const misconception = input.problem.misconceptions.find(m => m.id === id);
    if (!misconception) issue('unknown_misconception_id','detectedMisconceptionIds');
    else if (!misconception.relatedRubricNodeIds.some(node => ['misconception','contradicted'].includes(byNode.get(node)?.status ?? ''))) issue('unassessed_misconception','detectedMisconceptionIds');
    if (!result.misconceptionEvidence.some(e => e.misconceptionId === id)) issue('missing_misconception_evidence','misconceptionEvidence');
  }
  for (const m of result.misconceptionEvidence) {
    if (!result.detectedMisconceptionIds.includes(m.misconceptionId)) issue('unexpected_misconception_evidence','misconceptionEvidence');
    checkEvidence(m.evidence,'misconceptionEvidence');
  }
  for (const c of result.contradictions) {
    if (!c.rubricNodeIds.length) issue('empty_contradiction','contradictions');
    unique(c.rubricNodeIds,'contradictions'); checkEvidence(c.evidence,'contradictions');
    for (const id of c.rubricNodeIds) {
      if (!nodes.has(id)) issue('unknown_rubric_id','contradictions');
      if (byNode.get(id)?.status !== 'contradicted') issue('contradictory_status','contradictions');
    }
  }
  if (result.intent !== 'reasoning' && (result.rubricAssessments.length || result.detectedMisconceptionIds.length || result.contradictions.length || result.misconceptionEvidence.length)) issue('nonreasoning_progress');
  const categoryForIntent = { clarification:'clarification',meta_interview:'meta_interview',hint_request:'hint_requested_in_chat',direct_answer_request:'direct_answer_requested',off_topic:'off_topic',prompt_injection:'prompt_injection',uncertain:'uncertain' };
  if (result.intent !== 'reasoning' && result.feedbackCategory !== categoryForIntent[result.intent]) issue('intent_feedback_mismatch');
  if (result.intent === 'reasoning' && !['valid_progress','insufficient_reasoning','possible_misconception','contradiction','alternative_valid_path','uncertain'].includes(result.feedbackCategory)) issue('intent_feedback_mismatch');
  if (result.feedbackCategory === 'valid_progress' && !result.rubricAssessments.some(a => ['partial','confirmed'].includes(a.status))) issue('unsupported_progress');
  if (result.feedbackCategory === 'alternative_valid_path' && (!input.problem.alternatives.length || !result.rubricAssessments.some(a => ['partial','confirmed'].includes(a.status) && input.problem.alternatives.some(alt => alt.rubricNodeIds.includes(a.rubricNodeId))))) issue('unsupported_alternative','feedbackCategory');
  if (result.feedbackCategory === 'possible_misconception' && !result.detectedMisconceptionIds.length) issue('unsupported_misconception');
  if (result.feedbackCategory === 'contradiction' && !result.contradictions.length) issue('unsupported_contradiction');
  if (result.contradictions.length && result.feedbackCategory !== 'contradiction') issue('conflict_feedback_mismatch');
  if (result.detectedMisconceptionIds.length && !['possible_misconception','contradiction'].includes(result.feedbackCategory)) issue('misconception_feedback_mismatch');
  if ((result.intent === 'clarification') !== (result.clarification !== null)) issue('clarification_metadata_mismatch');
  if (result.needsEscalation !== (result.escalationReason !== null)) issue('escalation_reason_mismatch');
  if (result.intent === 'uncertain' && !result.needsEscalation) issue('uncertain_without_escalation');
  return issues;
}
export function validateEvaluation(raw: string, input: EvaluationInput) {
  const parsed = parseResult(raw);
  if (!parsed.ok) return {...parsed,schemaValid:false,semanticValid:false} as const;
  const issues = semanticIssues(parsed.result,input);
  if (issues.length) return {ok:false,errorType:'semantic_validation_error',issues,schemaValid:true,semanticValid:false} as const;
  // Freeze a fresh copy; a caller cannot mutate the validated result afterwards.
  const value: ValidatedEvaluation = freeze({ result: structuredClone(parsed.result), problemVersionId: input.problem.problemVersionId, messageId: input.message.id, messageSequence: input.message.sequence, basedOnRevision: input.state.revision });
  validated.add(value);
  return {ok:true,value,schemaValid:true,semanticValid:true} as const;
}
