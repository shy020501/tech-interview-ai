import type { Difficulty, PublicationStatus, QuestionType } from "@/types/problem";
import type { RubricStatus } from "@/types/evaluation";
import type { SourceType } from "@/types/source";

export const questionTypeLabels: Record<QuestionType, string> = { fundamental: "Core", applied: "Advanced" };
export const difficultyLabels: Record<Difficulty, string> = { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" };
export const publicationLabels: Record<PublicationStatus, string> = { draft: "Draft", needs_review: "Needs Review", published: "Published", archived: "Archived" };
export const rubricLabels: Record<RubricStatus, string> = { unseen: "Unseen", partial: "Partial", confirmed: "Confirmed", misconception: "Misconception", uncertain: "Uncertain" };
export const sourceTypeLabels: Record<SourceType, string> = { paper: "Paper", technical_blog: "Technical Blog", video: "Video", interview_report: "Interview Report", educational_material: "Educational Material" };
export const sourceStatusLabels = { discovered: "Unscreened", screened: "Screened", rejected: "Rejected", candidate_created: "Candidate Created" };
export const candidateStatusLabels = { needs_review: "Needs Review", draft_created: "Draft Created", rejected: "Rejected" };
export const humanReviewLabels = { not_reviewed: "Not Reviewed", agreed: "Agreed", disagreed: "Disagreed" };
export const mockNotice = "Mock session — feedback and progress are scripted, not an assessment.";
