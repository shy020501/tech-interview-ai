import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/session';
import type { ProblemPublic } from '@/types/problem';
import type { ProblemRow, VersionRow, ProblemCategoryRow } from '@/types/database';
import type { ProblemEvaluationPackage } from '@/types/evaluation';

const problemColumns = 'id, slug, status, current_version_id, published_at, created_at, updated_at' as const;
const versionColumns = 'id, problem_id, version_number, title, short_description, scenario, question, assumptions, visualization, question_type, competency_ids, difficulty, tags, origin, created_at' as const;
function publicProjection(problem: ProblemRow, version: VersionRow, links: ProblemCategoryRow[]): ProblemPublic {
  const memberships = links.filter((link) => link.problem_id === problem.id);
  const primary = memberships.filter((link) => link.is_primary);
  if (primary.length !== 1) throw new Error('Unable to load problem categories.');
  const visual = version.visualization;
  return {
    id: problem.id, slug: problem.slug, status: problem.status, publishedAt: problem.published_at,
    versionId: version.id, version: version.version_number, title: version.title,
    shortDescription: version.short_description, scenario: version.scenario, question: version.question,
    assumptions: version.assumptions,
    visualization: visual ? { kind: visual.kind, title: visual.title, caption: visual.caption, nodes: visual.nodes.map((node) => ({ id: node.id, label: node.label, detail: node.detail })) } : null,
    categoryIds: memberships.map((link) => link.category_id), primaryCategoryId: primary[0].category_id,
    questionType: version.question_type, competencyIds: version.competency_ids, difficulty: version.difficulty,
    tags: version.tags, origin: version.origin,
  };
}
async function withVersions(identities: ProblemRow[], versions?: VersionRow[]) {
  if (!identities.length) return [];
  const supabase = await createClient();
  const ids = identities.map((row) => row.id);
  const versionIds = identities.map((row) => row.current_version_id).filter((id): id is string => !!id);
  const [content, memberships] = await Promise.all([
    versions ? Promise.resolve({ data: versions, error: null }) : supabase.from('problem_versions').select(versionColumns).in('id', versionIds),
    supabase.from('problem_categories').select('problem_id, category_id, is_primary').in('problem_id', ids),
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
export async function getAdminProblems() {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.from('problems').select(problemColumns).order('created_at');
  if (error) throw new Error('Unable to load problems.');
  return withVersions(data);
}
export async function getAdminSolution(versionId: string): Promise<ProblemEvaluationPackage | undefined> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.from('problem_evaluation_packages').select('problem_version_id, reference_answer, reasoning_rubric, acceptable_alternative_approaches, misconceptions, hint_ladder, completion_criteria, evaluation_examples').eq('problem_version_id', versionId).maybeSingle();
  if (error) throw new Error('Unable to load the evaluation package.');
  return data ? { problemVersionId: data.problem_version_id, referenceAnswer: data.reference_answer, reasoningRubric: data.reasoning_rubric, acceptableAlternativeApproaches: data.acceptable_alternative_approaches, misconceptions: data.misconceptions, hintLadder: data.hint_ladder, completionCriteria: data.completion_criteria, evaluationExamples: data.evaluation_examples } : undefined;
}
