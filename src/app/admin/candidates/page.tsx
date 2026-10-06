import { requireAdmin } from "@/lib/auth/session";
import { PageHeading } from "@/components/ui";
import { CandidateCards } from "@/components/admin/pipeline-views";
import { getAdminCandidates, getAdminSources } from "@/lib/data/authoring";
import { getCategories } from "@/lib/data/categories";
import { competencies } from "@/lib/competencies";

export default async function CandidatesPage() {
  await requireAdmin();
  const [categories, candidates, sources] = await Promise.all([getCategories(), getAdminCandidates(), getAdminSources()]);
  return <><PageHeading eyebrow="02 / Screening" title="Question candidates" description="Review the scenario hidden inside a source. Scores are manually assigned screening signals. Create and review drafts before publication." /><CandidateCards candidates={candidates} sources={sources} categories={categories} competencies={competencies} /></>;
}
