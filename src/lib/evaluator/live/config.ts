import { defaultGuardConfig } from '../guards.ts';
import type { EvaluatorProfile, EvaluatorRegistry } from '../contracts.ts';
import { selectEvaluatorProfile, selectProfiles, resolveConnection } from '../registry.ts';

export class LiveConfigurationError extends Error { constructor(){super('Live evaluation is not configured. Please contact the administrator.');} }
export const liveDefaults = { maxMessageChars:defaultGuardConfig.maxMessageChars, perUserMinute:defaultGuardConfig.maxRecentRequests, perAttemptMinute:6, perAttempt:defaultGuardConfig.maxAttemptEvaluations, perDay:defaultGuardConfig.maxDailyEvaluations, escalationsPerDay:defaultGuardConfig.maxDailyEscalations, requestsPerDay:1000, abuseThreshold:defaultGuardConfig.maxConsecutiveAbuse, cooldownSeconds:60, maxRetries:2, structuredRetries:0, leaseSeconds:420 };
export type LiveLimits = typeof liveDefaults;
export interface LiveConfig { mode:'live'|'mock'; primary:EvaluatorProfile; escalation:EvaluatorProfile; limits:LiveLimits }
export function liveConfig(registry:EvaluatorRegistry, env:Record<string,string|undefined>):LiveConfig {
  const mode=env.EVALUATOR_MODE;
  if(mode!=='live'&&mode!=='mock')throw new Error('Evaluator mode is not configured.');
  if(mode==='mock'&&env.NODE_ENV==='production')throw new Error('Mock evaluation is disabled in production.');
  const primary=env.PRIMARY_EVALUATOR_PROFILE?selectProfiles(registry.profiles,[env.PRIMARY_EVALUATOR_PROFILE])[0]:selectEvaluatorProfile(registry);
  const escalation=env.ESCALATION_EVALUATOR_PROFILE?selectProfiles(registry.profiles,[env.ESCALATION_EVALUATOR_PROFILE])[0]:selectEvaluatorProfile(registry,'complex');
  if(mode==='live')for(const p of [primary,escalation]){if(p.providerType!=='openai_compatible')throw new Error('No adapter configured.');resolveConnection(p,env);}
  const names:Partial<Record<keyof LiveLimits,string>>={maxMessageChars:'MAX_EVALUATION_MESSAGE_CHARS',perUserMinute:'MAX_EVALUATIONS_PER_MINUTE',perAttemptMinute:'MAX_ATTEMPT_EVALUATIONS_PER_MINUTE',perAttempt:'MAX_EVALUATIONS_PER_ATTEMPT',perDay:'MAX_EVALUATIONS_PER_DAY',escalationsPerDay:'MAX_ESCALATIONS_PER_DAY',requestsPerDay:'MAX_PROVIDER_REQUESTS_PER_DAY',abuseThreshold:'ABUSE_STRIKE_THRESHOLD',cooldownSeconds:'ABUSE_COOLDOWN_SECONDS',maxRetries:'MAX_EVALUATION_RETRIES',structuredRetries:'EVALUATOR_STRUCTURED_RETRIES'};
  const limits={...liveDefaults};
  for(const [key,name] of Object.entries(names))if(env[name]){
    const value=Number(env[name]);if(!Number.isInteger(value)||value<0||value>20000)throw new Error('Invalid evaluator limits.');limits[key as keyof LiveLimits]=value;
  }
  if(limits.maxMessageChars<1||limits.structuredRetries>1||limits.maxRetries>3||limits.cooldownSeconds<1||limits.abuseThreshold<1)throw new Error('Invalid evaluator limits.');
  limits.leaseSeconds=Math.ceil((primary.timeoutMs+escalation.timeoutMs)*(1+limits.structuredRetries)/1000)+60;
  return {mode,primary,escalation,limits};
}
