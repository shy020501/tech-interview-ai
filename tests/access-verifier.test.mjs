import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { requireRows, verifyAccess } from '../scripts/verify-authenticated-access.mjs';

function accounts(mode = 'isolated') {
  return ['a', 'b'].map((owner) => ({
    userId: owner,
    client: createClient('https://test.supabase.co', 'sb_publishable_fixture', {
      accessToken: async () => owner,
      global: { fetch: async (input, options) => {
        const url = new URL(input);
        assert.equal(new Headers(options.headers).get('Authorization'), `Bearer ${owner}`);
        assert.equal(options.method, 'GET');
        const table = url.pathname.split('/').at(-1);
        const target = (url.searchParams.get('id') ?? url.searchParams.get('attempt_id'))?.replace('eq.', '');
        const foreign = target && target !== `attempt-${owner}`;
        if (mode === 'expired' && foreign) return Response.json({ code: 'PGRST301', message: 'Expired token' }, { status: 401 });
        if (mode === 'forbidden' && foreign) return Response.json({ code: '42501', message: 'Denied' }, { status: 403 });
        let data;
        if (table === 'profiles') data = [{ user_id: owner, role: owner === 'a' || mode === 'both-admin' ? 'admin' : 'user' }];
        else if (table === 'attempts') data = foreign ? [] : [{ id: `attempt-${owner}`, user_id: owner }];
        else if (table === 'attempt_messages' || table === 'hint_events') {
          data = foreign && mode !== 'record-leak' ? [] : [{ id: `row-${owner}`, attempt_id: target }];
          if (mode === 'missing-own-hint' && table === 'hint_events' && !foreign) data = [];
        } else if (table === 'problem_evaluation_packages') {
          data = owner === 'a' || mode === 'package-leak' ? [{ problem_version_id: 'private-v1' }] : [];
          if (mode === 'no-packages') data = [];
        } else assert.fail(`Unexpected endpoint: ${table}`);
        return Response.json(data);
      } },
    }),
  }));
}

test('live access verifier checks real SDK queries, both ownership directions, and a positive private-package control', async () => {
  const messages = [];
  await verifyAccess(accounts(), (message) => messages.push(message));
  assert.equal(messages.length, 5);
});

for (const mode of ['expired', 'forbidden', 'both-admin', 'record-leak', 'package-leak', 'missing-own-hint', 'no-packages']) {
  test(`live access verifier cannot report success for ${mode}`, async () => {
    await assert.rejects(verifyAccess(accounts(mode), () => {}));
  });
}

test('same-account sessions are rejected before any access checks', async () => {
  const pair = accounts();
  pair[1].userId = pair[0].userId;
  await assert.rejects(verifyAccess(pair, () => {}), /two different accounts/);
});

test('empty results only pass as successful, well-formed query responses', () => {
  assert.throws(() => requireRows({ status: 200, data: null, error: null }, 'query'));
  assert.throws(() => requireRows({ status: 200, data: [], error: { message: 'sensitive error must not escape' } }, 'query'), (error) => !error.message.includes('sensitive'));
  assert.deepEqual(requireRows({ status: 200, data: [], error: null }, 'query'), []);
});
