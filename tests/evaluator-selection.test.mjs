import test from 'node:test';
import assert from 'node:assert/strict';
import configured from '../config/evaluator-profiles.json' with { type: 'json' };
import generic from '../config/evaluator-profiles.example.json' with { type: 'json' };
import { parseEvaluatorRegistry, parseRegistry, selectEvaluatorProfile } from '../src/lib/evaluator/registry.ts';
import { OpenAICompatibleProvider } from '../src/lib/evaluator/providers/openai-compatible.ts';
import { buildEvaluationInput } from '../src/lib/evaluator/input.ts';
import { evaluate } from '../src/lib/evaluator/engine.ts';
import { loadStaticCases } from '../scripts/evals/datasets.mjs';

const registry = parseEvaluatorRegistry(configured);
const fixture = (await loadStaticCases()).find(c => c.id === 'reason-signal');
const env = { EVAL_PROVIDER_A_BASE_URL: 'https://provider.example/v1', EVAL_PROVIDER_A_API_KEY: 'fixture-only-secret' };
const wire = (raw = JSON.stringify(fixture.mockOutput)) => Response.json({
  choices: [{ finish_reason: 'stop', message: { content: raw } }],
  usage: {
    prompt_tokens: 120, completion_tokens: 50,
    prompt_tokens_details: { cached_tokens: 0 },
    completion_tokens_details: { reasoning_tokens: 30 },
  },
});

test('configured default uses Luna medium; explicit difficult modes select xhigh without mutating profiles', () => {
  const before = structuredClone(registry);
  const standard = selectEvaluatorProfile(registry);
  assert.equal(standard.id, 'eval-luna-medium');
  assert.equal(standard.model, 'gpt-6-luna');
  assert.equal(standard.reasoningEffort, 'medium');
  for (const mode of ['complex', 'strong_only']) {
    const difficult = selectEvaluatorProfile(registry, mode);
    assert.equal(difficult.id, 'eval-luna-xhigh');
    assert.equal(difficult.model, standard.model);
    assert.equal(difficult.reasoningEffort, 'xhigh');
  }
  assert.deepEqual(registry, before);
  assert.equal(selectEvaluatorProfile({ ...registry, profiles: [...registry.profiles].reverse() }), registry.profiles[0]);
});

test('selection follows registry IDs rather than hardcoded model names, roles or effort', () => {
  const changed = structuredClone(configured);
  changed.profiles[0].id = 'different-primary';
  changed.profiles[0].model = 'another-compatible-model';
  changed.selection.defaultProfileId = 'different-primary';
  const parsed = parseEvaluatorRegistry(changed);
  assert.equal(selectEvaluatorProfile(parsed).model, 'another-compatible-model');
  assert.equal(selectEvaluatorProfile(parsed, 'complex').id, 'eval-luna-xhigh');
  // Code selection resolves one exact ID; the CLI's "all" shorthand must not expand here.
  changed.profiles[1].id = 'all';
  changed.selection.difficultProfileId = 'all';
  assert.equal(selectEvaluatorProfile(parseEvaluatorRegistry(changed), 'complex').id, 'all');
});

test('missing/disabled selection and invalid modes fail closed without choosing another model', () => {
  assert.throws(() => selectEvaluatorProfile(registry, 'MAX'), /Invalid evaluation mode/);
  assert.throws(() => selectEvaluatorProfile(parseEvaluatorRegistry(generic)), /Set registry selection/);
  for (const mode of ['default', 'complex']) {
    const disabled = structuredClone(registry);
    const id = selectEvaluatorProfile(disabled, mode).id;
    disabled.profiles.find(p => p.id === id).enabled = false;
    assert.throws(() => selectEvaluatorProfile(disabled, mode), /disabled/);
  }
  const missing = structuredClone(configured);
  missing.selection.difficultProfileId = 'absent';
  assert.throws(() => parseEvaluatorRegistry(missing), /Invalid evaluator registry/);
});

test('reasoning effort requires supported, unique capability values; legacy providers remain valid', () => {
  for (const mutate of [
    p => { p.reasoningEffort = 'MAX'; },
    p => { p.reasoningEffort = 'max'; }, // Observed endpoint rejection; fail before a paid call.
    p => { p.reasoningEffort = 'minimal'; },
    p => { delete p.capabilities.supportedReasoningEfforts; },
    p => { p.capabilities.supportedReasoningEfforts = []; },
    p => { p.capabilities.supportedReasoningEfforts = ['medium', 'medium']; },
    p => { p.capabilities.supportedReasoningEfforts = ['unlimited']; },
  ]) {
    const changed = structuredClone(configured);
    mutate(changed.profiles[0]);
    assert.throws(() => parseEvaluatorRegistry(changed), /Invalid evaluator registry/);
  }
  const legacy = parseRegistry(generic)[0];
  assert.equal(legacy.reasoningEffort, undefined);
  assert.equal(legacy.capabilities.supportedReasoningEfforts, undefined);
});

test('selected medium/xhigh reaches the provider wire with JSON schema, no temperature/tools, and one request', async () => {
  for (const mode of ['default', 'complex', 'strong_only']) {
    const input = buildEvaluationInput(fixture.problem, fixture.message, { evaluationMode: mode });
    const profile = selectEvaluatorProfile(registry, input.evaluationMode);
    const requests = [];
    const provider = new OpenAICompatibleProvider({ env, fetch: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return wire();
    } });
    const run = await evaluate(input, provider, profile);
    assert.equal(run.status, 'valid');
    assert.equal(requests.length, 1); // A recommendation never triggers a second/difficult-model call.
    const body = requests[0];
    assert.equal(body.model, 'gpt-6-luna');
    assert.equal(body.reasoning_effort, mode === 'default' ? 'medium' : 'xhigh');
    assert.equal(body.max_completion_tokens, profile.maxOutputTokens);
    assert.equal(body.response_format.type, 'json_schema');
    assert.equal(body.response_format.json_schema.strict, true);
    for (const key of ['temperature', 'tools', 'functions', 'max_tokens']) assert.equal(key in body, false);
    assert.ok(!JSON.stringify(body).includes('fixture-only-secret'));
    // completion_tokens already includes reasoning tokens; do not subtract or double-count them.
    assert.equal(run.requests[0].usage.outputTokens, 50);
  }
});

test('structured retry retains the explicitly selected effort and total request limit', async () => {
  const input = buildEvaluationInput(fixture.problem, fixture.message, { evaluationMode: 'complex' });
  const profile = selectEvaluatorProfile(registry, input.evaluationMode);
  const efforts = [];
  const provider = new OpenAICompatibleProvider({ env, fetch: async (_url, options) => {
    efforts.push(JSON.parse(options.body).reasoning_effort);
    return wire(efforts.length === 1 ? 'malformed' : JSON.stringify(fixture.mockOutput));
  } });
  const run = await evaluate(input, provider, profile, { retry: 1 });
  assert.equal(run.status, 'valid');
  assert.equal(run.retryCount, 1);
  assert.deepEqual(efforts, ['xhigh', 'xhigh']);
});

test('adapter rejects unsupported effort before fetch; providers without effort omit the parameter', async () => {
  let requests = 0;
  let body;
  const provider = new OpenAICompatibleProvider({ env, fetch: async (_url, options) => {
    requests++;
    body = JSON.parse(options.body);
    return wire();
  } });
  const input = buildEvaluationInput(fixture.problem, fixture.message);
  for (const reasoningEffort of ['minimal', 'max']) {
    const unsupported = { ...registry.profiles[0], reasoningEffort };
    await assert.rejects(provider.evaluate(input, unsupported), /Invalid evaluator registry/);
  }
  assert.equal(requests, 0);
  await provider.evaluate(input, { ...parseRegistry(generic)[0], enabled: true, model: 'fixture-model' });
  assert.equal(requests, 1);
  assert.equal('reasoning_effort' in body, false);
  assert.equal(body.temperature, 0);
});
