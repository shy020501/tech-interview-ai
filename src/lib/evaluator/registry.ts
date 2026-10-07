import { evaluationModes, reasoningEfforts } from './contracts.ts';
import type { EvaluationMode, EvaluatorProfile, EvaluatorRegistry } from './contracts.ts';

function invalid(): never { throw new Error('Invalid evaluator registry. Check docs/EVALUATOR.md; no configuration values were logged.'); }
function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid(); return value as Record<string,unknown>; }
function str(value: unknown): string { return typeof value === 'string' && value.length > 0 && value.length <= 200 ? value : invalid(); }
function num(value: unknown, min: number, max: number): number { return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : invalid(); }
function bool(value: unknown): boolean { return typeof value === 'boolean' ? value : invalid(); }
function envName(value: unknown): string { const s=str(value); return /^[A-Z][A-Z0-9_]+$/.test(s) && !s.startsWith('NEXT_PUBLIC_') ? s : invalid(); }
function choose<T extends string>(value: unknown, values: readonly T[]): T { return typeof value === 'string' && values.includes(value as T) ? value as T : invalid(); }
function keys(r: Record<string,unknown>, allowed: string[]) { if (Object.keys(r).some(k => !allowed.includes(k))) invalid(); }
export function parseEvaluatorRegistry(value: unknown): EvaluatorRegistry {
  const root=record(value); keys(root,['profiles','selection']);
  if (!Array.isArray(root.profiles) || root.profiles.length > 20) return invalid();
  const profiles = root.profiles.map(value => {
    const p=record(value); keys(p,['id','providerType','model','baseUrlEnv','apiKeyEnv','maxOutputTokens','timeoutMs','enabled','role','capabilities','headerEnv','pricing','reasoningEffort']);
    const c=record(p.capabilities); keys(c,['supportsJsonSchema','supportsJsonMode','supportsUsageReporting','supportsTemperature','outputTokenParameter','supportedReasoningEfforts']);
    const id=str(p.id); if (!/^[a-z0-9][a-z0-9_-]*$/.test(id)) invalid();
    const profile: EvaluatorProfile = {
      id,providerType:str(p.providerType),model:str(p.model),baseUrlEnv:envName(p.baseUrlEnv),apiKeyEnv:envName(p.apiKeyEnv),
      maxOutputTokens:num(p.maxOutputTokens,1,32000),timeoutMs:num(p.timeoutMs,100,120000),enabled:bool(p.enabled),
      role:choose(p.role,['primary_candidate','escalation_candidate','benchmark_only']),
      capabilities:{supportsJsonSchema:bool(c.supportsJsonSchema),supportsJsonMode:bool(c.supportsJsonMode),supportsUsageReporting:bool(c.supportsUsageReporting),supportsTemperature:bool(c.supportsTemperature),outputTokenParameter:choose(c.outputTokenParameter,['max_tokens','max_completion_tokens'])},
    };
    if (!Number.isInteger(profile.maxOutputTokens) || !Number.isInteger(profile.timeoutMs)) invalid();
    if (c.supportedReasoningEfforts !== undefined) {
      if (!Array.isArray(c.supportedReasoningEfforts) || !c.supportedReasoningEfforts.length) invalid();
      const supported=c.supportedReasoningEfforts.map(value=>choose(value,reasoningEfforts));
      if (new Set(supported).size !== supported.length) invalid();
      profile.capabilities.supportedReasoningEfforts=supported;
    }
    if (p.reasoningEffort !== undefined) profile.reasoningEffort=choose(p.reasoningEffort,reasoningEfforts);
    getReasoningEffort(profile);
    if (p.headerEnv !== undefined) {
      const headers=record(p.headerEnv);
      for (const [name,v] of Object.entries(headers)) {
        if (!/^[A-Za-z][A-Za-z0-9-]{0,63}$/.test(name) || ['authorization','content-type','host','cookie','content-length','connection','transfer-encoding'].includes(name.toLowerCase())) invalid();
        envName(v);
      }
      profile.headerEnv=Object.fromEntries(Object.entries(headers).map(([k,v]) => [k,envName(v)]));
    }
    if (p.pricing !== undefined) {
      const price=record(p.pricing); keys(price,['currency','inputPerMillion','outputPerMillion','cachedInputPerMillion','asOf']);
      profile.pricing={currency:choose(price.currency,['USD']),inputPerMillion:num(price.inputPerMillion,0,10000),outputPerMillion:num(price.outputPerMillion,0,10000),asOf:str(price.asOf)};
      if (!/^\d{4}-\d{2}-\d{2}$/.test(profile.pricing.asOf)) invalid();
      if (price.cachedInputPerMillion !== undefined) profile.pricing.cachedInputPerMillion=num(price.cachedInputPerMillion,0,10000);
    }
    return profile;
  });
  if (new Set(profiles.map(p => p.id)).size !== profiles.length) invalid();
  const registry: EvaluatorRegistry={profiles};
  if (root.selection !== undefined) {
    const s=record(root.selection);keys(s,['defaultProfileId','difficultProfileId']);
    registry.selection={defaultProfileId:str(s.defaultProfileId),difficultProfileId:str(s.difficultProfileId)};
    if (Object.values(registry.selection).some(id=>!profiles.some(p=>p.id===id))) invalid();
  }
  return registry;
}
// Preserve the profile-list API for callers that explicitly compare profiles.
export function parseRegistry(value: unknown): EvaluatorProfile[] {
  return parseEvaluatorRegistry(value).profiles;
}
export function getReasoningEffort(profile: EvaluatorProfile) {
  const effort=profile.reasoningEffort;
  if (effort !== undefined && (!reasoningEfforts.includes(effort) || !profile.capabilities.supportedReasoningEfforts?.includes(effort))) invalid();
  return effort;
}
/** Pure selection from trusted caller configuration. Never inspects user text or calls a model. */
export function selectEvaluatorProfile(registry: EvaluatorRegistry, mode: EvaluationMode = 'default'): EvaluatorProfile {
  if (!evaluationModes.includes(mode)) throw new Error('Invalid evaluation mode.');
  if (!registry.selection) throw new Error('Set registry selection before choosing an evaluation mode.');
  const id=mode==='default'?registry.selection.defaultProfileId:registry.selection.difficultProfileId;
  const profile=registry.profiles.find(p=>p.id===id&&p.enabled);
  if (!profile) throw new Error('Profile is missing or disabled.');
  return profile;
}
export function selectProfiles(profiles: EvaluatorProfile[], ids: string[]): EvaluatorProfile[] {
  if (!ids.length) throw new Error('Choose --profile <id> or explicitly --profile all.');
  const selected = ids.includes('all') ? profiles.filter(p => p.enabled) : ids.map(id => profiles.find(p => p.id === id && p.enabled));
  if (!selected.length || selected.some(p => !p) || new Set(selected).size !== selected.length) throw new Error('Profile is missing, disabled or duplicated.');
  return selected as EvaluatorProfile[];
}
export function resolveConnection(profile: EvaluatorProfile, env: Record<string,string|undefined>) {
  let url: URL;
  try { url=new URL(env[profile.baseUrlEnv] ?? ''); } catch { throw new Error('Set the profile base URL environment variable.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Use an HTTPS provider base URL without credentials, query or fragment.');
  const key=env[profile.apiKeyEnv]?.trim();
  if (!key || /[\r\n]/.test(key)) throw new Error('Set the profile API key environment variable.');
  const headers: Record<string,string> = {Authorization:`Bearer ${key}`,'Content-Type':'application/json'};
  for (const [name,variable] of Object.entries(profile.headerEnv ?? {})) {
    const value=env[variable]; if (!value || /[\r\n]/.test(value)) throw new Error('Set the optional provider header environment variable.');
    headers[name]=value;
  }
  return {endpoint:`${url.href.replace(/\/$/,'')}/chat/completions`,headers};
}
