import { PageHeading } from '@/components/ui';
import { EvaluationQA } from '@/components/admin/evaluation-qa';
import { getEvaluationQA } from '@/lib/data/evaluations';
import { requireAdmin } from '@/lib/auth/session';
export default async function EvaluationsPage(){
 await requireAdmin();const entries=await getEvaluationQA();
 return <><PageHeading eyebrow="Evaluation quality" title="Review the reasoning behind the judgment." description="Inspect the 100 most recent evaluations, validated judgments and request costs. Human review annotations do not change saved interview state."/><EvaluationQA entries={entries}/></>;
}
