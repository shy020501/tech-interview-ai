export function AdminTestSetupNotice() {
  return <div className="notice mb-6" role="status">
    <p className="font-semibold">Admin Test setup required</p>
    <p className="mt-2">The Admin Test database migration has not been applied. Existing practice evaluations remain available.</p>
    <p className="mt-2">Apply <code className="break-all">20261007000200_admin_test_workspace.sql</code> through the repository’s Supabase migration workflow, then reload this page to enable test conversations and their Admin Test tags.</p>
  </div>;
}
