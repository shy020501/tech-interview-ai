import { PageHeading } from "@/components/ui";
import { EvaluationCards } from "@/components/admin/pipeline-views";
import { evaluationReviews } from "@/mocks/server/pipeline";
import { getAdminSolution } from "@/lib/data/problems";
import { requireAdmin } from "@/lib/auth/session";

export default async function EvaluationsPage() {
  await requireAdmin();
  const droneSolution = await getAdminSolution("pv-drone-1");
  const rubricNames = Object.fromEntries((droneSolution?.reasoningRubric ?? []).map((node) => [node.id, node.label]));
  return <><PageHeading eyebrow="Evaluation quality" title="Review the reasoning behind the judgment." description="Inspect two deliberately imperfect evaluator fixtures. Human decisions here are local; no evaluator or benchmark is running." /><EvaluationCards reviews={evaluationReviews} rubricNames={rubricNames} /></>;
}
