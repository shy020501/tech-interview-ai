import { PageHeading } from '@/components/ui';
import { EvaluationQA } from '@/components/admin/evaluation-qa';
import { AdminTestSetupNotice } from '@/components/admin/test-setup-notice';
import { getEvaluationQA } from '@/lib/data/evaluations';
import { requireAdmin } from '@/lib/auth/session';
export default async function EvaluationsPage({searchParams}:{searchParams:Promise<{origin?:string}>}){
 await requireAdmin();const [{ entries, adminTestAvailable },params]=await Promise.all([getEvaluationQA(),searchParams]);
 const origin=adminTestAvailable&&(params.origin==='admin_test'||params.origin==='practice')?params.origin:'all';
 return <><PageHeading eyebrow="Evaluation quality" title="Review the reasoning behind the judgment." description="Inspect the 100 most recent evaluations, validated judgments and request costs. Admin Test tags identify responses from the Test workspace. Human review annotations do not change saved interview state."/>
   {!adminTestAvailable && <AdminTestSetupNotice />}
   <EvaluationQA key={`${origin}-${adminTestAvailable}`} entries={entries} initialOrigin={origin} adminTestAvailable={adminTestAvailable}/></>;
}
