import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { processMessage, deliverHint } from '../src/lib/evaluator/live/runtime.ts';
import { liveConfig } from '../src/lib/evaluator/live/config.ts';
import { parseEvaluatorRegistry } from '../src/lib/evaluator/registry.ts';
import { MockEvaluatorProvider } from '../src/lib/evaluator/providers/mock.ts';
import { EvaluationError } from '../src/lib/evaluator/contracts.ts';
import registry from '../config/evaluator-profiles.json' with { type: 'json' };
import { isSameOriginMutation } from '../src/lib/auth/validation.ts';

test('Admin Test session mutations require a matching browser Origin/Host', () => {
  const request = headers => new Request('http://127.0.0.1:3001/admin/test/session', { method: 'POST', headers });
  assert.equal(isSameOriginMutation(request({ origin: 'http://localhost:3001', host: 'localhost:3001', 'sec-fetch-site': 'same-origin' })), true);
  assert.equal(isSameOriginMutation(request({ origin: 'https://interview.example', host: 'interview.example' })), true);
  for (const headers of [
    { host: 'localhost:3001' }, { origin: 'null', host: 'localhost:3001' },
    { origin: 'http://attacker.example', host: 'localhost:3001' },
    { origin: 'http://localhost:3002', host: 'localhost:3001' },
    { origin: 'http://localhost:3001', host: 'localhost:3001', 'sec-fetch-site': 'cross-site' },
  ]) assert.equal(isSameOriginMutation(request(headers)), false);
});

const ids = { user: randomUUID(), admin: randomUUID(), otherAdmin: randomUUID() };
const secret = 'disposable-admin-test-runtime-capability-0001';
const problemId = 'problem-drone-dynamics';
const baseConfig = liveConfig(parseEvaluatorRegistry(registry), { EVALUATOR_MODE: 'mock' });
const config = { ...baseConfig, limits: { ...baseConfig.limits, perUserMinute: 1000, perAttemptMinute: 1000 } };
const assessment = input => ({
  intent: 'reasoning', rubricAssessments: [{ rubricNodeId: 'drone_dynamics', status: 'confirmed', evidence: [{ messageId: input.message.id, quote: input.message.content }] }],
  detectedMisconceptionIds: [], misconceptionEvidence: [], contradictions: [], needsEscalation: false,
  escalationReason: null, feedbackCategory: 'valid_progress', clarification: null,
});

test('Admin Test: isolated sessions, provenance, reset races and existing evaluation engine', async t => {
  const db = new PGlite();
  const q = async (sql, args = []) => (await db.query(sql, args)).rows;
  const scalar = async (sql, args = []) => Object.values((await q(sql, args))[0])[0];
  const root = () => db.exec('reset role');
  const login = async id => {
    await root(); await q("select set_config('request.jwt.claim.sub',$1,false)", [id ?? '']);
    await db.exec(id ? 'set role authenticated' : 'set role anon');
  };
  const begin = (previous = null, request = randomUUID(), problem = problemId) => scalar('select public.admin_start_test($1,$2,$3)', [problem, request, previous]);
  const store = { operation: (name, attemptId, data) => scalar('select public.evaluator_operation($1,$2,$3,$4)', [secret, name, attemptId, data]) };
  const provider = new MockEvaluatorProvider(input => JSON.stringify(assessment(input)));
  const dependencies = (transport = provider, override = config) => ({ store, config: override, provider: () => transport });
  const submit = (attemptId, content = 'A heavier payload changes acceleration under the same motor command.', transport = provider, override = config) => processMessage(dependencies(transport, override), attemptId, randomUUID(), content);
  const snapshot = async id => {
    await root();
    const value = (await q('select origin,status,problem_version_id,reasoning_state,progress,core_complete,evaluation_mode from public.attempts where id=$1', [id]))[0];
    await login(ids.admin); return value;
  };
  let current, practice, preMigration;
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
      grant usage on schema auth to anon,authenticated;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`);
    const files = (await readdir('supabase/migrations')).filter(name => name.endsWith('.sql')).sort();
    for (const file of files.filter(name => !name.endsWith('_admin_test_workspace.sql'))) {
      await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8'));
    }
    for (const id of Object.values(ids)) await q('insert into auth.users(id) values($1)', [id]);
    await q("update public.profiles set role='admin' where user_id=any($1)", [[ids.admin, ids.otherAdmin]]);
    await q("insert into app_private.evaluator_runtime(secret_sha256) values(encode(sha256(convert_to($1,'UTF8')),'hex'))", [secret]);
    await login(ids.user); preMigration = await scalar('select public.start_interview($1)', [problemId]);
    await submit(preMigration);
    await root();
    const before = (await q('select * from public.attempts where id=$1', [preMigration]))[0];
    const migration = await readFile(`supabase/migrations/${files.find(name => name.endsWith('_admin_test_workspace.sql'))}`, 'utf8');
    await t.test('migration failure restores the original RPC and schema atomically', async () => {
      await assert.rejects(db.exec(migration.replace("notify pgrst, 'reload schema';", "raise exception 'test migration rollback';")), /test migration rollback/);
      assert.equal(await scalar("select count(*) from information_schema.columns where table_schema='public' and table_name='attempts' and column_name='origin'"), 0);
      assert.equal(await scalar("select to_regprocedure('app_private.evaluator_operation_core(text,text,uuid,jsonb)')"), null);
      assert.notEqual(await scalar("select to_regprocedure('public.evaluator_operation(text,text,uuid,jsonb)')"), null);
    });
    await db.exec(migration);

    await t.test('migration preserves pre-existing practice data and fills provenance', async () => {
      const { origin, test_request_id, ...after } = (await q('select * from public.attempts where id=$1', [preMigration]))[0];
      assert.deepEqual(after, before); assert.equal(origin, 'practice'); assert.equal(test_request_id, null);
      assert.equal(await scalar('select origin from public.message_evaluations where attempt_id=$1', [preMigration]), 'practice');
      assert.equal(await scalar('select count(*) from public.attempt_messages where attempt_id=$1', [preMigration]), 2);
    });
    await t.test('anonymous and ordinary users cannot create tests or bypass the wrapper', async () => {
      await login(null); await assert.rejects(begin(), /permission/);
      await login(ids.user); await assert.rejects(begin(), /Administrator/);
      await assert.rejects(q('select app_private.evaluator_operation_core($1,$2,$3,$4)', [secret, 'hint_context', preMigration, {}]), /permission/);
      await assert.rejects(q("update public.attempts set origin='admin_test' where id=$1", [preMigration]), /permission/);
    });
    await t.test('admin start is idempotent and separate from practice in either order', async () => {
      await login(ids.admin); current = await begin();
      practice = await scalar('select public.start_interview($1)', [problemId]);
      assert.notEqual(practice, current);
      assert.equal(await begin(), current); assert.equal(await scalar('select public.start_interview($1)', [problemId]), practice);
      await login(ids.otherAdmin);
      const normal = await scalar('select public.start_interview($1)', [problemId]);
      const sandbox = await begin(); assert.notEqual(normal, sandbox);
      await login(ids.admin); assert.equal((await snapshot(current)).origin, 'admin_test');
    });
    await t.test('normal practice by an admin is labelled practice, not inferred from role', async () => {
      await submit(practice);
      assert.equal(await scalar('select origin from public.message_evaluations where attempt_id=$1', [practice]), 'practice');
    });
    await t.test('test reasoning uses the shared engine and persists an Admin Test assessment', async () => {
      await submit(current);
      const state = await snapshot(current); assert.equal(Number(state.progress), 12.5); assert.equal(state.reasoning_state.revision, 1);
      const rows = await q('select e.origin,e.status,r.evaluator_profile from public.message_evaluations e join public.assessment_runs r on r.evaluation_id=e.id where e.attempt_id=$1', [current]);
      assert.equal(rows.length, 1); assert.equal(rows[0].origin, 'admin_test'); assert.equal(rows[0].status, 'succeeded');
      assert.equal(await scalar('select count(*) from public.attempt_messages where attempt_id=$1', [current]), 2);
      await assert.rejects(q('select public.get_attempt_debrief($1)', [current]), /unavailable/);
    });
    await t.test('Reset clears progress, history and hints without deleting QA or practice', async () => {
      await deliverHint(store, current, randomUUID());
      const previous = current;
      const practiceBefore = await snapshot(practice);
      current = await begin(previous);
      const after = await snapshot(current);
      assert.notEqual(current, previous); assert.equal(Number(after.progress), 0); assert.equal(after.reasoning_state.revision, 0);
      assert.equal(after.core_complete, false); assert.equal(after.evaluation_mode, null);
      assert.equal(await scalar('select count(*) from public.attempt_messages where attempt_id=$1', [current]), 0);
      assert.equal(await scalar('select count(*) from public.hint_events where attempt_id=$1', [current]), 0);
      assert.equal((await snapshot(previous)).status, 'abandoned');
      assert.equal(await scalar('select count(*) from public.hint_events where attempt_id=$1', [previous]), 1);
      assert.equal(await scalar('select origin from public.message_evaluations where attempt_id=$1', [previous]), 'admin_test');
      assert.deepEqual(await snapshot(practice), practiceBefore);
    });
    await t.test('duplicate reset and stale second tab never clear the replacement conversation', async () => {
      const previous = current, request = randomUUID(); current = await begin(previous, request);
      await submit(current);
      const saved = await snapshot(current);
      assert.equal(await begin(previous, request), current); assert.equal(await begin(previous), current);
      assert.deepEqual(await snapshot(current), saved);
      assert.equal(await scalar("select count(*) from public.attempts where user_id=$1 and problem_id=$2 and origin='admin_test' and status='in_progress'", [ids.admin, problemId]), 1);
    });
    await t.test('reset during a provider call cancels its claim; late result cannot change either state', async () => {
      current = await begin(current);
      const old = current; let release;
      const gate = new Promise(resolve => { release = resolve; });
      const delayed = new MockEvaluatorProvider(async input => { await gate; return JSON.stringify({ ...assessment(input), needsEscalation: true, escalationReason: 'unknown_approach' }); });
      const pending = submit(old, 'An answer still being evaluated.', delayed);
      try {
        for (let n = 0; delayed.calls === 0 && n < 200; n++) await new Promise(resolve => setTimeout(resolve, 5));
        assert.equal(delayed.calls, 1);
        current = await begin(old);
      } finally { release(); }
      await pending;
      assert.equal(delayed.calls, 1, 'reset stops escalation');
      assert.equal(Number((await snapshot(old)).progress), 0); assert.equal(Number((await snapshot(current)).progress), 0);
      assert.equal(await scalar('select count(*) from public.attempt_messages where attempt_id=$1', [current]), 0);
      assert.equal(await scalar('select error_type from public.message_evaluations where attempt_id=$1', [old]), 'admin_test_reset');
      const run = (await q('select status,error_type,usage_status from public.assessment_runs where attempt_id=$1', [old]))[0];
      assert.deepEqual(run, { status: 'failed', error_type: 'admin_test_reset', usage_status: 'unavailable' });
    });
    await t.test('failed test evaluation retries the same saved message and keeps its origin', async () => {
      const failure = new MockEvaluatorProvider(() => { throw new EvaluationError('provider_timeout'); });
      await submit(current, 'My test response survives a timeout.', failure);
      const evaluation = await scalar('select public.get_evaluation_status($1)', [current]); assert.equal(evaluation.status, 'failed');
      const retry = randomUUID(); await processMessage(dependencies(), current, retry, undefined, evaluation.id);
      const calls = provider.calls; await processMessage(dependencies(), current, retry, undefined, evaluation.id);
      assert.equal(provider.calls, calls); assert.equal(await scalar("select count(*) from public.attempt_messages where attempt_id=$1 and role='user'", [current]), 1);
      assert.equal(await scalar('select origin from public.message_evaluations where id=$1', [evaluation.id]), 'admin_test');
    });
    await t.test('another admin cannot reset or evaluate the owner test; user cannot read its rows', async () => {
      await login(ids.otherAdmin); await assert.rejects(begin(current), /unavailable/); await assert.rejects(submit(current), /unavailable/);
      await login(ids.user); await assert.rejects(begin(current), /Administrator/);
      assert.equal(await scalar('select count(*) from public.attempts where id=$1', [current]), 0);
      assert.equal(await scalar('select count(*) from public.attempt_messages where attempt_id=$1', [current]), 0);
      assert.equal(await scalar('select count(*) from public.message_evaluations where attempt_id=$1', [current]), 0);
      await login(ids.admin);
    });
    await t.test('a revoked admin role cannot use test evaluation or read its session', async () => {
      await root(); await q("update public.profiles set role='user' where user_id=$1", [ids.admin]);
      await login(ids.admin);
      assert.equal(await scalar('select count(*) from public.attempts where id=$1', [current]), 0);
      await assert.rejects(submit(current), /Administrator/);
      await assert.rejects(begin(), /Administrator/);
      await root(); await q("update public.profiles set role='admin' where user_id=$1", [ids.admin]); await login(ids.admin);
    });
    await t.test('Reset does not bypass the account provider-request budget', async () => {
      const count = Number(await scalar('select count(*) from public.assessment_runs where user_id=$1', [ids.admin]));
      current = await begin(current); const calls = provider.calls;
      const outcome = await submit(current, 'A fresh session still shares account limits.', provider, { ...config, limits: { ...config.limits, requestsPerDay: count } });
      assert.equal(outcome.guard, 'request_quota'); assert.equal(provider.calls, calls);
    });
    await t.test('only published problems can start tests; Reset chooses the new published version', async () => {
      const draftProblem = await scalar('select public.admin_create_problem($1,$2)', ['admin-test-unpublished', 'Unpublished test fixture']);
      await assert.rejects(begin(null, randomUUID(), draftProblem), /unavailable/);
      const oldVersion = (await snapshot(current)).problem_version_id;
      const draft = await scalar('select public.admin_create_version($1)', [problemId]);
      assert.equal(await begin(), current);
      const revision = await scalar('select revision from public.problem_versions where id=$1', [draft]);
      await q('select public.admin_publish_version($1,$2)', [draft, revision]);
      assert.equal((await snapshot(current)).problem_version_id, oldVersion);
      current = await begin(current);
      assert.equal((await snapshot(current)).problem_version_id, draft);
      assert.equal((await snapshot(practice)).problem_version_id, oldVersion);
    });
  } finally { await db.close(); }
});
