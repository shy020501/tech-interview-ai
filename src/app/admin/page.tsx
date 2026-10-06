import Link from "next/link";
import { PageHeading, Badge, ArrowIcon } from "@/components/ui";
import { sources, candidates, evaluationReviews } from "@/mocks/server/pipeline";
import { getAdminProblems } from "@/lib/data/problems";
import { requireAdmin } from "@/lib/auth/session";

export default async function AdminDashboard() {
  await requireAdmin();
  const problems = await getAdminProblems();
  const metrics = [
    { label: "Sources discovered", value: sources.length, href: "/admin/sources" },
    { label: "Needs screening", value: sources.filter((source) => source.status === "discovered").length, href: "/admin/sources" },
    { label: "Question candidates", value: candidates.length, href: "/admin/candidates" },
    { label: "Problems to review", value: problems.filter((problem) => problem.status === "needs_review").length, href: "/admin/problems" },
    { label: "Published problems", value: problems.filter((problem) => problem.status === "published").length, href: "/admin/problems" },
    { label: "Flagged evaluations", value: evaluationReviews.filter((review) => review.status === "needs_review").length, href: "/admin/evals" },
  ];
  return <><PageHeading eyebrow="Content operations" title="A clear view of the pipeline." description="Turn useful technical material into thoughtful interview practice. Every generated problem needs a human review." action={<Badge>Database + demo</Badge>} /><div className="metric-grid">{metrics.map((metric) => <Link href={metric.href} key={metric.label} className="metric-card panel"><p className="muted text-sm">{metric.label}</p><div className="flex items-end justify-between mt-4"><strong className="mono text-4xl">{String(metric.value).padStart(2, "0")}</strong><ArrowIcon /></div></Link>)}</div><section className="panel section-padding mt-7"><p className="eyebrow">How content moves</p><h2 className="mt-2">Discovery is only the beginning.</h2><ol className="pipeline-steps">{["Source discovery", "Relevance screening", "Question candidate", "Problem draft", "Human review", "Publish"].map((step, index) => <li key={step}><span className="mono muted text-xs">0{index + 1}</span><strong>{step}</strong></li>)}</ol><p className="muted text-sm mt-5">Problem counts come from the database. Source, candidate, and evaluation counts are demonstrations; local review edits do not persist.</p></section><div className="dashboard-grid mt-7"><section className="panel section-padding"><p className="eyebrow">Needs attention</p><h2 className="mt-2 mb-5">The review queue</h2>{problems.filter((problem) => problem.status === "needs_review").map((problem) => <Link className="queue-item" key={problem.id} href={`/admin/problems?problem=${problem.id}`}><div><strong>{problem.title}</strong><p className="muted text-sm mt-1">Version {problem.version} · Problem draft</p></div><ArrowIcon /></Link>)}<Link className="queue-item" href="/admin/evals"><div><strong>Review evaluator judgments</strong><p className="muted text-sm mt-1">Over-interpretation and a missed valid alternative</p></div><ArrowIcon /></Link></section><section className="editorial-note"><p className="eyebrow">Editorial principle</p><h2 className="mt-3">Publish reasoning,<br />not just an answer.</h2><p className="muted mt-4 leading-relaxed">Check the scenario, acceptable approaches, misconceptions, and hint ladder together. A plausible draft is a starting point for review.</p><Link href="/admin/candidates" className="text-link inline-flex gap-2 mt-6 items-center">Explore candidates <ArrowIcon /></Link></section></div></>;
}
