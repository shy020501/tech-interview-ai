import Link from "next/link";
import type { Category } from "@/types/category";
import type { ProblemPublic } from "@/types/problem";
import { categoryDescendants } from "@/lib/catalog";

export function CategoryTree({ categories, problems, parentId = null, visited = new Set<string>() }: { categories: Category[]; problems: ProblemPublic[]; parentId?: string | null; visited?: Set<string> }) {
  const children = categories.filter((category) => category.parentId === parentId && !visited.has(category.id));
  if (!children.length) return null;
  return <ul className="category-tree">{children.map((category) => {
    const ids = categoryDescendants(categories, category.id);
    const count = problems.filter((problem) => problem.status === "published" && problem.categoryIds.some((id) => ids.has(id))).length;
    return <li key={category.id}><div className="category-tree-row"><div><Link className="text-link" href={`/problems?category=${category.id}`}>{category.name}</Link><p className="mono muted text-xs mt-1">{category.id}</p>{category.description && <p className="muted text-sm mt-1">{category.description}</p>}</div><span className="muted text-sm whitespace-nowrap">{count} published</span></div><CategoryTree categories={categories} problems={problems} parentId={category.id} visited={new Set(visited).add(category.id)} /></li>;
  })}</ul>;
}
