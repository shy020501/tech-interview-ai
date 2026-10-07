import type { ProblemEvaluationPackage } from '../../types/evaluation';

// Versioned separately from M3's persisted authoring examples. Never a client DTO.
export const intents = ['reasoning', 'clarification', 'meta_interview', 'hint_request', 'direct_answer_request', 'off_topic', 'prompt_injection', 'uncertain'] as const;
export const statuses = ['unseen', 'partial', 'confirmed', 'misconception', 'uncertain', 'contradicted'] as const;
export const feedbackCategories = ['valid_progress', 'insufficient_reasoning', 'possible_misconception', 'contradiction', 'alternative_valid_path', 'clarification', 'meta_interview', 'hint_requested_in_chat', 'direct_answer_requested', 'off_topic', 'prompt_injection', 'uncertain'] as const;
export const escalationReasons = ['unknown_approach', 'ambiguous_evidence', 'state_conflict', 'uncertain_intent', 'technical_challenge'] as const;
export type Intent = typeof intents[number];
export type NodeStatus = typeof statuses[number];
export type FeedbackCategory = typeof feedbackCategories[number];
export const evaluationModes = ['default', 'complex', 'strong_only'] as const;
export type EvaluationMode = typeof evaluationModes[number];
export const reasoningEfforts = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
export type ReasoningEffort = typeof reasoningEfforts[number];
export interface Evidence { messageId: string; quote: string }
export interface Assessment { rubricNodeId: string; status: NodeStatus; evidence: Evidence[] }
export interface EvaluatorResult {
  intent: Intent;
  rubricAssessments: Assessment[];
  detectedMisconceptionIds: string[];
  misconceptionEvidence: { misconceptionId: string; evidence: Evidence[] }[];
  contradictions: { rubricNodeIds: string[]; evidence: Evidence[] }[];
  needsEscalation: boolean;
  escalationReason: typeof escalationReasons[number] | null;
  feedbackCategory: FeedbackCategory;
  clarification: { kind: 'assumption' | 'scope' | 'technical_challenge' | 'other'; relatedToProblem: boolean } | null;
}
export type CompletionCriteria = ProblemEvaluationPackage['completionCriteria'];
export interface CompactPackage {
  problemId: string; problemVersionId: string; scenario: string; question: string; assumptions: string[];
  rubric: { id: string; label: string; criterion: string; weight: number; prerequisiteNodeIds: string[] }[];
  alternatives: { id: string; description: string; rubricNodeIds: string[] }[];
  misconceptions: { id: string; label?: string; criterion: string; detectionCriteria?: string; relatedRubricNodeIds: string[] }[];
  completion: Pick<CompletionCriteria, 'requiredNodeIds' | 'alternativeNodeGroups'>;
}
export interface EvaluationMessage { id: string; sequence: number; content: string }
export interface NodeState {
  status: NodeStatus; supportingMessageIds: string[]; conflictingMessageIds: string[];
  lastSequence: number; assessmentIds: string[];
}
export interface EvaluatorState {
  contractVersion: 1; problemVersionId: string; revision: number; lastSequence: number;
  nodes: Record<string, NodeState>; unresolvedNodeIds: string[];
}
export interface EvaluationInput {
  contractVersion: 1; problem: CompactPackage; state: EvaluatorState;
  message: EvaluationMessage; recentContext: EvaluationMessage[];
  evaluationMode: EvaluationMode;
  /** Already released system hints, never user-authored evidence or the full ladder. */
  revealedHints?: {hintId:string;text:string}[];
}
export interface EvaluatorProfile {
  id: string; providerType: string; model: string; baseUrlEnv: string; apiKeyEnv: string;
  maxOutputTokens: number; timeoutMs: number; enabled: boolean;
  reasoningEffort?: ReasoningEffort;
  role: 'primary_candidate' | 'escalation_candidate' | 'benchmark_only';
  capabilities: {
    supportsJsonSchema: boolean; supportsJsonMode: boolean; supportsUsageReporting: boolean;
    supportsTemperature: boolean; outputTokenParameter: 'max_tokens' | 'max_completion_tokens';
    // Opt in only to values verified for this model/provider. Omit for other providers.
    supportedReasoningEfforts?: ReasoningEffort[];
  };
  // Header values, too, live only in environment variables, never in the registry/artifacts.
  headerEnv?: Record<string, string>;
  pricing?: { currency: 'USD'; inputPerMillion: number; outputPerMillion: number; cachedInputPerMillion?: number; asOf: string };
}
export interface EvaluatorRegistry {
  profiles: EvaluatorProfile[];
  selection?: { defaultProfileId: string; difficultProfileId: string };
}
export interface TokenUsage {
  status: 'exact' | 'estimated' | 'unavailable';
  inputTokens: number | null; outputTokens: number | null; cachedInputTokens: number | null;
}
export const unavailableUsage = (): TokenUsage => ({ status: 'unavailable', inputTokens: null, outputTokens: null, cachedInputTokens: null });
export interface ProviderEvaluationResponse { raw: string; usage: TokenUsage }
export interface EvaluatorProvider {
  evaluate(input: EvaluationInput, profile: EvaluatorProfile, options?: { structuredRetry: boolean }): Promise<ProviderEvaluationResponse>;
}
export type ErrorType = 'provider_timeout' | 'provider_rate_limit' | 'provider_auth_error' | 'provider_error' | 'malformed_output' | 'schema_validation_error' | 'semantic_validation_error' | 'internal_error';
// Transport diagnostics contain only an HTTP status and allowlisted identifiers, never error prose.
export interface ProviderDiagnostic { httpStatus: number; code: string | null; type: string | null; param: string | null }
export class EvaluationError extends Error {
  readonly type: ErrorType;
  readonly providerDiagnostic?: ProviderDiagnostic;
  constructor(type: ErrorType, providerDiagnostic?: ProviderDiagnostic) {
    super(type); this.type = type;
    if (providerDiagnostic) this.providerDiagnostic = Object.freeze({ ...providerDiagnostic });
  }
}
export interface ValidationIssue { code: string; path: string }
export interface AssessmentRunMetadata {
  id: string; profileId: string; providerType: string; model: string; problemVersionId: string;
  reasoningEffort?: ReasoningEffort;
  benchmarkCaseId?: string; attemptId?: string; messageId?: string;
  humanReview?: 'not_reviewed' | 'correct' | 'incorrect' | 'partially_incorrect';
}
