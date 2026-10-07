import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/auth/session';
import { isSameOriginMutation, validUuid } from '@/lib/auth/validation';
import { createClient } from '@/lib/supabase/server';
import { getAttempt } from '@/lib/data/attempts';
import { getProblemVersion } from '@/lib/data/problems';

// A separate, same-origin request lets Reset run while a chat Server Action is waiting
// on a provider. There is no evaluator call or client-selectable model in this handler.
export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return Response.json({ ok: false, error: 'Invalid request origin.' }, { status: 403 });
  }
  await requireAdmin();
  let body;
  try { body = await request.json(); } catch {
    return Response.json({ ok: false, error: 'Invalid test request.' }, { status: 400 });
  }
  if (!body || typeof body.problemId !== 'string' || !/^[a-z0-9-]{1,200}$/.test(body.problemId)
    || !validUuid(body.requestId) || (body.resetAttemptId != null && !validUuid(body.resetAttemptId))) {
    return Response.json({ ok: false, error: 'Invalid test request.' }, { status: 400 });
  }
  try {
    const db = await createClient();
    const { data, error } = await db.rpc('admin_start_test', {
      p_problem_id: body.problemId, p_request_id: body.requestId, p_reset_attempt_id: body.resetAttemptId ?? null,
    });
    if (error) return Response.json({ ok: false, error: 'Unable to start or reset this test. Check that the problem is published and the Admin Test migration is applied.' }, { status: 400 });
    const attempt = await getAttempt(data);
    const problem = attempt ? await getProblemVersion(attempt.problemVersionId) : null;
    if (!attempt || !problem) throw new Error('Test unavailable');
    // Explicit public projections; no rubric/package/assessment is sent to the chat.
    return Response.json({ ok: true, attempt, problem }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ ok: false, error: 'Unable to load the test conversation. Please try again.' }, { status: 500 });
  }
}
