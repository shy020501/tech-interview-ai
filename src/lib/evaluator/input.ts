import type { ProblemEvaluationPackage } from '../../types/evaluation';
import type { ProblemPublic } from '../../types/problem';
import type { CompactPackage, EvaluationInput, EvaluationMessage, EvaluatorState } from './contracts.ts';

export const defaultInputLimits = { maxMessageChars: 4000, maxRecentMessages: 4, maxRecentChars: 6000, maxPackageChars: 40000, maxInputChars: 60000 };
export type InputLimits = typeof defaultInputLimits;

/** Explicit allowlist: no answer, ladder, examples, provenance or reviewer notes. */
export function buildCompactPackage(problem: Pick<ProblemPublic, 'id' | 'versionId' | 'scenario' | 'question' | 'assumptions'>, full: ProblemEvaluationPackage): CompactPackage {
  if (problem.versionId !== full.problemVersionId) throw new Error('Evaluation package version mismatch.');
  return {
    problemId: problem.id, problemVersionId: problem.versionId, scenario: problem.scenario,
    question: problem.question, assumptions: [...problem.assumptions],
    rubric: full.reasoningRubric.map(n => ({ id: n.id, label: n.label, criterion: n.sufficientEvidenceDescription || n.description, weight: n.weight, prerequisiteNodeIds: [...n.prerequisiteNodeIds] })),
    alternatives: full.acceptableAlternativeApproaches.map(a => ({ id: a.id, description: a.description, rubricNodeIds: [...a.rubricNodeIds] })),
    // These authored detection rules define when a misconception applies. They are
    // evaluation criteria, unlike administrative notes or reference answers.
    misconceptions: full.misconceptions.map(m => ({ id: m.id, label: m.title, criterion: m.description, ...(m.detectionNotes ? { detectionCriteria: m.detectionNotes } : {}), relatedRubricNodeIds: [...m.relatedRubricNodeIds] })),
    completion: { requiredNodeIds: [...full.completionCriteria.requiredNodeIds], alternativeNodeGroups: full.completionCriteria.alternativeNodeGroups.map(g => [...g]) },
  };
}
export function emptyState(problem: CompactPackage): EvaluatorState {
  return { contractVersion: 1, problemVersionId: problem.problemVersionId, revision: 0, lastSequence: 0, unresolvedNodeIds: [], nodes: Object.fromEntries(problem.rubric.map(n => [n.id, { status: 'unseen', supportingMessageIds: [], conflictingMessageIds: [], lastSequence: 0, assessmentIds: [] }])) };
}

/** Only user messages; whole messages are kept so evidence coordinates never silently change. */
export function selectContext(messages: EvaluationMessage[], current: EvaluationMessage, limits = defaultInputLimits, relevantIds: string[] = []): EvaluationMessage[] {
  const eligible = messages.filter(m => m.id !== current.id && m.sequence < current.sequence).sort((a,b) => b.sequence-a.sequence);
  const candidates = [...eligible.filter(m => relevantIds.includes(m.id)), ...eligible.filter(m => !relevantIds.includes(m.id))];
  const selected: EvaluationMessage[] = []; let chars = 0;
  for (const m of candidates) {
    if (selected.length >= limits.maxRecentMessages) break;
    if (chars + m.content.length > limits.maxRecentChars || selected.some(s => s.id === m.id)) continue;
    selected.push({ id: m.id, sequence: m.sequence, content: m.content }); chars += m.content.length;
  }
  return selected.sort((a,b) => a.sequence-b.sequence);
}
export function buildEvaluationInput(problem: CompactPackage, message: EvaluationMessage, options: { state?: EvaluatorState; recentContext?: EvaluationMessage[]; relevantMessageIds?: string[]; limits?: InputLimits; evaluationMode?: EvaluationInput['evaluationMode'] } = {}): EvaluationInput {
  const limits = options.limits ?? defaultInputLimits;
  if (!message.id || !Number.isSafeInteger(message.sequence) || message.sequence < 1 || !message.content.trim() || message.content.length > limits.maxMessageChars) throw new Error('Invalid or over-limit evaluation message.');
  if (JSON.stringify(problem).length > limits.maxPackageChars) throw new Error('Compact package exceeds configured budget; review the criteria.');
  const state = options.state ?? emptyState(problem);
  if (state.problemVersionId !== problem.problemVersionId) throw new Error('Reasoning state version mismatch.');
  const input: EvaluationInput = {
    contractVersion: 1, problem, state, message: { id: message.id, sequence: message.sequence, content: message.content },
    recentContext: selectContext(options.recentContext ?? [], message, limits, options.relevantMessageIds), evaluationMode: options.evaluationMode ?? 'default',
  };
  if (JSON.stringify(input).length > limits.maxInputChars) throw new Error('Evaluation input exceeds configured budget.');
  return input;
}
