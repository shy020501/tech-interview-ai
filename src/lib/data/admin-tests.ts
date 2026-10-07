import 'server-only';
import { requireAdmin } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { getAttempt } from './attempts';
import { isMissingOriginColumn } from './attempt-origin';

export async function getActiveAdminTest(problemId: string) {
  const profile = await requireAdmin();
  const db = await createClient();
  const { data, error } = await db.from('attempts').select('id')
    .eq('user_id', profile.user_id).eq('problem_id', problemId)
    .eq('origin', 'admin_test').eq('status', 'in_progress').maybeSingle();
  // Do not reuse a practice attempt or offer Start when the isolated test schema is absent.
  if (isMissingOriginColumn(error, 'attempts')) return { available: false, attempt: null } as const;
  if (error) throw new Error('Unable to load the admin test.');
  return { available: true, attempt: data ? await getAttempt(data.id) : null } as const;
}
