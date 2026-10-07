import Link from "next/link";
import { categoryOptions } from "@/lib/catalog";
import { InterviewChat } from "@/components/interview-chat";
import { ProblemContent } from "@/components/problem-content";
import type { ProblemPublic } from "@/types/problem";
import type { Category } from "@/types/category";
import type { AttemptSession } from "@/types/attempt";

/** Shared public presentation: both practice and admin preview pass only public content. */
export function ProblemWorkspace({problem,categories,problems,attempt=null,signedIn=false,preview=false,maxMessageChars=4000}:{problem:ProblemPublic;categories:Category[];problems:ProblemPublic[];attempt?:AttemptSession|null;signedIn?:boolean;preview?:boolean;maxMessageChars?:number}) {
  return <div className="interview-layout"><aside className="practice-sidebar"><Link href="/problems" className="text-link text-sm">← All problems</Link><h2 className="eyebrow mt-8 mb-3">Categories</h2><nav aria-label="Problem categories">{categoryOptions(categories).map((category) => <Link key={category.id} className="category-nav-link" style={{ paddingLeft: `${12 + category.depth * 12}px` }} href={`/problems?category=${category.id}`}>{category.name}</Link>)}</nav><h2 className="eyebrow mt-8 mb-3">Practice queue</h2><nav aria-label="Practice problems">{problems.map((item) => <Link key={item.id} href={`/problems/${item.slug}`} className="queue-link" aria-current={item.id === problem.id ? "page" : undefined}>{item.title}</Link>)}</nav></aside><ProblemContent problem={problem} categories={categories} continuing={!!attempt} /><InterviewChat key={attempt?.id ?? problem.versionId} problem={problem} initialAttempt={attempt} signedIn={signedIn} preview={preview} maxMessageChars={maxMessageChars} /></div>;
}
