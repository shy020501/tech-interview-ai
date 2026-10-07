import type { Difficulty } from './problem';
export type SourceType = 'paper' | 'technical_blog' | 'video' | 'interview_report' | 'educational_material' | 'social_media' | 'other';
export type UsageStatus = 'unknown' | 'reference_only' | 'approved_for_reuse';
export interface SourceInput {
  title: string; url: string; sourceType: SourceType;
  status: 'discovered' | 'screened' | 'rejected' | 'candidate_created';
  relevanceScore: number | null; suggestedCategoryIds: string[];
  notes: string; provenanceNotes: string; usageStatus: UsageStatus; usageNotes: string;
}
export interface SourceCandidate extends SourceInput { id: string; discoveredAt: string; createdAt: string; updatedAt: string; createdBy: string | null }
export interface CandidateInput {
  sourceId: string | null; suggestedTitle: string; suggestedScenario: string; suggestedQuestion: string;
  suggestedCategoryIds: string[]; competencyIds: string[]; difficulty: Difficulty;
  candidateScore: number | null; status: 'pending_review' | 'rejected'; notes: string;
}
export interface QuestionCandidate extends Omit<CandidateInput, 'status'> {
  id: string; status: 'pending_review' | 'rejected' | 'converted_to_problem'; draftProblemId: string | null;
  createdAt: string; updatedAt: string; createdBy: string | null;
}
