import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { parseContent, parsePackage } from '../src/lib/authoring/validation.ts';
import seed from '../supabase/seed-data.json' with { type: 'json' };

const migration = '20261007000100_remove_question_type.sql';
const original = seed.problems.find(p => p.id === 'problem-drone-dynamics');
const content = parseContent(original);
const evaluation = parsePackage(seed.evaluationPackages.find(p => p.problemVersionId === original.versionId));

test('difficulty-only classification preserves existing data and the complete authoring lifecycle', async t => {
  const db = new PGlite();
  const ids = { admin: '50000000-0000-0000-0000-000000000001', alice: '50000000-0000-0000-0000-000000000002', bob: '50000000-0000-0000-0000-000000000003' };
  const q = async (sql, args = []) => (await db.query(sql, args)).rows;
  const scalar = async (sql, args = []) => Object.values((await q(sql, args))[0])[0];
  const root = () => db.exec('reset role');
  const login = async id => { await root(); await q("select set_config('request.jwt.claim.sub',$1,false)", [id ?? '']); await db.exec(id ? 'set role authenticated' : 'set role anon'); };
  const candidate = { sourceId: null, suggestedTitle: 'classification-test candidate', suggestedScenario: content.scenario, suggestedQuestion: content.question, suggestedCategoryIds: content.categoryIds, competencyIds: content.competencyIds, difficulty: 'beginner', candidateScore: null, status: 'pending_review', notes: '' };
  const snapshots = async () => ({
    versions: await q("select to_jsonb(v)-'question_type' as row from public.problem_versions v order by id"),
    candidates: await q("select to_jsonb(c)-'question_type' as row from public.question_candidates c order by id"),
    problems: await q('select * from public.problems order by id'),
    packages: await q('select * from public.problem_evaluation_packages order by id'),
    attempts: await q('select * from public.attempts order by id'),
    messages: await q('select * from public.attempt_messages order by id'),
    hints: await q('select * from public.hint_events order by id'),
    categories: await q('select * from public.problem_version_categories order by problem_version_id,category_id'),
  });
  let oldAttempt, existingCandidate, newProblem, version1;
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
      grant usage on schema auth to anon,authenticated;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`);
    for (const file of (await readdir('supabase/migrations')).filter(f => f.endsWith('.sql') && f < migration).sort()) {
      await db.exec(await readFile('supabase/migrations/' + file, 'utf8'));
    }
    for (const id of Object.values(ids)) await q('insert into auth.users(id) values($1)', [id]);
    await q("update public.profiles set role='admin' where user_id=$1", [ids.admin]);
    await login(ids.admin);
    existingCandidate = await scalar('select public.admin_save_candidate(null,$1)', [{ ...candidate, questionType: 'applied' }]);
    await login(ids.alice);
    oldAttempt = await scalar('select public.start_interview($1)', [original.id]);
    await root();
    await q("insert into public.attempt_messages(attempt_id,role,content) values($1,'user','Existing reasoning remains saved.')", [oldAttempt]);
    await q("insert into public.hint_events(attempt_id,hint_id,hint_level,displayed_text) values($1,'legacy-hint',1,'Existing hint remains saved.')", [oldAttempt]);
    const before = await snapshots();
    const sql = await readFile('supabase/migrations/' + migration, 'utf8');

    await t.test('migration is atomic even without a runner transaction', async () => {
      const failed = sql.replace('end;\n$remove_question_type$;', "raise exception 'Intentional classification rollback';\nend;\n$remove_question_type$;");
      assert.notEqual(failed, sql);
      await assert.rejects(db.query(failed), /Intentional classification rollback/);
      assert.equal(await scalar("select count(*)::int from information_schema.columns where table_schema='public' and column_name='question_type'"), 2);
      assert.equal(await scalar("select position('questionType' in prosrc)>0 from pg_proc where oid='public.admin_save_candidate(uuid,jsonb)'::regprocedure"), true);
      assert.deepEqual(await snapshots(), before);
    });
    await db.query(sql);
    await t.test('only the retired columns disappear; content, difficulty, versions and history are unchanged', async () => {
      assert.equal(await scalar("select count(*)::int from information_schema.columns where table_schema='public' and column_name='question_type'"), 0);
      assert.deepEqual(await snapshots(), before);
      assert.equal(await scalar("select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','app_private') and prosrc ~ 'question_type|questionType'"), 0);
      for (const p of seed.problems) assert.equal(await scalar('select difficulty from public.problem_versions where id=$1', [p.versionId]), p.difficulty);
    });
    await t.test('ordinary users still cannot author and public snapshots contain only difficulty', async () => {
      await login(ids.alice);
      await assert.rejects(q('select public.admin_save_candidate(null,$1)', [candidate]), /Administrator/);
      await assert.rejects(q("select public.admin_create_problem('classification-forbidden','Forbidden')"), /Administrator/);
      await assert.rejects(q("select public.admin_save_problem_version($1,1,$2,$3,'[]')", [original.versionId, content, evaluation]), /Administrator/);
      await assert.rejects(q('select public.admin_publish_version($1,1)', [original.versionId]), /Administrator/);
      assert.equal(await scalar('select count(*)::int from public.problem_evaluation_packages'), 0);
      await login(null);
      await assert.rejects(q('select public.admin_save_candidate(null,$1)', [candidate]), /permission/);
      const rows = await q('select * from public.problem_versions');
      assert.equal(rows.length, 3);
      for (const row of rows) { assert.equal('question_type' in row, false); assert.ok(row.difficulty); }
    });
    await t.test('candidate create/edit/conversion no longer requires a question type', async () => {
      await login(ids.admin);
      for (const difficulty of ['beginner', 'intermediate', 'advanced']) {
        const id = await scalar('select public.admin_save_candidate(null,$1)', [{ ...candidate, difficulty }]);
        assert.equal(await scalar('select difficulty from public.question_candidates where id=$1', [id]), difficulty);
      }
      for (const difficulty of ['core', 'applied', null]) {
        await assert.rejects(q('select public.admin_save_candidate(null,$1)', [{ ...candidate, difficulty }]), /constraint|null/i);
      }
      await scalar('select public.admin_save_candidate($1,$2)', [existingCandidate, { ...candidate, difficulty: 'advanced' }]);
      newProblem = await scalar("select public.admin_convert_candidate($1,'classification-test-problem')", [existingCandidate]);
      assert.equal(await scalar("select public.admin_convert_candidate($1,'classification-repeat')", [existingCandidate]), newProblem);
      version1 = await scalar('select current_version_id from public.problems where id=$1', [newProblem]);
      assert.equal(await scalar('select difficulty from public.problem_versions where id=$1', [version1]), 'advanced');
      await login(null);
      assert.equal(await scalar('select count(*)::int from public.problems where id=$1', [newProblem]), 0);
    });
    await t.test('draft saving validates difficulty and complete packages still publish atomically', async () => {
      await login(ids.admin);
      await assert.rejects(q('select public.admin_publish_version($1,1)', [version1]), /Reference answer/);
      await assert.rejects(q("select public.admin_save_problem_version($1,1,$2,$3,'[]')", [version1, { ...content, difficulty: 'core' }, evaluation]), /difficulty/);
      assert.equal(await scalar("select public.admin_save_problem_version($1,1,$2,$3,'[]','needs_review')", [version1, { ...content, difficulty: 'beginner' }, evaluation]), 2);
      await scalar('select public.admin_publish_version($1,2)', [version1]);
      await assert.rejects(q("select public.admin_save_problem_version($1,3,$2,$3,'[]')", [version1, content, evaluation]), /draft/);
      await login(null);
      assert.equal(await scalar('select current_version_id from public.problems where id=$1', [newProblem]), version1);
      assert.equal(await scalar('select difficulty from public.problem_versions where id=$1', [version1]), 'beginner');
    });
    await t.test('new versions preserve the old snapshot and existing attempts stay pinned', async () => {
      await login(ids.admin);
      const oldVersion = (await q('select * from public.problem_versions where id=$1', [original.versionId]))[0];
      const version2 = await scalar('select public.admin_create_version($1)', [original.id]);
      assert.notEqual(version2, original.versionId);
      assert.equal(await scalar('select difficulty from public.problem_versions where id=$1', [version2]), original.difficulty);
      assert.equal(await scalar('select reference_answer from public.problem_evaluation_packages where problem_version_id=$1', [version2]), evaluation.referenceAnswer);
      await scalar("select public.admin_save_problem_version($1,1,$2,$3,'[]')", [version2, { ...content, difficulty: 'advanced' }, evaluation]);
      await scalar('select public.admin_publish_version($1,2)', [version2]);
      const preserved = (await q('select * from public.problem_versions where id=$1', [original.versionId]))[0];
      assert.deepEqual({ ...preserved, status: oldVersion.status, updated_at: oldVersion.updated_at }, oldVersion);
      assert.equal(preserved.status, 'superseded');
      await login(ids.alice);
      assert.equal(await scalar('select public.start_interview($1)', [original.id]), oldAttempt);
      assert.equal(await scalar('select problem_version_id from public.attempts where id=$1', [oldAttempt]), original.versionId);
      assert.equal(await scalar('select difficulty from public.problem_versions where id=$1', [original.versionId]), 'intermediate');
      await login(ids.bob);
      const nextAttempt = await scalar('select public.start_interview($1)', [original.id]);
      assert.equal(await scalar('select problem_version_id from public.attempts where id=$1', [nextAttempt]), version2);
      assert.equal(await scalar('select difficulty from public.problem_versions where id=$1', [version2]), 'advanced');
      assert.equal(await scalar('select count(*)::int from public.attempts where id=$1', [oldAttempt]), 0);
    });
  } finally { await db.close(); }
});
