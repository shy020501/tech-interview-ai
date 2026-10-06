'use server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { getAdminProblemDetail } from '@/lib/data/authoring';
import { AuthoringError, machineId, slug, parseContent, parsePackage, parseSource, parseCandidate, parseSourceLinks, publicationIssues } from '@/lib/authoring/validation';
import type { MutationResult } from '@/types/authoring';
import type { Json } from '@/types/database';

const json=(value:unknown):Json=>JSON.parse(JSON.stringify(value));
function databaseError(error:{code:string;message:string}):never {
 if(error.code==='22023')throw new AuthoringError(error.message);
 if(error.code==='23505')throw new AuthoringError('That slug or identifier already exists.');
 if(error.code==='23503')throw new AuthoringError('A referenced record is missing or still in use.');
 if(error.code==='23514')throw new AuthoringError('This change would break content integrity. Published versions require a new version.');
 if(error.code==='PGRST202'||error.code==='PGRST205')throw new AuthoringError('Content storage is not ready. Apply the M3 migration.');
 throw new Error('Unable to save content.');
}
async function mutate(operation:()=>Promise<MutationResult>):Promise<MutationResult> {
 await requireAdmin(); // Every exported action reaches this check, including validation-only requests.
 try { const result=await operation(); if(result.ok){revalidatePath('/admin','layout');revalidatePath('/problems','layout');}return result; }
 catch(error){return {ok:false,error:error instanceof AuthoringError?error.message:'Unable to save this change. Please try again.'};}
}
export async function saveSource(id:string|null,input:unknown) {return mutate(async()=>{const db=await createClient(),value=parseSource(input);const {data,error}=await db.rpc('admin_save_source',{p_id:id?machineId(id):null,p_data:json(value)});if(error)databaseError(error);return {ok:true,id:data!,message:'Source saved.'};});}
export async function saveCandidate(id:string|null,input:unknown) {return mutate(async()=>{const db=await createClient(),value=parseCandidate(input);const {data,error}=await db.rpc('admin_save_candidate',{p_id:id?machineId(id):null,p_data:json(value)});if(error)databaseError(error);return {ok:true,id:data!,message:'Candidate saved.'};});}
export async function convertCandidate(id:string,problemSlug:string) {return mutate(async()=>{const db=await createClient();const {data,error}=await db.rpc('admin_convert_candidate',{p_id:machineId(id),p_slug:slug(problemSlug)});if(error)databaseError(error);return {ok:true,id:data!,message:'Problem draft created.'};});}
export async function createProblem(problemSlug:string,title:string) {return mutate(async()=>{if(typeof title!=='string'||!title.trim()||title.length>500)throw new AuthoringError('A title is required.');const db=await createClient();const {data,error}=await db.rpc('admin_create_problem',{p_slug:slug(problemSlug),p_title:title.trim()});if(error)databaseError(error);return {ok:true,id:data!,message:'Problem draft created.'};});}
export async function saveProblemVersion(versionId:string,revision:number,content:unknown,evaluation:unknown,sources:unknown,status:string) {return mutate(async()=>{
 if(!Number.isInteger(revision)||revision<1||!['draft','needs_review'].includes(status))throw new AuthoringError('Invalid version state.');
 const c=parseContent(content),p=parsePackage(evaluation),s=parseSourceLinks(sources),db=await createClient();
 const {data,error}=await db.rpc('admin_save_problem_version',{p_version_id:machineId(versionId),p_revision:revision,p_content:json(c),p_package:json(p),p_sources:json(s),p_status:status});if(error)databaseError(error);return {ok:true,revision:data!,message:'Draft saved.',warnings:publicationIssues(c,p).warnings};
});}
export async function validateProblemVersion(problemId:string,versionId:string):Promise<MutationResult> {return mutate(async()=>{const detail=await getAdminProblemDetail(machineId(problemId),machineId(versionId));if(!detail)throw new AuthoringError('Version unavailable.');const result=publicationIssues(parseContent(detail.problem),parsePackage(detail.evaluation));if(detail.version.publishedAt)return {ok:false,error:'Only a draft can be published.'};return result.errors.length?{ok:false,error:'Resolve these publication requirements.',errors:result.errors}:{ok:true,message:'This saved draft is ready for publication.',warnings:result.warnings};});}
export async function publishVersion(problemId:string,versionId:string,revision:number) {return mutate(async()=>{
 const detail=await getAdminProblemDetail(machineId(problemId),machineId(versionId));if(!detail||detail.version.revision!==revision)throw new AuthoringError('This draft changed. Reload before publishing.');
 const issues=publicationIssues(parseContent(detail.problem),parsePackage(detail.evaluation));if(issues.errors.length)return {ok:false,error:'Resolve these publication requirements.',errors:issues.errors};
 const db=await createClient();const {data,error}=await db.rpc('admin_publish_version',{p_version_id:versionId,p_revision:revision});if(error)databaseError(error);return {ok:true,id:data!,message:'Version published.',warnings:issues.warnings};
});}
export async function createVersion(problemId:string) {return mutate(async()=>{const db=await createClient();const {data,error}=await db.rpc('admin_create_version',{p_problem_id:machineId(problemId)});if(error)databaseError(error);return {ok:true,id:data!,message:'Draft version ready.'};});}
export async function archiveProblem(problemId:string) {return mutate(async()=>{const db=await createClient();const {error}=await db.rpc('admin_archive_problem',{p_problem_id:machineId(problemId)});if(error)databaseError(error);return {ok:true,message:'Problem archived.'};});}
export async function saveCategory(id:string|null,input:unknown) {return mutate(async()=>{
 if(!input||typeof input!=='object')throw new AuthoringError('Invalid category.');const r=input as Record<string,unknown>;
 if(typeof r.name!=='string'||!r.name.trim()||r.name.length>500||typeof r.description!=='string'||r.description.length>10000||!Number.isInteger(r.sortOrder))throw new AuthoringError('Enter a category name, description and integer sort order.');
 const value={slug:slug(r.slug),name:r.name.trim(),description:r.description,sortOrder:r.sortOrder,parentId:r.parentId?machineId(r.parentId):''};
 const db=await createClient();const {data,error}=await db.rpc('admin_save_category',{p_id:id?machineId(id):null,p_data:json(value)});if(error)databaseError(error);return {ok:true,id:data!,message:'Category saved.'};
});}
export async function deleteCategory(id:string) {return mutate(async()=>{const db=await createClient();const {error}=await db.rpc('admin_delete_category',{p_id:machineId(id)});if(error)databaseError(error);return {ok:true,message:'Category deleted.'};});}
