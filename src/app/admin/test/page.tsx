import { PageHeading } from '@/components/ui';
import { AdminTestWorkspace } from '@/components/admin/test-workspace';
import { AdminTestSetupNotice } from '@/components/admin/test-setup-notice';
import { requireAdmin } from '@/lib/auth/session';
import { getPublishedProblems, getProblemVersion } from '@/lib/data/problems';
import { getActiveAdminTest } from '@/lib/data/admin-tests';
import { getCategories } from '@/lib/data/categories';

export default async function AdminTestPage({ searchParams }: { searchParams: Promise<{ problem?: string }> }) {
  await requireAdmin();
  const [params, problems, categories] = await Promise.all([searchParams, getPublishedProblems(), getCategories()]);
  const selected = problems.find(problem => problem.id === params.problem) ?? problems[0];
  const test = selected ? await getActiveAdminTest(selected.id) : { available: true, attempt: null };
  const { attempt } = test;
  const problem = attempt ? await getProblemVersion(attempt.problemVersionId) : selected;
  return <>
    <PageHeading eyebrow="Evaluator testing" title="Test an interview." description="Choose a published problem and try your own responses. Test conversations are separate from practice, and their evaluations are tagged Admin Test." />
    {test.available ? <AdminTestWorkspace key={selected?.id ?? 'empty'} problems={problems} problem={problem ?? null}
      categories={categories} initialAttempt={attempt} maxMessageChars={Number(process.env.MAX_EVALUATION_MESSAGE_CHARS || 4000)} /> : <AdminTestSetupNotice />}
  </>;
}
