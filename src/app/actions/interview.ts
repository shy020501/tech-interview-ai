'use server';
import { getCurrentUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { getAttempt } from '@/lib/data/attempts';
import { validMessage, validUuid } from '@/lib/auth/validation';
import type { AttemptActionResult } from '@/types/attempt';

const signInRequired: AttemptActionResult = { ok: false, signIn: true, error: 'Please sign in to save your interview.' };
async function snapshot(id: string): Promise<AttemptActionResult> {
  const attempt = await getAttempt(id);
  return attempt ? { ok: true, attempt } : { ok: false, error: 'This interview is not available.' };
}
export async function startInterview(problemId: unknown): Promise<AttemptActionResult> {
  if (!await getCurrentUser()) return signInRequired;
  if (typeof problemId !== 'string' || !/^[a-z0-9-]{1,200}$/.test(problemId)) return { ok: false, error: 'This problem is not available.' };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('start_interview', { p_problem_id: problemId });
    if (error) return { ok: false, error: 'Unable to start the interview. Please try again.' };
    return await snapshot(data);
  } catch { return { ok: false, error: 'Unable to start the interview. Please try again.' }; }
}
export async function sendReasoning(attemptId: unknown, message: unknown, requestId: unknown): Promise<AttemptActionResult> {
  if (!await getCurrentUser()) return signInRequired;
  if (!validUuid(attemptId) || !validUuid(requestId) || !validMessage(message)) return { ok: false, error: 'Write a response between 1 and 4,000 characters.' };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('append_interview_turn', { p_attempt_id: attemptId, p_content: message.trim(), p_request_id: requestId });
    if (error) return { ok: false, error: 'Unable to save your response. Retry the same message or reload the conversation.' };
    return await snapshot(data);
  } catch { return { ok: false, error: 'Unable to save your response. Please try again.' }; }
}
export async function requestHint(attemptId: unknown): Promise<AttemptActionResult> {
  if (!await getCurrentUser()) return signInRequired;
  if (!validUuid(attemptId)) return { ok: false, error: 'This interview is not available.' };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('request_interview_hint', { p_attempt_id: attemptId });
    if (error) return { ok: false, error: 'A hint is not available for this interview right now.' };
    return await snapshot(data);
  } catch { return { ok: false, error: 'Unable to load the hint. Please try again.' }; }
}
export async function finishInterview(attemptId: unknown): Promise<AttemptActionResult> {
  if (!await getCurrentUser()) return signInRequired;
  if (!validUuid(attemptId)) return { ok: false, error: 'This interview is not available.' };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('finish_interview', { p_attempt_id: attemptId });
    if (error) return { ok: false, error: 'Unable to finish the interview. Please try again.' };
    return await snapshot(data);
  } catch { return { ok: false, error: 'Unable to finish the interview. Please try again.' }; }
}
