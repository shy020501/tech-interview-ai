import type { Intent } from './contracts.ts';
export const defaultGuardConfig = { maxMessageChars:4000, maxRecentRequests:12, maxAttemptEvaluations:100, maxDailyEvaluations:300, maxDailyEscalations:20, maxInputTokensPerDay:200000, maxConsecutiveAbuse:3 };
export interface GuardContext {
  active: boolean; previousMessage?: string; recentRequestCount?: number; attemptEvaluations?: number;
  dailyEvaluations?: number; dailyEscalations?: number; dailyInputTokens?: number; consecutiveAbuse?: number;
}
export type GuardReason = 'inactive_attempt'|'empty_message'|'message_too_long'|'duplicate_message'|'rate_limit'|'attempt_quota'|'daily_quota'|'input_budget'|'abuse_cooldown';
export function preGuard(message: string, context: GuardContext, config = defaultGuardConfig): {allowed:true}|{allowed:false;reason:GuardReason} {
  const deny = (reason: GuardReason) => ({allowed:false as const,reason});
  if (!context.active) return deny('inactive_attempt');
  if (!message.trim()) return deny('empty_message');
  if (message.length > config.maxMessageChars) return deny('message_too_long');
  if (context.previousMessage === message) return deny('duplicate_message');
  if ((context.consecutiveAbuse ?? 0) >= config.maxConsecutiveAbuse) return deny('abuse_cooldown');
  if ((context.recentRequestCount ?? 0) >= config.maxRecentRequests) return deny('rate_limit');
  if ((context.attemptEvaluations ?? 0) >= config.maxAttemptEvaluations) return deny('attempt_quota');
  if ((context.dailyEvaluations ?? 0) >= config.maxDailyEvaluations) return deny('daily_quota');
  if ((context.dailyInputTokens ?? 0) >= config.maxInputTokensPerDay) return deny('input_budget');
  return {allowed:true};
}
export function nextAbuseStrikes(previous: number, intent: Intent): number {
  // Clarification, uncertainty and being stuck are never abuse strikes.
  return intent === 'off_topic' || intent === 'prompt_injection' ? previous+1 : 0;
}
export function canSpendEscalation(context: GuardContext, config = defaultGuardConfig) {
  return (context.dailyEscalations ?? 0) < config.maxDailyEscalations;
}
