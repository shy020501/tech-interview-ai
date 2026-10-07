import { getCategories } from "@/lib/data/categories";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { DataUnavailable } from "@/components/data-unavailable";
import { getPublishedProblems } from "@/lib/data/problems";
import { ProblemCatalog } from "@/components/problem-catalog";

export default async function ProblemsPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  if (!isSupabaseConfigured()) return <DataUnavailable />;
  const { category } = await searchParams;
  const [categories, problems] = await Promise.all([getCategories(), getPublishedProblems()]);
  const initialCategory = categories.some((item) => item.id === category) ? category! : "all";
  return <main id="main-content" className="page-container"><div className="catalog-hero"><div><p className="eyebrow">The practice library</p><h1>Think through<br />the hard part.</h1><p className="muted max-w-xl mt-5 text-lg leading-relaxed">Build the reasoning behind technical decisions. Explore real-world scenarios, explain your approach, and reflect on the trade-offs.</p></div><div className="library-note"><span className="mono text-4xl">{String(problems.length).padStart(2, "0")}</span><p className="font-medium mt-3">Curated practice problems</p><p className="muted text-sm mt-2">Practice at your own level.<br />Practice scenarios, with no company attribution.</p></div></div><ProblemCatalog key={initialCategory} problems={problems} categories={categories} initialCategory={initialCategory} /></main>;
}
