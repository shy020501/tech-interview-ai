import type { Difficulty, PublicationStatus } from "@/types/problem";
import type { RubricStatus } from "@/types/evaluation";
import type { SourceType } from "@/types/source";

export const difficultyLabels: Record<Difficulty, string> = { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" };
export const publicationLabels: Record<PublicationStatus, string> = { draft: "Draft", needs_review: "Needs Review", published: "Published", archived: "Archived" };
export const rubricLabels: Record<RubricStatus, string> = { unseen: "Unseen", partial: "Partial", confirmed: "Confirmed", misconception: "Misconception", uncertain: "Uncertain" };
export const sourceTypeLabels: Record<SourceType, string> = { paper: "Paper", technical_blog: "Technical Blog", video: "Video", interview_report: "Interview Report", educational_material: "Educational Material", social_media: "Social Media", other: "Other" };
export const sourceStatusLabels = { discovered: "Unscreened", screened: "Screened", rejected: "Rejected", candidate_created: "Candidate Created" };
export const candidateStatusLabels = { pending_review: "Pending Review", converted_to_problem: "Converted to Problem", rejected: "Rejected" };
export const humanReviewLabels = { not_reviewed: "Not Reviewed", agreed: "Agreed", disagreed: "Disagreed" };
export const mockNotice = "Mock session — feedback and progress are scripted, not an assessment.";

export const usageStatusLabels = { unknown: "Unknown", reference_only: "Reference Only", approved_for_reuse: "Approved for Reuse" };
export const versionStatusLabels = { draft: "Draft", needs_review: "Needs Review", published: "Published", superseded: "Superseded" };
