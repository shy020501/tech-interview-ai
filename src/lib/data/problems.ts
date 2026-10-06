import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/session';
import type { ProblemPublic } from '@/types/problem';
import type { ProblemRow, VersionRow, VersionCategoryRow } from '@/types/database';
import type { ProblemEvaluationPackage } from '@/types/evaluation';

const problemColumns = 'id, slug, status, current_version_id, published_at, created_at, updated_at' as const;
const versionColumns = '*' as const;
export function publicProjection(problem: ProblemRow, version: VersionRow, links: VersionCategoryRow[]): ProblemPublic {
  const memberships = links.filter((link) => link.problem_version_id === version.id);
  const primary = memberships.filter((link) => link.is_primary);
  if (version.published_at && primary.length !== 1) throw new Error('Unable to load problem categories.');
  const visual = version.visualization;
  return {
    id: problem.id, slug: problem.slug, status: problem.status, publishedAt: problem.published_at,
    versionId: version.id, version: version.version_number, title: version.title,
    shortDescription: version.short_description, scenario: version.scenario, question: version.question,
    assumptions: version.assumptions,
    visualization: visual ? { kind: visual.kind, title: visual.title, caption: visual.caption, nodes: visual.nodes.map((node) => ({ id: node.id, label: node.label, detail: node.detail })) } : null,
    categoryIds: memberships.map((link) => link.category_id), primaryCategoryId: primary[0]?.category_id ?? '',
    questionType: version.question_type, competencyIds: version.competency_ids, difficulty: version.difficulty,
    tags: version.tags, origin: version.origin,
  };
}
async function withVersions(identities: ProblemRow[], versions?: VersionRow[]) {
  if (!identities.length) return [];
  const supabase = await createClient();
  const versionIds = identities.map((row) => row.current_version_id).filter((id): id is string => !!id);
  const [content, memberships] = await Promise.all([
    versions ? Promise.resolve({ data: versions, error: null }) : supabase.from('problem_versions').select(versionColumns).in('id', versionIds),
    supabase.from('problem_version_categories').select('problem_version_id, category_id, is_primary').in('problem_version_id', versions ? versions.map(v=>v.id) : versionIds),
  ]);
  if (content.error || memberships.error) throw new Error('Unable to load problems.');
  return identities.flatMap((identity) => {
    const version = content.data?.find((row) => row.problem_id === identity.id && (versions || row.id === identity.current_version_id));
    if (!version) return [];
    return [publicProjection(identity, version, memberships.data ?? [])];
  });
}
export async function getPublishedProblems() {
  const supabase = await createClient();
  const { data, error } = await supabase.from('problems').select(problemColumns).eq('status', 'published').order('published_at', { ascending: false });
  if (error) throw new Error('Unable to load problems.');
  return withVersions(data);
}
export async function getPublishedProblem(slug: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from('problems').select(problemColumns).eq('slug', slug).eq('status', 'published').maybeSingle();
  if (error) throw new Error('Unable to load this problem.');
  return data ? (await withVersions([data]))[0] : undefined;
}
/** RLS allows a previous version only to its attempt owner or an admin. */
export async function getProblemVersion(versionId: string) {
  const supabase = await createClient();
  const { data: version, error } = await supabase.from('problem_versions').select(versionColumns).eq('id', versionId).maybeSingle();
  if (error) throw new Error('Unable to load this problem version.');
  if (!version) return undefined;
  const { data, error: identityError } = await supabase.from('problems').select(problemColumns).eq('id', version.problem_id).maybeSingle();
  if (identityError) throw new Error('Unable to load this problem version.');
  return data ? (await withVersions([data], [version]))[0] : undefined;
}
export async function getAdminProblems(): Promise<import('@/types/authoring').AdminProblemSummary[]> {
  await requireAdmin();
  const supabase = await createClient();
  const [identities, versions, links] = await Promise.all([
    supabase.from('problems').select(problemColumns).order('updated_at', {ascending:false}),
    supabase.from('problem_versions').select('*').order('version_number', {ascending:false}),
    supabase.from('problem_version_categories').select('*'),
  ]);
  if (identities.error || versions.error || links.error) throw new Error('Unable to load problems.');
  return identities.data.flatMap(identity=>{
    const version=versions.data.find(v=>v.problem_id===identity.id);
    return version ? [{...publicProjection(identity,version,links.data), versionStatus:version.status, updatedAt:identity.updated_at, currentVersionId:identity.current_version_id}] : [];
  });
}
/** Only an owner can resume an archived identity; draft discovery remains unavailable. */
export async function getOwnedProblemIdentity(slug: string) {
  const { getCurrentUser } = await import('@/lib/auth/session');
  const user=await getCurrentUser(); if(!user)return null;
  const db=await createClient();
  const {data,error}=await db.from('problems').select('id').eq('slug',slug).maybeSingle();
  if(error)throw new Error('Unable to load problem.');
  return data;
}
export async function getAdminSolution(versionId: string): Promise<ProblemEvaluationPackage | undefined> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.from('problem_evaluation_packages').select('problem_version_id, reference_answer, reasoning_rubric, acceptable_alternative_approaches, misconceptions, hint_ladder, completion_criteria, evaluation_examples').eq('problem_version_id', versionId).maybeSingle();
  if (error) throw new Error('Unable to load the evaluation package.');
  return data ? { problemVersionId: data.problem_version_id, referenceAnswer: data.reference_answer, reasoningRubric: data.reasoning_rubric, acceptableAlternativeApproaches: data.acceptable_alternative_approaches, misconceptions: data.misconceptions, hintLadder: data.hint_ladder, completionCriteria: data.completion_criteria, evaluationExamples: data.evaluation_examples } : undefined;
}
