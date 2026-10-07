import type { ProblemPublic } from './problem';
import type { ProblemEvaluationPackage } from './evaluation';
export type VersionStatus = 'draft' | 'needs_review' | 'published' | 'superseded';
export type SourceRelation = 'inspired_by' | 'adapted_from' | 'reference' | 'validation_source';
export interface SourceLink { sourceId: string; relationType: SourceRelation; attributionNote: string }
export type EditableContent = Pick<ProblemPublic, 'title' | 'shortDescription' | 'scenario' | 'question' | 'assumptions' | 'tags' | 'visualization' | 'primaryCategoryId' | 'categoryIds' | 'competencyIds' | 'difficulty'>;
export type EditablePackage = Omit<ProblemEvaluationPackage, 'problemVersionId'>;
export interface VersionInfo { id: string; version: number; status: VersionStatus; revision: number; publishedAt: string | null; updatedAt: string }
export interface AdminProblemSummary extends ProblemPublic { versionStatus: VersionStatus; updatedAt: string; currentVersionId: string | null }
export interface ProblemEditorData { problem: ProblemPublic; evaluation: EditablePackage; sources: SourceLink[]; version: VersionInfo; history: VersionInfo[] }
export type MutationResult = { ok: true; message: string; id?: string; revision?: number; warnings?: string[] } | { ok: false; error: string; errors?: string[] };
/** Released only by the completed-owner debrief RPC; no grading or hidden evaluation internals. */
export interface ReleasedDebrief { progress?:number; evaluated?:boolean; areas?:{label:string;status:string}[]; problemVersionId: string; referenceAnswer: string; keyIdeas: { label: string; description: string }[]; alternativeApproaches: { id: string; title: string; description: string }[] }
