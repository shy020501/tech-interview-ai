'use server';
import { getCurrentUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { getAttempt } from '@/lib/data/attempts';
import { validUuid } from '@/lib/auth/validation';
import { runtimeDependencies, runtimeStore } from '@/lib/evaluator/live/server';
import { processMessage, deliverHint } from '@/lib/evaluator/live/runtime';
import { LiveConfigurationError } from '@/lib/evaluator/live/config';
import { guardFeedback } from '@/lib/evaluator/live/feedback';
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
  if (!validUuid(attemptId) || !validUuid(requestId) || typeof message!=='string') return {ok:false,error:'Invalid interview request.'};
  try {
    const dependencies=await runtimeDependencies();
    if(!message.trim())return {ok:false,error:guardFeedback('empty_message')};
    if(message.length>dependencies.config.limits.maxMessageChars)return {ok:false,error:guardFeedback('message_too_long')};
    const result=await processMessage(dependencies,attemptId,requestId,message);
    if(result.guard)return {ok:false,error:guardFeedback(result.guard),attempt:await getAttempt(attemptId)??undefined};
    return await snapshot(attemptId);
  } catch(error) { if(error instanceof LiveConfigurationError)return {ok:false,error:error.message}; return {ok:false,error:'Evaluation is unavailable. Please refresh to check your saved conversation. If this continues, contact the administrator.'}; }
}
export async function retryEvaluation(attemptId:unknown,evaluationId:unknown,requestId:unknown):Promise<AttemptActionResult>{
 if(!await getCurrentUser())return signInRequired;
 if(!validUuid(attemptId)||!validUuid(evaluationId)||!validUuid(requestId))return {ok:false,error:'Invalid evaluation request.'};
 try {
  const result=await processMessage(await runtimeDependencies(),attemptId,requestId,undefined,evaluationId);
  if(result.guard)return {ok:false,error:guardFeedback(result.guard),attempt:await getAttempt(attemptId)??undefined};
  return await snapshot(attemptId);
 } catch(error) {if(error instanceof LiveConfigurationError)return {ok:false,error:error.message};return {ok:false,error:'Evaluation is unavailable. Your saved conversation remains accessible.'};}
}
export async function refreshInterview(attemptId:unknown):Promise<AttemptActionResult>{
 if(!await getCurrentUser())return signInRequired;
 if(!validUuid(attemptId))return {ok:false,error:'Invalid interview request.'};
 return snapshot(attemptId);
}
export async function requestHint(attemptId: unknown, requestId: unknown): Promise<AttemptActionResult> {
  if (!await getCurrentUser()) return signInRequired;
  if (!validUuid(attemptId) || !validUuid(requestId)) return { ok: false, error: 'This interview is not available.' };
  try {
    const result=await deliverHint(await runtimeStore(),attemptId,requestId);
    if(result.guard)return {ok:false,error:guardFeedback(result.guard)};
    return await snapshot(attemptId);
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
