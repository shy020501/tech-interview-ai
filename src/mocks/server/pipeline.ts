import "server-only";
import type { SourceCandidate, QuestionCandidate } from "@/types/source";
import type { EvaluationReview } from "@/types/evaluation";

export const sources: SourceCandidate[] = [
  { id: "source-adaptive-control", title: "Adaptive Control under Changing Dynamics", url: "https://example.com/mock/adaptive-control", sourceType: "paper", discoveredAt: "2026-10-04T09:00:00Z", suggestedCategoryIds: ["physical-ai"], relevanceScore: 94, status: "candidate_created" },
  { id: "source-camera-shift", title: "Debugging a Camera Migration", url: "https://example.com/mock/camera-migration", sourceType: "technical_blog", discoveredAt: "2026-10-04T11:00:00Z", suggestedCategoryIds: ["computer-vision"], relevanceScore: 89, status: "screened" },
  { id: "source-latent-control", title: "Learning Context for Robot Control", url: "https://example.com/mock/context-control", sourceType: "video", discoveredAt: "2026-10-05T08:00:00Z", suggestedCategoryIds: ["robot-learning"], relevanceScore: 85, status: "discovered" },
  { id: "source-depth", title: "Uncertainty in Depth Estimation", url: "https://example.com/mock/depth-uncertainty", sourceType: "educational_material", discoveredAt: "2026-10-03T12:00:00Z", suggestedCategoryIds: ["3d-vision"], relevanceScore: 91, status: "candidate_created" },
  { id: "source-interview", title: "A Discussion of Representation Objectives", url: "https://example.com/mock/representation-discussion", sourceType: "interview_report", discoveredAt: "2026-10-05T10:00:00Z", suggestedCategoryIds: ["representation-learning"], relevanceScore: 72, status: "discovered" },
  { id: "source-device", title: "Consumer Device Launch Notes", url: "https://example.com/mock/device-notes", sourceType: "technical_blog", discoveredAt: "2026-10-02T09:00:00Z", suggestedCategoryIds: [], relevanceScore: 18, status: "rejected" },
];

export const candidates: QuestionCandidate[] = [
  { id: "candidate-payload", sourceId: "source-adaptive-control", suggestedTitle: "Adapting to an Unknown Payload", suggestedScenario: "A robot controller is deployed under an unknown payload. Its adaptation module has only recent joint states and actions.", suggestedQuestion: "What experiment would distinguish adaptation to dynamics from memorization of training payloads?", suggestedCategoryIds: ["robot-learning", "sim-to-real"], questionType: "applied", competencyIds: ["experiment_design"], difficulty: "intermediate", candidateScore: 92, status: "draft_created", draftProblemId: "problem-payload" },
  { id: "candidate-depth", sourceId: "source-depth", suggestedTitle: "Depth Estimation in Fog", suggestedScenario: "A depth model remains confident as visibility degrades in fog.", suggestedQuestion: "How would you diagnose calibration and depth error separately?", suggestedCategoryIds: ["3d-vision"], questionType: "applied", competencyIds: ["failure_diagnosis"], difficulty: "advanced", candidateScore: 88, status: "draft_created", draftProblemId: "problem-depth" },
  { id: "candidate-latent", sourceId: "source-latent-control", suggestedTitle: "What Does the Latent Remember?", suggestedScenario: "An encoder can reconstruct observations but the controller fails under a new motor configuration.", suggestedQuestion: "How could you determine whether the representation retains control-relevant information?", suggestedCategoryIds: ["sim-to-real", "representation-learning"], questionType: "applied", competencyIds: ["objective_design"], difficulty: "intermediate", candidateScore: 90, status: "needs_review", draftProblemId: null },
];

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
