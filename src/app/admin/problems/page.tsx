import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeading, Badge } from "@/components/ui";
import { ProblemEditor } from "@/components/admin/problem-editor";
import { SolutionReview } from "@/components/admin/solution-review";
import { getAdminProblems, getAdminSolution } from "@/lib/data/problems";
import { requireAdmin } from "@/lib/auth/session";
import { getCategories } from "@/lib/data/categories";
import { competencies } from "@/lib/competencies";
import { categoryPath } from "@/lib/catalog";
import { difficultyLabels, publicationLabels, questionTypeLabels } from "@/lib/labels";

export default async function AdminProblemsPage({ searchParams }: { searchParams: Promise<{ problem?: string }> }) {
  await requireAdmin();
  const [problems, categories] = await Promise.all([getAdminProblems(), getCategories()]);
  const { problem: id } = await searchParams;
  if (!problems.length && !id) return <><PageHeading eyebrow="03 / Editorial" title="Problem library" description="No problem versions are available yet." /><p className="notice">Published content will appear here when it is ready.</p></>;
  const selected = id ? problems.find((problem) => problem.id === id) : problems[0];
  if (!selected) notFound();
  const solution = await getAdminSolution(selected.versionId);
  return <><PageHeading eyebrow="03 / Editorial" title="Problem library" description="Review public content and private evaluation material together. Only published current versions appear in the user library." /><div className="panel table-scroll"><table><caption className="sr-only">Problem versions and editorial status</caption><thead><tr><th>Problem</th><th>Category</th><th>Type / competency</th><th>Difficulty</th><th>Status</th><th>Version</th></tr></thead><tbody>{problems.map((problem) => <tr key={problem.versionId} className={selected.id === problem.id ? "selected-row" : ""}><td><Link href={`/admin/problems?problem=${problem.id}`} className="text-link" aria-current={selected.id === problem.id ? "true" : undefined}>{problem.title}</Link></td><td className="text-sm muted">{categoryPath(categories, problem.primaryCategoryId)}</td><td className="text-sm">{questionTypeLabels[problem.questionType]}<p className="muted text-xs mt-1">{problem.competencyIds.map((value) => competencies.find((item) => item.id === value)?.name ?? value).join(", ")}</p></td><td className="text-sm">{difficultyLabels[problem.difficulty]}</td><td><Badge tone={problem.status === "published" ? "success" : problem.status === "needs_review" ? "warning" : "neutral"}>{publicationLabels[problem.status]}</Badge></td><td className="mono">v{problem.version}</td></tr>)}</tbody></table></div><div className="flex flex-wrap justify-between items-center gap-4 mt-9 mb-5"><div><p className="eyebrow">Reviewing version {selected.version}</p><h2 className="mt-2">{selected.title}</h2><p className="mono muted text-xs mt-2">{selected.id} / {selected.versionId}</p></div>{selected.status === "published" && <Link href={`/problems/${selected.slug}`} className="button button-secondary">Open user view ↗</Link>}</div><div className="editor-grid"><div className="space-y-6"><ProblemEditor key={selected.versionId} problem={selected} /><section className="panel section-padding"><h2>Public metadata</h2><dl className="metadata-list"><dt>Categories</dt><dd>{selected.categoryIds.map((value) => categoryPath(categories, value)).join("; ")}</dd><dt>Primary category</dt><dd>{categoryPath(categories, selected.primaryCategoryId)}</dd><dt>Question type</dt><dd>{questionTypeLabels[selected.questionType]}</dd><dt>Competency</dt><dd>{selected.competencyIds.map((value) => competencies.find((item) => item.id === value)?.name ?? value).join(", ")}</dd><dt>Difficulty</dt><dd>{difficultyLabels[selected.difficulty]}</dd><dt>Tags</dt><dd>{selected.tags.join(", ")}</dd><dt>Assumptions</dt><dd><ul className="reasoning-list">{selected.assumptions.map((value) => <li key={value}>{value}</li>)}</ul></dd><dt>Visualization</dt><dd>{selected.visualization ? <><p>{selected.visualization.title} · {selected.visualization.kind}</p><p className="muted text-sm mt-2">{selected.visualization.nodes.map((node) => node.label).join(" → ")}</p><p className="muted text-sm mt-2">{selected.visualization.caption}</p></> : "None"}</dd></dl></section></div><SolutionReview solution={solution} /></div></>;
}
