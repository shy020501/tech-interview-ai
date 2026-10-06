export type RubricStatus = "unseen" | "partial" | "confirmed" | "misconception" | "uncertain";
export type FeedbackCategory = "acknowledgement" | "clarification_needed" | "reasoning_supported" | "reasoning_conflict";

export interface Evidence {
  messageId: string;
  quote?: string;
}

export interface RubricAssessment {
  rubricNodeId: string;
  status: RubricStatus;
  evidence: Evidence[];
  explanation?: string;
}

export interface ReasoningRubricNode {
  id: string;
  label: string;
  description: string;
  weight: number;
  /** Dependencies form a graph, not a mandatory linear interview order. */
  prerequisiteNodeIds: string[];
  sufficientEvidenceDescription: string;
  notes?: string;
}

export interface Misconception {
  id: string;
  title: string;
  description: string;
  relatedRubricNodeIds: string[];
  detectionNotes?: string;
}

export interface Hint {
  id: string;
  targetRubricNodeId: string;
  level: number;
  text: string;
}

export interface EvaluationResult {
  rubricAssessments: RubricAssessment[];
  detectedMisconceptions: { misconceptionId: string; evidence: Evidence[] }[];
  contradictions: { rubricNodeIds: string[]; evidence: Evidence[]; explanation: string }[];
  needsEscalation: boolean;
  escalationReason: string | null;
  feedbackCategory: FeedbackCategory;
}

/** Server-side authoring/evaluation contract. Runtime data is stored in the admin-only problem_evaluation_packages table. */
export interface ProblemEvaluationPackage {
  problemVersionId: string;
  referenceAnswer: string;
  reasoningRubric: ReasoningRubricNode[];
  acceptableAlternativeApproaches: { id: string; description: string; rubricNodeIds: string[] }[];
  misconceptions: Misconception[];
  hintLadder: Hint[];
  completionCriteria: {
    requiredNodeIds: string[];
    /** In addition to required nodes, any one complete group is sufficient. */
    alternativeNodeGroups: string[][];
    description: string;
  };
  evaluationExamples: { id: string; response: string; expectedResult: EvaluationResult }[];
}

export interface EvaluationReview {
  id: string;
  problemVersionId: string;
  userResponse: string;
  result: EvaluationResult;
  humanReview: "not_reviewed" | "agreed" | "disagreed";
  status: "needs_review" | "reviewed";
  reviewNote: string;
}
