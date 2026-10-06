import Link from "next/link";
import { notFound } from "next/navigation";
import { competencies } from "@/lib/competencies";
import { getCategories } from "@/lib/data/categories";
import { getActiveAttempt } from "@/lib/data/attempts";
import { getCurrentUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { DataUnavailable } from "@/components/data-unavailable";
import { getPublishedProblem, getPublishedProblems, getProblemVersion } from "@/lib/data/problems";
import { categoryOptions, categoryPath } from "@/lib/catalog";
import { difficultyLabels, questionTypeLabels } from "@/lib/labels";
import { Badge } from "@/components/ui";
import { InterviewChat } from "@/components/interview-chat";
import { ProblemVisualization } from "@/components/problem-visualization";

export default async function ProblemPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isSupabaseConfigured()) return <DataUnavailable />;
  const [currentProblem, categories, problems, user] = await Promise.all([getPublishedProblem(slug), getCategories(), getPublishedProblems(), getCurrentUser()]);
  if (!currentProblem) notFound();
  const attempt = user ? await getActiveAttempt(currentProblem.id) : null;
  const problem = attempt && attempt.problemVersionId !== currentProblem.versionId ? await getProblemVersion(attempt.problemVersionId) : currentProblem;
  if (!problem) notFound();
  return <main id="main-content" className="interview-layout"><aside className="practice-sidebar"><Link href="/problems" className="text-link text-sm">← All problems</Link><h2 className="eyebrow mt-8 mb-3">Categories</h2><nav aria-label="Problem categories">{categoryOptions(categories).map((category) => <Link key={category.id} className="category-nav-link" style={{ paddingLeft: `${12 + category.depth * 12}px` }} href={`/problems?category=${category.id}`}>{category.name}</Link>)}</nav><h2 className="eyebrow mt-8 mb-3">Practice queue</h2><nav aria-label="Practice problems">{problems.map((item) => <Link key={item.id} href={`/problems/${item.slug}`} className="queue-link" aria-current={item.id === problem.id ? "page" : undefined}>{item.title}</Link>)}</nav></aside><article className="problem-detail"><p className="eyebrow">{categoryPath(categories, problem.primaryCategoryId)}</p><h1 className="mt-4">{problem.title}</h1>{attempt && <p className="muted text-xs mt-3">Continuing your saved interview · Version {problem.version}</p>}<div className="flex flex-wrap gap-2 mt-5"><Badge tone="accent">{questionTypeLabels[problem.questionType]}</Badge><Badge>{difficultyLabels[problem.difficulty]}</Badge>{problem.competencyIds.map((id) => <Badge key={id}>{competencies.find((competency) => competency.id === id)?.name ?? id}</Badge>)}</div><p className="text-xs muted mt-4">Original mock interview scenario · Created for this service</p><section className="mt-9"><h2>Scenario</h2><p className="mt-4 leading-8 muted">{problem.scenario}</p></section><section className="question-panel mt-7"><p className="eyebrow">Interview Question</p><h2 className="text-xl leading-relaxed mt-3">{problem.question}</h2><p className="muted text-sm mt-4">Explain your reasoning freely. There are no answer choices.</p></section><section className="mt-8"><h2>Working assumptions</h2><ul className="reasoning-list mt-4">{problem.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}</ul></section>{problem.visualization && <div className="mt-8"><ProblemVisualization visualization={problem.visualization} /></div>}<div className="problem-footnote">Take your time. A well-supported alternative can be as valuable as the reference approach.</div></article><InterviewChat key={attempt?.id ?? problem.versionId} problem={problem} initialAttempt={attempt} signedIn={!!user} /></main>;
}
