import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { safeNextPath, validMessage, validUuid } from '../src/lib/auth/validation.ts';
import seed from '../supabase/seed-data.json' with { type: 'json' };

test('auth return paths reject external, normalized traversal and malformed destinations', () => {
  for (const input of ['https://evil.example', '//evil.example', '/\\evil.example', '/%2f%2fevil.example', '/problems/../../outside', '/login', '/signup', '/admin\nLocation: evil', null, {}, '']) assert.equal(safeNextPath(input), '/problems');
  for (const input of ['/problems/drone-dynamics-adaptation', '/review?attempt=123', '/admin/problems']) assert.equal(safeNextPath(input), input);
});
test('untrusted action inputs enforce identifiers and message bounds', () => {
  assert.equal(validUuid('10000000-0000-0000-0000-000000000001'), true);
  for (const value of [null, {}, 'not-an-id', '10000000-0000-0000-0000-000000000001/other']) assert.equal(validUuid(value), false);
  assert.equal(validMessage(' Reasoning '), true);
  assert.equal(validMessage('x'.repeat(4000)), true);
  for (const value of ['', '\n\t ', 'x'.repeat(4001), null, {}]) assert.equal(validMessage(value), false);
});
test('seed identities, current versions, private packages and primary categories are consistent', () => {
  const categoryIds = new Set(seed.categories.map((c) => c.id));
  assert.equal(categoryIds.size, seed.categories.length);
  for (const c of seed.categories) {
    const visited = new Set([c.id]);
    let parent = c.parentId;
    while (parent) {
      assert.ok(categoryIds.has(parent)); assert.ok(!visited.has(parent)); visited.add(parent);
      parent = seed.categories.find((item) => item.id === parent).parentId;
    }
  }
  assert.equal(new Set(seed.problems.map((p) => p.id)).size, seed.problems.length);
  assert.equal(new Set(seed.problems.map((p) => p.versionId)).size, seed.problems.length);
  for (const p of seed.problems) {
    assert.ok(p.categoryIds.includes(p.primaryCategoryId));
    p.categoryIds.forEach((id) => assert.ok(categoryIds.has(id)));
    for (const field of ['referenceAnswer', 'reasoningRubric', 'hintLadder', 'misconceptions']) assert.equal(field in p, false);
    if (p.status === 'published') assert.ok(seed.evaluationPackages.some((s) => s.problemVersionId === p.versionId));
  }
});
test('migration statically covers every domain with RLS and restricts profile and attempt mutations', () => {
  const sql = readFileSync('supabase/migrations/20261005000100_m2_foundation.sql', 'utf8');
  for (const table of ['profiles', 'categories', 'problems', 'problem_versions', 'problem_categories', 'problem_evaluation_packages', 'attempts', 'attempt_messages', 'hint_events']) assert.ok(sql.includes(`alter table public.${table} enable row level security;`));
  assert.ok(!/grant\s+(?:all|update|insert)[^;]*on public\.profiles/i.test(sql));
  assert.ok(!/grant\s+(?:all|update|insert)[^;]*on public\.attempts/i.test(sql));
  for (const fn of ['start_interview', 'append_interview_turn', 'request_interview_hint', 'finish_interview']) {
    const body = sql.split(`create function public.${fn}`)[1].split('$$;')[0];
    assert.ok(body.includes('auth.uid()'));
    assert.ok(body.includes("set search_path = ''"));
    assert.ok(body.includes('for update'));
  }
  assert.ok(sql.includes('from public, anon;'));
  assert.ok(sql.includes('current_version_belongs_to_problem'));
  assert.ok(sql.includes('one_primary_category_per_problem'));
});
