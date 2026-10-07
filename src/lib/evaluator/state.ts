import { statuses, type CompactPackage, type CompletionCriteria, type EvaluatorState, type NodeStatus } from './contracts.ts';
import type { Hint } from '../../types/evaluation';
import { assertValidated, type ValidatedEvaluation } from './validation.ts';

export function reduceReasoningState(previous: EvaluatorState, assessment: ValidatedEvaluation, assessmentId: string) {
  assertValidated(assessment);
  if (assessment.problemVersionId !== previous.problemVersionId) throw new Error('Assessment version mismatch.');
  if (assessment.messageSequence <= previous.lastSequence) return {state:previous,applied:false,reason:'stale_sequence' as const};
  if (assessment.basedOnRevision !== previous.revision) return {state:previous,applied:false,reason:'stale_revision' as const};
  if (!assessmentId) throw new Error('Assessment ID is required.');
  const state = structuredClone(previous);
  state.lastSequence = assessment.messageSequence; state.revision++;
  for (const a of assessment.result.rubricAssessments) {
    const node = state.nodes[a.rubricNodeId];
    if (!node) throw new Error('Unknown state node.');
    // 'unseen' means no new evidence, never erase previously observed reasoning.
    if (a.status === 'unseen') continue;
    node.status = a.status; node.lastSequence = assessment.messageSequence;
    node.assessmentIds = [...new Set([...node.assessmentIds,assessmentId])];
    const ids = a.evidence.map(e => e.messageId);
    if (a.status === 'confirmed' || a.status === 'partial') node.supportingMessageIds = [...new Set([...node.supportingMessageIds,...ids])];
    else node.conflictingMessageIds = [...new Set([...node.conflictingMessageIds,...ids])];
    // A new supported correction can resolve a conflict. Historical evidence is retained.
    state.unresolvedNodeIds = state.unresolvedNodeIds.filter(id => id !== a.rubricNodeId);
    if (a.status === 'contradicted' || a.status === 'uncertain') state.unresolvedNodeIds.push(a.rubricNodeId);
  }
  return {state,applied:true,reason:null};
}
export const defaultContributions: Record<NodeStatus,number> = { unseen:0,partial:0.5,confirmed:1,misconception:0,uncertain:0,contradicted:0 };
export function calculateProgress(problem: CompactPackage, state: EvaluatorState, contributions = defaultContributions): number {
  if (state.problemVersionId !== problem.problemVersionId) throw new Error('Progress version mismatch.');
  if (statuses.some(status => !Number.isFinite(contributions[status]) || contributions[status] < 0 || contributions[status] > 1)) throw new Error('Contributions must be between zero and one.');
  let total = 0, earned = 0;
  for (const n of problem.rubric) {
    if (!Number.isFinite(n.weight) || n.weight < 0) throw new Error('Invalid rubric weight.');
    total += n.weight; earned += n.weight * contributions[state.nodes[n.id]?.status ?? 'unseen'];
  }
  return total === 0 ? 0 : Math.round(earned/total*10000)/100;
}
export function isComplete(state: EvaluatorState, criteria: Pick<CompletionCriteria,'requiredNodeIds'|'alternativeNodeGroups'>): boolean {
  if (!criteria.requiredNodeIds.length && !criteria.alternativeNodeGroups.length) return false;
  const confirmed = (id: string) => state.nodes[id]?.status === 'confirmed' && !state.unresolvedNodeIds.includes(id);
  return criteria.requiredNodeIds.every(confirmed) && (!criteria.alternativeNodeGroups.length || criteria.alternativeNodeGroups.some(g => g.length > 0 && g.every(confirmed)));
}

/** Shared pure selector: benchmarks and the gated M4-B hint service use this policy. */
export function selectHintTarget(problem: CompactPackage, state: EvaluatorState, hints: Hint[], usedHintIds: string[]): {rubricNodeId:string;hintId:string} | null {
  if (state.problemVersionId !== problem.problemVersionId) throw new Error('Hint target version mismatch.');
  const byId = new Map(problem.rubric.map(n => [n.id,n]));
  const confirmed = (id: string) => state.nodes[id]?.status === 'confirmed';
  const blockers = new Set(problem.rubric.filter(n => ['misconception','contradicted','uncertain'].includes(state.nodes[n.id]?.status)).map(n => n.id));
  const targets: string[] = [];
  const seen = new Set<string>();
  function visit(id: string) {
    if (seen.has(id) || confirmed(id)) return;
    seen.add(id);
    const node = byId.get(id); if (!node) return;
    const missing = node.prerequisiteNodeIds.filter(p => !confirmed(p));
    if (missing.length) missing.forEach(visit); else targets.push(id);
  }
  [...blockers,...problem.rubric.map(n => n.id)].forEach(visit);
  for (const id of targets) {
    const next = hints.filter(h => h.targetRubricNodeId === id && !usedHintIds.includes(h.id)).sort((a,b) => a.level-b.level)[0];
    if (next) return {rubricNodeId:id,hintId:next.id};
  }
  return null;
}
