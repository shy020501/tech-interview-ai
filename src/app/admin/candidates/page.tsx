import { requireAdmin } from "@/lib/auth/session";
import { PageHeading } from "@/components/ui";
import { CandidateCards } from "@/components/admin/pipeline-views";
import { candidates, sources } from "@/mocks/server/pipeline";
import { getCategories } from "@/lib/data/categories";
import { competencies } from "@/lib/competencies";

export default async function CandidatesPage() {
  await requireAdmin();
  const categories = await getCategories();
  return <><PageHeading eyebrow="02 / Screening" title="Question candidates" description="Review the scenario hidden inside a source. Scores are mock screening signals, not a publication decision." /><CandidateCards candidates={candidates} sources={sources} categories={categories} competencies={competencies} /></>;
}
