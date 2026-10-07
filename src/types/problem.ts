export type Difficulty = "beginner" | "intermediate" | "advanced";
export type PublicationStatus = "draft" | "needs_review" | "published" | "archived";

export interface ProblemVisualization {
  kind: "flow";
  title: string;
  caption: string;
  nodes: { id: string; label: string; detail: string }[];
}

/** Explicit allowlist for user-facing content. Never attach a solution package. */
export interface ProblemPublic {
  id: string;
  versionId: string;
  version: number;
  slug: string;
  title: string;
  shortDescription: string;
  scenario: string;
  question: string;
  assumptions: string[];
  visualization: ProblemVisualization | null;
  categoryIds: string[];
  primaryCategoryId: string;
  competencyIds: string[];
  difficulty: Difficulty;
  tags: string[];
  status: PublicationStatus;
  publishedAt: string | null;
  origin: "original_mock" | "manual";
}

/** A deliberately limited review projection; not the full evaluation package. */
export interface ProblemDebrief {
  problemVersionId: string;
  reasoningSummary: string;
  keyIdea: string;
  referenceAnswer: string;
  acceptedReasoningPoints: string[];
  alternativeValidApproaches: string[];
}

/** Returned only after an explicit hint request. No ladder or rubric metadata. */
export interface HintDelivery {
  id: string;
  text: string;
}
