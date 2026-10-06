import type { Difficulty, QuestionType } from "./problem";

export type SourceType = "paper" | "technical_blog" | "video" | "interview_report" | "educational_material";
export interface SourceCandidate {
  id: string;
  title: string;
  url: string;
  sourceType: SourceType;
  discoveredAt: string;
  suggestedCategoryIds: string[];
  relevanceScore: number;
  status: "discovered" | "screened" | "rejected" | "candidate_created";
}

export interface QuestionCandidate {
  id: string;
  sourceId: string;
  suggestedTitle: string;
  suggestedScenario: string;
  suggestedQuestion: string;
  suggestedCategoryIds: string[];
  questionType: QuestionType;
  competencyIds: string[];
  difficulty: Difficulty;
  candidateScore: number;
  status: "needs_review" | "draft_created" | "rejected";
  draftProblemId: string | null;
}
