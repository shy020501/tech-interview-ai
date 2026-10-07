import type { ErrorType, EvaluationInput, EvaluatorResult } from './contracts.ts';
export const defaultEscalationPolicy = { onComplex:true, onContradiction:true, onStateConflict:true };
export function shouldEscalate(input: EvaluationInput, result: EvaluatorResult | null, errorType: ErrorType | null = null, policy = defaultEscalationPolicy) {
  const reasons: string[] = [];
  if (errorType && ['malformed_output','schema_validation_error','semantic_validation_error'].includes(errorType)) reasons.push(errorType);
  if (input.evaluationMode === 'strong_only' || (policy.onComplex && input.evaluationMode === 'complex')) reasons.push('problem_profile');
  if (result?.needsEscalation) reasons.push(result.escalationReason ?? 'model_requested');
  if (result?.intent === 'uncertain') reasons.push('uncertain_intent');
  if (policy.onContradiction && result?.contradictions.length) reasons.push('contradiction');
  if (policy.onStateConflict && result?.rubricAssessments.some(a => input.state.nodes[a.rubricNodeId]?.status === 'confirmed' && ['contradicted','uncertain','misconception','partial'].includes(a.status))) reasons.push('previous_state_conflict');
  return {recommended:reasons.length>0,reasons:[...new Set(reasons)]};
}
