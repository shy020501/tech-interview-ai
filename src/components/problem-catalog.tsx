"use client";

import Link from "next/link";
import { useState } from "react";
import type { Category } from "@/types/category";
import type { ProblemPublic } from "@/types/problem";
import { categoryOptions, categoryPath, filterProblems, type ProblemFilters } from "@/lib/catalog";
import { difficultyLabels, questionTypeLabels } from "@/lib/labels";
import { ArrowIcon, Badge, EmptyState } from "@/components/ui";

export function ProblemCatalog({ problems, categories, initialCategory }: { problems: ProblemPublic[]; categories: Category[]; initialCategory: string }) {
  const initialFilters: ProblemFilters = { categoryId: initialCategory, questionType: "all", difficulty: "all", query: "" };
  const [filters, setFilters] = useState(initialFilters);
  const visible = filterProblems(problems, categories, filters);
  const options = categoryOptions(categories);
  return <>
    <div className="filter-panel panel">
      <div><label htmlFor="problem-search">Search problems</label><input id="problem-search" type="search" placeholder="Search by title or topic…" value={filters.query} onChange={(event) => setFilters({ ...filters, query: event.target.value })} /></div>
      <div><label htmlFor="category-filter">Category</label><select id="category-filter" value={filters.categoryId} onChange={(event) => setFilters({ ...filters, categoryId: event.target.value })}><option value="all">All categories</option>{options.map((category) => <option key={category.id} value={category.id}>{"— ".repeat(category.depth)}{category.name}</option>)}</select></div>
      <div><label htmlFor="type-filter">Question type</label><select id="type-filter" value={filters.questionType} onChange={(event) => setFilters({ ...filters, questionType: event.target.value as ProblemFilters["questionType"] })}><option value="all">All types</option>{Object.entries(questionTypeLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></div>
      <div><label htmlFor="difficulty-filter">Difficulty</label><select id="difficulty-filter" value={filters.difficulty} onChange={(event) => setFilters({ ...filters, difficulty: event.target.value as ProblemFilters["difficulty"] })}><option value="all">All levels</option>{Object.entries(difficultyLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></div>
    </div>
    <div className="flex items-center justify-between my-6 gap-3"><p role="status" className="muted text-sm">{visible.length} {visible.length === 1 ? "problem" : "problems"} · {questionTypeLabels.applied} scenarios first</p><button type="button" className="text-button" onClick={() => setFilters({ categoryId: "all", questionType: "all", difficulty: "all", query: "" })}>Clear filters</button></div>
    {visible.length ? <div className="problem-grid">{visible.map((problem, index) => <article key={problem.id} className={`problem-card panel ${index === 0 && problem.questionType === "applied" ? "featured-problem" : ""}`}><div className="flex flex-wrap items-center gap-2"><Badge tone={problem.questionType === "applied" ? "accent" : "neutral"}>{questionTypeLabels[problem.questionType]}</Badge><Badge>{difficultyLabels[problem.difficulty]}</Badge><span className="mono muted ml-auto text-xs">{String(index + 1).padStart(2, "0")}</span></div><p className="eyebrow mt-6">{categoryPath(categories, problem.primaryCategoryId)}</p><h2 className="mt-2"><Link href={`/problems/${problem.slug}`}>{problem.title}</Link></h2><p className="muted mt-3 leading-relaxed">{problem.shortDescription}</p><div className="flex flex-wrap gap-2 mt-5">{problem.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div><div className="card-footer"><span className="muted text-xs">{problem.origin === "manual" ? "Manually authored scenario" : "Original mock scenario"}</span><Link href={`/problems/${problem.slug}`} className="text-link inline-flex items-center gap-2" aria-label={`Practice ${problem.title}`}>Start practice <ArrowIcon /></Link></div></article>)}</div> : <EmptyState title="No problems match these filters."><p>Try a different category or clear your filters. More topics will be added over time.</p></EmptyState>}
  </>;
}
