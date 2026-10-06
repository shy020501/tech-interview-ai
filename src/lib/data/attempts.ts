import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/session';
import type { AttemptSession } from '@/types/attempt';
import type { MessageRow } from '@/types/database';
import { validUuid } from '@/lib/auth/validation';

const columns = 'id, problem_id, problem_version_id, status, started_at, completed_at' as const;
export async function getAttempt(id: string): Promise<AttemptSession | null> {
  const user = await requireUser('/review');
  if (!validUuid(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from('attempts').select(columns).eq('id', id).eq('user_id', user.id).maybeSingle();
  if (error) throw new Error('Unable to load the interview.');
  if (!data) return null;
  async function loadMessages() {
    const messages: Pick<MessageRow, 'id' | 'role' | 'content' | 'created_at'>[] = [];
    // Page through the Data API's row limit so a long conversation survives reload.
    for (let offset = 0; ; offset += 500) {
      const result = await supabase.from('attempt_messages').select('id, role, content, created_at').eq('attempt_id', id).order('sequence_number').range(offset, offset + 499);
      if (result.error) throw new Error('Unable to load the conversation.');
      messages.push(...result.data);
      if (result.data.length < 500) return messages;
    }
  }
  const [messages, hints] = await Promise.all([
    loadMessages(),
    supabase.from('hint_events').select('hint_id, displayed_text, created_at').eq('attempt_id', id).order('created_at'),
  ]);
  if (hints.error) throw new Error('Unable to load the conversation.');
  const turns = messages.filter((message) => message.role === 'user').length;
  return { id: data.id, problemId: data.problem_id, problemVersionId: data.problem_version_id, status: data.status,
    startedAt: data.started_at, completedAt: data.completed_at,
    messages: messages.map((message) => ({ id: message.id, role: message.role, content: message.content, createdAt: message.created_at })),
    hintsUsed: hints.data.map((hint) => ({ hintId: hint.hint_id, requestedAt: hint.created_at, displayedText: hint.displayed_text })),
    demoProgress: turns ? [60, 70, 75][Math.min(turns - 1, 2)] : 0,
  };
}
export async function getActiveAttempt(problemId: string) {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.from('attempts').select('id').eq('user_id', user.id).eq('problem_id', problemId).eq('status', 'in_progress').order('started_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error('Unable to resume the interview.');
  return data ? getAttempt(data.id) : null;
}
export async function getCompletedAttempts() {
  const user = await requireUser('/review');
  const supabase = await createClient();
  const { data, error } = await supabase.from('attempts').select(columns).eq('user_id', user.id).eq('status', 'completed').order('completed_at', { ascending: false }).limit(20);
  if (error) throw new Error('Unable to load interview history.');
  if (!data.length) return [];
  const { data: versions, error: versionError } = await supabase.from('problem_versions').select('id, title, version_number').in('id', data.map((item) => item.problem_version_id));
  if (versionError) throw new Error('Unable to load interview history.');
  return data.map((item) => ({ id: item.id, completedAt: item.completed_at, title: versions.find((v) => v.id === item.problem_version_id)?.title ?? 'Interview', version: versions.find((v) => v.id === item.problem_version_id)?.version_number }));
}

/** DB verifies completed status + ownership and returns only the released review fields. */
export async function getAttemptDebrief(id:string):Promise<import('@/types/authoring').ReleasedDebrief|null> {
  await requireUser('/review'); if(!validUuid(id))return null;
  const db=await createClient();
  const {data,error}=await db.rpc('get_attempt_debrief',{p_attempt_id:id});
  if(error?.code==='42501'||error?.code==='P0002')return null;
  if(error)throw new Error('Unable to load reference material.');
  const value=data as unknown as import('@/types/authoring').ReleasedDebrief;
  if(!value||typeof value.referenceAnswer!=='string'||!Array.isArray(value.keyIdeas)||!Array.isArray(value.alternativeApproaches))throw new Error('Unable to load reference material.');
  return {problemVersionId:value.problemVersionId,referenceAnswer:value.referenceAnswer,keyIdeas:value.keyIdeas.map(x=>({label:x.label,description:x.description})),alternativeApproaches:value.alternativeApproaches.map(x=>({id:x.id,title:x.title,description:x.description}))};
}
