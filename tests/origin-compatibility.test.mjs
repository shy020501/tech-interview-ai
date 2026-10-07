import assert from 'node:assert/strict';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { isMissingOriginColumn, readWithOriginFallback } from '../src/lib/data/attempt-origin.ts';

test('origin compatibility restores legacy reads and detects the schema after migration without a restart', async () => {
  const db = new PGlite();
  try {
    await db.exec("create table attempts(id text primary key); insert into attempts values ('saved-practice')");
    const calls = [];
    const read = async withOrigin => {
      calls.push(withOrigin);
      try {
        return { data: (await db.query(withOrigin
          ? "select id from attempts where attempts.origin = 'practice'"
          : 'select id from attempts')).rows, error: null };
      } catch (error) { return { data: null, error }; }
    };
    const before = await readWithOriginFallback('attempts', read);
    assert.equal(before.originAvailable, false);
    assert.equal(before.result.error, null);
    assert.deepEqual(before.result.data, [{ id: 'saved-practice' }]);
    assert.deepEqual(calls, [true, false]);

    await db.exec("alter table attempts add origin text not null default 'practice'; insert into attempts values ('isolated-test', 'admin_test')");
    calls.length = 0;
    const after = await readWithOriginFallback('attempts', read);
    assert.equal(after.originAvailable, true);
    assert.deepEqual(after.result.data, [{ id: 'saved-practice' }]);
    assert.deepEqual(calls, [true]); // A modern query must never fall back and mix in test conversations.
  } finally { await db.close(); }
});

test('evaluation provenance compatibility only recognizes the exact absent origin column', () => {
  for (const table of ['attempts', 'message_evaluations']) {
    assert.equal(isMissingOriginColumn({ code: '42703', message: `column ${table}.origin does not exist` }, table), true);
    assert.equal(isMissingOriginColumn({ code: '42703', message: `column public.${table}.origin does not exist` }, table), true);
    assert.equal(isMissingOriginColumn({ code: '42703', message: 'column "origin" does not exist' }, table), true);
    assert.equal(isMissingOriginColumn({ code: '42703', message: `column ${table}.progress does not exist` }, table), false);
  }
  assert.equal(isMissingOriginColumn({ code: '42703', message: 'column unrelated.origin does not exist' }, 'attempts'), false);
  // An out-of-date REST schema cache is not proof that the DB lacks test data.
  assert.equal(isMissingOriginColumn({ code: 'PGRST204', message: "Could not find the 'origin' column of 'attempts' in the schema cache" }, 'attempts'), false);
});

test('auth, permission, other schema and network errors cannot trigger unfiltered legacy reads', async () => {
  for (const error of [
    { code: '42501', message: 'permission denied for table attempts' },
    { code: 'PGRST301', message: 'JWT expired' },
    { code: '42P01', message: 'relation message_evaluations does not exist' },
    { code: '42703', message: 'column message_evaluations.status does not exist' },
    { code: '', message: 'TypeError: fetch failed' },
  ]) {
    let calls = 0;
    const response = { data: null, error };
    const value = await readWithOriginFallback('message_evaluations', () => { calls++; return Promise.resolve(response); });
    assert.equal(value.result, response);
    assert.equal(calls, 1);
  }
  const failure = new Error('Connection failed');
  await assert.rejects(readWithOriginFallback('attempts', () => { throw failure; }), error => error === failure);
});

test('a failed legacy query is preserved as a failure, never an empty successful history', async () => {
  const failure = { code: '42501', message: 'permission denied for table message_evaluations' };
  const calls = [];
  const value = await readWithOriginFallback('message_evaluations', withOrigin => {
    calls.push(withOrigin);
    return Promise.resolve({ data: null, error: withOrigin
      ? { code: '42703', message: 'column message_evaluations.origin does not exist' }
      : failure });
  });
  assert.equal(value.result.error, failure);
  assert.deepEqual(calls, [true, false]);
});

test('an empty result with the new schema does not trigger legacy fallback', async () => {
  const calls = [];
  const value = await readWithOriginFallback('message_evaluations', withOrigin => {
    calls.push(withOrigin);
    return Promise.resolve({ data: [], error: null });
  });
  assert.equal(value.originAvailable, true);
  assert.deepEqual(value.result.data, []);
  assert.deepEqual(calls, [true]);
});
