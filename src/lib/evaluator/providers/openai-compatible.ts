import process from 'node:process';
import { EvaluationError, unavailableUsage } from '../contracts.ts';
import type { EvaluatorProvider, EvaluatorProfile, EvaluationInput, TokenUsage, ProviderDiagnostic } from '../contracts.ts';
import { getReasoningEffort, resolveConnection } from '../registry.ts';
import { buildPrompt } from '../prompt.ts';
import { resultSchema } from '../schema.ts';

function object(v: unknown): Record<string,unknown> { return v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string,unknown> : {}; }
export function readUsage(raw: unknown): TokenUsage {
  const r=object(raw),details=object(r.prompt_tokens_details);
  const count=(v:unknown): number|null => typeof v === 'number' && Number.isSafeInteger(v) && v>=0 ? v : null;
  const inputTokens=count(r.prompt_tokens),outputTokens=count(r.completion_tokens),cachedInputTokens=count(details.cached_tokens);
  if (inputTokens === null || outputTokens === null || (cachedInputTokens !== null && cachedInputTokens>inputTokens)) return unavailableUsage();
  return {status:'exact',inputTokens,outputTokens,cachedInputTokens};
}
async function boundedBody(response: Response, maxBytes = 250000): Promise<string> {
  if (!response.body) throw new EvaluationError('malformed_output');
  const reader=response.body.getReader(); const chunks: Uint8Array[]=[]; let size=0;
  try {
    while (true) {
      const {value,done}=await reader.read(); if(done)break;
      size+=value.length; if(size>maxBytes) { await reader.cancel(); throw new EvaluationError('malformed_output'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString('utf8');
}
const errorCodes = new Set([
  'unsupported_value', 'unsupported_parameter', 'invalid_value', 'invalid_parameter', 'invalid_request_error',
  'model_not_found', 'context_length_exceeded', 'insufficient_quota', 'credit_balance_exhausted',
  'rate_limit_exceeded', 'slow_down', 'invalid_api_key', 'server_error', 'billing_hard_limit_reached',
  'permission_denied', 'not_found',
]);
const errorTypes = new Set(['invalid_request_error', 'authentication_error', 'permission_error', 'rate_limit_error', 'server_error', 'api_error', 'not_found_error']);
const errorParams = new Set(['model', 'reasoning_effort', 'reasoning.effort', 'max_tokens', 'max_completion_tokens', 'temperature', 'top_p', 'response_format', 'response_format.json_schema', 'messages', 'service_tier']);
async function readErrorDiagnostic(response: Response): Promise<ProviderDiagnostic> {
  let error: Record<string, unknown> = {};
  try { error = object(object(JSON.parse(await boundedBody(response, 16384))).error); }
  catch { /* Keep the known HTTP status even for HTML, oversized or interrupted error bodies. */ }
  const allowed = (value: unknown, values: Set<string>) => typeof value === 'string' && values.has(value) ? value : null;
  // Provider errors can echo credentials and input. Discard messages, headers and unknown identifiers.
  return { httpStatus: response.status, code: allowed(error.code, errorCodes), type: allowed(error.type, errorTypes), param: allowed(error.param, errorParams) };
}
/** Transport only. No tools, SDK agents, model choice, conversation endpoint or logging. */
export class OpenAICompatibleProvider implements EvaluatorProvider {
  private readonly env: Record<string,string|undefined>;
  private readonly request: typeof fetch;
  constructor(options: {env?:Record<string,string|undefined>;fetch?:typeof fetch} = {}) { this.env=options.env??process.env;this.request=options.fetch??fetch; }
  async evaluate(input: EvaluationInput, profile: EvaluatorProfile, options?: {structuredRetry:boolean}) {
    const reasoningEffort=getReasoningEffort(profile);
    const connection=resolveConnection(profile,this.env);
    const capabilities=profile.capabilities;
    const body = {
      model:profile.model,messages:buildPrompt(input,options?.structuredRetry),stream:false,
      [capabilities.outputTokenParameter]:profile.maxOutputTokens,
      ...(reasoningEffort!==undefined?{reasoning_effort:reasoningEffort}:{}),
      ...(capabilities.supportsTemperature?{temperature:0}:{}),
      ...(capabilities.supportsJsonSchema?{response_format:{type:'json_schema',json_schema:{name:'interview_evaluation_v1',strict:true,schema:resultSchema}}}:capabilities.supportsJsonMode?{response_format:{type:'json_object'}}:{}),
    };
    const signal=AbortSignal.timeout(profile.timeoutMs);
    try {
      const response=await this.request(connection.endpoint,{method:'POST',headers:connection.headers,body:JSON.stringify(body),signal,redirect:'error'});
      if(!response.ok) {
        const diagnostic=await readErrorDiagnostic(response);
        throw new EvaluationError(response.status===429?'provider_rate_limit':[401,403].includes(response.status)?'provider_auth_error':'provider_error',diagnostic);
      }
      let payload: Record<string,unknown>;
      try { payload=object(JSON.parse(await boundedBody(response))); }
      catch(error) { if(signal.aborted)throw error; throw new EvaluationError('malformed_output'); }
      const choices=payload.choices,first=object(Array.isArray(choices)?choices[0]:null),message=object(first.message);
      const usage=capabilities.supportsUsageReporting?readUsage(payload.usage):unavailableUsage();
      // Refusal, truncation, tool calls and missing text never become successful assessments.
      if(first.finish_reason!=='stop'||message.refusal||message.tool_calls||typeof message.content!=='string') return {raw:'',usage};
      return {raw:message.content,usage};
    } catch(error) {
      if(error instanceof EvaluationError && error.providerDiagnostic)throw error;
      if(signal.aborted)throw new EvaluationError('provider_timeout');
      if(error instanceof EvaluationError)throw error;
      // Never propagate fetch/provider errors, which may contain headers or echoed prompts.
      throw new EvaluationError('provider_error');
    }
  }
}
