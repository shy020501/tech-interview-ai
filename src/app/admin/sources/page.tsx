import { requireAdmin } from "@/lib/auth/session";
import { PageHeading } from "@/components/ui";
import { SourceTable } from "@/components/admin/pipeline-views";
import { sources } from "@/mocks/server/pipeline";
import { getCategories } from "@/lib/data/categories";

export default async function SourcesPage() {
  await requireAdmin();
  const categories = await getCategories();
  return <><PageHeading eyebrow="01 / Discovery" title="Sources" description="Screen material for technical depth and question potential. A source does not have to be an existing interview question." /><SourceTable sources={sources} categories={categories} /></>;
}
