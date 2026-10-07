import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/session';
import { getAdminSolution, publicProjection } from './problems';
import { emptyPackage } from '@/lib/authoring/validation';
import type { SourceCandidate, QuestionCandidate } from '@/types/source';
import type { ProblemEditorData, VersionInfo } from '@/types/authoring';
import type { VersionRow } from '@/types/database';

export async function getAdminSources():Promise<SourceCandidate[]> {
 await requireAdmin(); const db=await createClient();
 const {data,error}=await db.from('sources').select('*').order('updated_at',{ascending:false});
 if(error)throw new Error('Unable to load sources.');
 return data.map(r=>({id:r.id,title:r.title,url:r.url,sourceType:r.source_type,status:r.status,discoveredAt:r.discovered_at,relevanceScore:r.relevance_score,suggestedCategoryIds:r.suggested_category_ids,notes:r.notes,provenanceNotes:r.provenance_notes,usageStatus:r.usage_status,usageNotes:r.usage_notes,createdAt:r.created_at,updatedAt:r.updated_at,createdBy:r.created_by}));
}
export async function getAdminCandidates():Promise<QuestionCandidate[]> {
 await requireAdmin(); const db=await createClient();
 const {data,error}=await db.from('question_candidates').select('*').order('updated_at',{ascending:false});
 if(error)throw new Error('Unable to load candidates.');
 return data.map(r=>({id:r.id,sourceId:r.source_id,suggestedTitle:r.suggested_title,suggestedScenario:r.suggested_scenario,suggestedQuestion:r.suggested_question,suggestedCategoryIds:r.suggested_category_ids,competencyIds:r.competency_ids,difficulty:r.difficulty,candidateScore:r.candidate_score,status:r.status,notes:r.notes,draftProblemId:r.converted_problem_id,createdAt:r.created_at,updatedAt:r.updated_at,createdBy:r.created_by}));
}
const versionInfo=(v:VersionRow):VersionInfo=>({id:v.id,version:v.version_number,status:v.status,revision:v.revision,publishedAt:v.published_at,updatedAt:v.updated_at});
export async function getAdminProblemDetail(problemId:string,versionId?:string):Promise<ProblemEditorData|null> {
 await requireAdmin(); const db=await createClient();
 const [identity,versions]=await Promise.all([db.from('problems').select('*').eq('id',problemId).maybeSingle(),db.from('problem_versions').select('*').eq('problem_id',problemId).order('version_number',{ascending:false})]);
 if(identity.error||versions.error)throw new Error('Unable to load this problem.');
 if(!identity.data)return null;
 const version=versionId?versions.data.find(v=>v.id===versionId):versions.data[0]; if(!version)return null;
 const [links,sources,evaluation]=await Promise.all([
   db.from('problem_version_categories').select('*').eq('problem_version_id',version.id),
   db.from('problem_sources').select('*').eq('problem_version_id',version.id), getAdminSolution(version.id),
 ]);
 if(links.error||sources.error)throw new Error('Unable to load this version.');
 return {problem:publicProjection(identity.data,version,links.data),evaluation:evaluation??emptyPackage(),sources:sources.data.map(r=>({sourceId:r.source_id,relationType:r.relation_type,attributionNote:r.attribution_note})),version:versionInfo(version),history:versions.data.map(versionInfo)};
}
