import "server-only";
import type { EvaluationReview } from "@/types/evaluation";

// Evaluator QA fixtures only. Source/candidate runtime data now comes from Supabase.
export const evaluationReviews: EvaluationReview[] = [
  { id: "eval-reconstruction", problemVersionId: "pv-drone-1", userResponse: "Maybe the encoder should reconstruct the current observation.", result: { rubricAssessments: [
    { rubricNodeId: "drone_dynamics", status: "unseen", evidence: [] },
    { rubricNodeId: "drone_signal", status: "misconception", evidence: [{ messageId: "eval-message-1", quote: "reconstruct the current observation" }], explanation: "Mock evaluator prematurely assumes reconstruction is the only objective." },
  ], detectedMisconceptions: [{ misconceptionId: "drone_reconstruct_only", evidence: [{ messageId: "eval-message-1" }] }], contradictions: [], needsEscalation: false, escalationReason: null, feedbackCategory: "clarification_needed" }, humanReview: "not_reviewed", status: "needs_review", reviewNote: "Possible overreach: the response is tentative. A clarifying question may be more appropriate than a definitive misconception judgment." },
  { id: "eval-alternative", problemVersionId: "pv-drone-1", userResponse: "I would train the history encoder end-to-end with a control objective across randomized dynamics, then ablate the latent on held-out payloads.", result: { rubricAssessments: [
    { rubricNodeId: "drone_signal", status: "uncertain", evidence: [{ messageId: "eval-message-2", quote: "end-to-end with a control objective" }], explanation: "Mock evaluator misses a valid task-driven alternative because it expects a prediction objective." },
    { rubricNodeId: "drone_validation", status: "partial", evidence: [{ messageId: "eval-message-2", quote: "held-out payloads" }] },
  ], detectedMisconceptions: [], contradictions: [], needsEscalation: true, escalationReason: "Potential valid alternative outside the expected wording.", feedbackCategory: "clarification_needed" }, humanReview: "not_reviewed", status: "needs_review", reviewNote: "Check the accepted alternatives. Different objectives can be valid when the reasoning and validation support control-relevant adaptation." },
];
