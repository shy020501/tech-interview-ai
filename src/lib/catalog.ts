import type { Category } from "@/types/category";
import type { Difficulty, ProblemPublic } from "@/types/problem";

export function categoryDescendants(categories: Category[], id: string): Set<string> {
  const result = new Set<string>();
  const pending = [id];
  while (pending.length) {
    const current = pending.pop()!;
    if (result.has(current)) continue;
    result.add(current);
    pending.push(...categories.filter((category) => category.parentId === current).map((category) => category.id));
  }
  return result;
}

export function categoryPath(categories: Category[], id: string): string {
  const names: string[] = [];
  const visited = new Set<string>();
  let current = categories.find((category) => category.id === id);
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    names.unshift(current.name);
    current = categories.find((category) => category.id === current?.parentId);
  }
  return names.join(" / ");
}

export function categoryOptions(categories: Category[], parentId: string | null = null, depth = 0, visited = new Set<string>()): { id: string; name: string; depth: number }[] {
  return categories.filter((category) => category.parentId === parentId && !visited.has(category.id)).flatMap((category) => {
    const next = new Set(visited).add(category.id);
    return [{ id: category.id, name: category.name, depth }, ...categoryOptions(categories, category.id, depth + 1, next)];
  });
}

export interface ProblemFilters {
  categoryId: string;
  difficulty: Difficulty | "all";
  query: string;
}

export function filterProblems(problems: ProblemPublic[], categories: Category[], filters: ProblemFilters): ProblemPublic[] {
  const categoryIds = filters.categoryId === "all" ? null : categoryDescendants(categories, filters.categoryId);
  const query = filters.query.trim().toLowerCase();
  return problems.filter((problem) => problem.status === "published"
    && (!categoryIds || problem.categoryIds.some((id) => categoryIds.has(id)))
    && (filters.difficulty === "all" || problem.difficulty === filters.difficulty)
    && (!query || `${problem.title} ${problem.shortDescription} ${problem.tags.join(" ")}`.toLowerCase().includes(query)));
}
