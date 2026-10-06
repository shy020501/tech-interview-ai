import { PageHeading } from "@/components/ui";
import { CategoryManager } from "@/components/admin/category-manager";
import { CategoryTree } from "@/components/category-tree";
import { getCategories } from "@/lib/data/categories";
import { requireAdmin } from "@/lib/auth/session";
import { getAdminProblems } from "@/lib/data/problems";

export default async function CategoriesPage() {
  await requireAdmin();
  const [categories, problems] = await Promise.all([getCategories(), getAdminProblems()]);
  return <><PageHeading eyebrow="Taxonomy" title="A structure that can grow." description="Categories are records connected by parent IDs, with no fixed depth. A problem can belong to multiple branches." /><div className="panel section-padding"><CategoryTree categories={categories} problems={problems} /></div><p className="notice mt-5">Names are English display labels. IDs remain stable when labels change. Counts include published problems in descendant categories, deduplicated within each branch.</p><CategoryManager categories={categories} /></>;
}
