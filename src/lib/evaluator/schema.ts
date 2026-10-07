import { intents, statuses, feedbackCategories, escalationReasons } from './contracts.ts';
import type { EvaluatorResult, ValidationIssue } from './contracts.ts';

// A deliberately small schema subset, shared by the adapter and local validator.
type Schema = { type?: 'object' | 'array' | 'string' | 'boolean' | 'null'; properties?: Record<string, Schema>; required?: string[]; additionalProperties?: false; items?: Schema; enum?: readonly string[]; minLength?: number; maxLength?: number; maxItems?: number; anyOf?: Schema[] };
const text = (maxLength = 200): Schema => ({ type: 'string', minLength: 1, maxLength });
const choice = (values: readonly string[]): Schema => ({ type: 'string', enum: values });
const array = (items: Schema, maxItems = 100): Schema => ({ type: 'array', items, maxItems });
const object = (properties: Record<string, Schema>): Schema => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const evidence = array(object({ messageId: text(), quote: text(4000) }), 8);
export const resultSchema = object({
  intent: choice(intents),
  rubricAssessments: array(object({ rubricNodeId: text(), status: choice(statuses), evidence })),
  detectedMisconceptionIds: array(text()),
  misconceptionEvidence: array(object({ misconceptionId: text(), evidence })),
  contradictions: array(object({ rubricNodeIds: array(text()), evidence })),
  needsEscalation: { type: 'boolean' },
  escalationReason: { anyOf: [choice(escalationReasons), { type: 'null' }] },
  feedbackCategory: choice(feedbackCategories),
  clarification: { anyOf: [object({ kind: choice(['assumption','scope','technical_challenge','other']), relatedToProblem: { type: 'boolean' } }), { type: 'null' }] },
});

function inspect(schema: Schema, value: unknown, path: string): ValidationIssue[] {
  const bad = (code: string) => [{ code, path }];
  if (schema.anyOf) return schema.anyOf.some(s => !inspect(s,value,path).length) ? [] : bad('schema_union');
  if (schema.type === 'null') return value === null ? [] : bad('schema_type');
  if (schema.type === 'array') {
    if (!Array.isArray(value) || value.length > schema.maxItems!) return bad('schema_array');
    return value.flatMap((v,i) => inspect(schema.items!,v,`${path}[${i}]`));
  }
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return bad('schema_object');
    const r = value as Record<string, unknown>, properties = schema.properties!;
    const issues: ValidationIssue[] = [];
    if (Object.keys(r).some(k => !Object.hasOwn(properties,k))) issues.push(...bad('schema_extra_field'));
    for (const k of schema.required!) {
      if (!Object.hasOwn(r,k)) issues.push({ code: 'schema_required', path: `${path}.${k}` });
      else issues.push(...inspect(properties[k],r[k],`${path}.${k}`));
    }
    return issues;
  }
  if (typeof value !== schema.type) return bad('schema_type');
  if (typeof value === 'string' && ((schema.enum && !schema.enum.includes(value)) || value.length < (schema.minLength ?? 0) || value.length > (schema.maxLength ?? Infinity))) return bad('schema_text');
  return [];
}
export function parseResult(raw: string): { ok: true; result: EvaluatorResult } | { ok: false; errorType: 'malformed_output' | 'schema_validation_error'; issues: ValidationIssue[] } {
  let data: unknown;
  try { if (raw.length > 100000) throw new Error(); data = JSON.parse(raw); }
  catch { return { ok: false, errorType: 'malformed_output', issues: [{code:'invalid_json',path:'$'}] }; }
  const issues = inspect(resultSchema, data, '$');
  return issues.length ? { ok: false, errorType: 'schema_validation_error', issues } : { ok: true, result: data as EvaluatorResult };
}
