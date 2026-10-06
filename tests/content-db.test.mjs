import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import seed from '../supabase/seed-data.json' with { type: 'json' };

test('M3 PostgreSQL lifecycle, access boundaries and preserved M2 data', async (t) => {
  const db = new PGlite();
  const admin='30000000-0000-0000-0000-000000000001', alice='30000000-0000-0000-0000-000000000002', bob='30000000-0000-0000-0000-000000000003';
  const q=async(sql,args=[]) => (await db.query(sql,args)).rows;
  const scalar=async(sql,args=[]) => Object.values((await q(sql,args))[0])[0];
  const login=async(id) => { await db.exec('reset role'); await q("select set_config('request.jwt.claim.sub',$1,false)",[id??'']); await db.exec(id?'set role authenticated':'set role anon'); };
  const root=async()=>db.exec('reset role');
  const rejects=async(sql,args=[],pattern=/permission|Administrator|immutable|draft|missing|category|Category|cycle|Incomplete|incomplete|required|criteria|finished|unavailable|does not exist|Reload|converted|prerequisite/i) => assert.rejects(q(sql,args),pattern);
  const content=structuredClone(seed.problems.find(p=>p.id==='problem-drone-dynamics'));
  const pkg=structuredClone(seed.evaluationPackages.find(p=>p.problemVersionId===content.versionId));
  const source={title:'m3-test source',url:'https://example.com/manual-test',sourceType:'paper',status:'discovered',relevanceScore:null,suggestedCategoryIds:['physical-ai'],notes:'Test only',provenanceNotes:'Manually entered',usageStatus:'reference_only',usageNotes:'No reuse claim'};
  let sourceId, candidateId, problemId, v1, v2, oldAttempt, newAttempt;
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}'::jsonb); grant usage on schema auth to anon,authenticated; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`);
    const migrations=(await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort();
    for(const file of migrations.slice(0,2)) await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
    for(const id of [admin,alice,bob]) await q('insert into auth.users(id) values($1)',[id]);
    await q("update public.profiles set role='admin' where user_id=$1",[admin]);
    await login(alice);
    const before=await scalar("select public.start_interview('problem-drone-dynamics')");
    await root();
    const baseline=await q('select id,problem_version_id,status from public.attempts where id=$1',[before]);
    await q(`insert into public.problem_versions(id,problem_id,version_number,title,short_description,scenario,question,question_type,difficulty)
      values('m3-test-preexisting-draft','problem-drone-dynamics',2,'Preexisting M2 draft','','','','applied','intermediate')`);
    const m3 = await readFile('supabase/migrations/'+migrations[2],'utf8');
    await t.test('migration failure rolls back all changes without an outer transaction',async()=>{
      const failing=m3.replace('end;\n$m3_migration$;',"raise exception 'Intentional migration rollback test';\nend;\n$m3_migration$;");
      assert.notEqual(failing,m3);
      await assert.rejects(db.query(failing),/Intentional migration rollback test/);
      assert.equal(await scalar("select to_regclass('public.sources')"),null);
      assert.equal(await scalar("select count(*)::int from information_schema.columns where table_name='problem_versions' and column_name='status'"),0);
      assert.equal(await scalar("select has_table_privilege('authenticated','public.problem_versions','UPDATE')"),true);
      assert.deepEqual(await q('select id,problem_version_id,status from public.attempts where id=$1',[before]),baseline);
    });
    // Hosted runner does not wrap the migration in a transaction. One prepared
    // statement also catches accidental top-level commands outside the atomic DO.
    for(const file of migrations.slice(2)) {
      const sql=await readFile('supabase/migrations/'+file,'utf8');
      if(file.endsWith('_m3_editor_deletion.sql')) {
        await t.test('deletion migration failure rolls back changed foreign keys and new RPCs',async()=>{
          const failing=sql.replace('end;\n$m3_deletion$;',"raise exception 'Intentional delete migration rollback';\nend;\n$m3_deletion$;");
          assert.notEqual(failing,sql);
          await assert.rejects(db.query(failing),/Intentional delete migration rollback/);
          assert.equal(await scalar("select to_regprocedure('public.admin_delete_problem(text)')"),null);
          assert.equal(await scalar("select confdeltype from pg_constraint where conname='problem_versions_problem_id_fkey'"),'r');
          assert.deepEqual(await q('select id,problem_version_id,status from public.attempts where id=$1',[before]),baseline);
        });
      }
      await db.query(sql);
    }
    await t.test('incremental migration preserves existing attempts and public catalog',async()=>{
      assert.deepEqual(await q('select id,problem_version_id,status from public.attempts where id=$1',[before]),baseline);
      assert.equal(await scalar("select status from public.problem_versions where id='m3-test-preexisting-draft'"),'draft');
      assert.equal(await scalar("select published_at from public.problem_versions where id='m3-test-preexisting-draft'"),null);
      await login(null); assert.equal(await scalar('select count(*)::int from public.problems'),3);
      assert.equal(await scalar('select count(*)::int from public.problem_versions'),3);
      await root(); assert.equal(await scalar("select count(*)::int from pg_tables where schemaname='public' and rowsecurity"),13);
    });
    await t.test('ordinary users cannot author, publish, preview drafts or read private content',async()=>{
      await login(alice);
      await rejects('select public.admin_save_source(null,$1)',[source]);
      await rejects('select public.admin_save_candidate(null,$1)',[{}]);
      await rejects("select public.admin_create_problem('forbidden','Forbidden')");
      await rejects("select public.admin_save_problem_version('pv-payload-1',1,$1,$2,'[]')",[content,pkg]);
      await rejects("select public.admin_publish_version('pv-payload-1',1)");
      await rejects("select public.admin_save_category(null,$1)",[{slug:'forbidden',name:'Forbidden',parentId:'',description:'',sortOrder:0}]);
      assert.equal(await scalar('select count(*)::int from public.problem_evaluation_packages'),0);
      assert.equal(await scalar('select count(*)::int from public.sources'),0);
      assert.equal(await scalar("select count(*)::int from public.problem_versions where status='draft'"),0);
    });
    await t.test('admin creates a manual source and source-optional candidates',async()=>{
      await login(admin); sourceId=await scalar('select public.admin_save_source(null,$1)',[source]);
      const candidate={sourceId,suggestedTitle:'m3-test candidate',suggestedScenario:content.scenario,suggestedQuestion:content.question,suggestedCategoryIds:content.categoryIds,questionType:content.questionType,competencyIds:content.competencyIds,difficulty:content.difficulty,candidateScore:92,status:'pending_review',notes:'Manual review'};
      candidateId=await scalar('select public.admin_save_candidate(null,$1)',[candidate]);
      const ownIdea=await scalar('select public.admin_save_candidate(null,$1)',[{...candidate,sourceId:null}]);
      assert.ok(ownIdea); assert.equal(await scalar('select status from public.sources where id=$1',[sourceId]),'candidate_created');
    });
    await t.test('candidate conversion is atomic and idempotent',async()=>{
      problemId=await scalar("select public.admin_convert_candidate($1,'m3-test-problem')",[candidateId]);
      assert.equal(await scalar("select public.admin_convert_candidate($1,'ignored-retry')",[candidateId]),problemId);
      v1=await scalar('select current_version_id from public.problems where id=$1',[problemId]);
      assert.equal(await scalar('select count(*)::int from public.problem_versions where problem_id=$1',[problemId]),1);
      assert.equal(await scalar('select scenario from public.problem_versions where id=$1',[v1]),content.scenario);
      await login(null); assert.equal(await scalar('select count(*)::int from public.problems where id=$1',[problemId]),0);
      assert.equal(await scalar('select count(*)::int from public.problem_version_categories where problem_version_id=$1',[v1]),0);
      await login(admin);
    });
    await t.test('incomplete packages cannot publish; malformed graphs/references cannot save',async()=>{
      await rejects('select public.admin_publish_version($1,1)',[v1],/Reference answer/);
      const bad=structuredClone(pkg); bad.reasoningRubric[0].prerequisiteNodeIds=[bad.reasoningRubric[1].id]; bad.reasoningRubric[1].prerequisiteNodeIds=[bad.reasoningRubric[0].id];
      await rejects("select public.admin_save_problem_version($1,1,$2,$3,'[]')",[v1,content,bad],/cycle/);
      bad.reasoningRubric[0].prerequisiteNodeIds=['missing'];
      await rejects("select public.admin_save_problem_version($1,1,$2,$3,'[]')",[v1,content,bad],/prerequisite/);
      assert.equal(await scalar('select revision from public.problem_versions where id=$1',[v1]),1);
    });
    await t.test('draft save preserves integrity and rejects stale edits; valid publication is public',async()=>{
      assert.equal(await scalar("select public.admin_save_problem_version($1,1,$2,$3,$4,'needs_review')",[v1,content,pkg,[{sourceId,relationType:'inspired_by',attributionNote:'Manual'}]]),2);
      await rejects("select public.admin_save_problem_version($1,1,$2,$3,'[]')",[v1,content,pkg],/Reload/);
      await scalar('select public.admin_publish_version($1,2)',[v1]);
      await login(null); assert.equal(await scalar('select current_version_id from public.problems where id=$1',[problemId]),v1);
      const rows=await q('select * from public.problem_versions where id=$1',[v1]);
      for(const key of ['reference_answer','reasoning_rubric','hint_ladder','misconceptions']) assert.equal(key in rows[0],false);
    });
    await t.test('published versions/packages/categories are frozen even without an attempt',async()=>{
      await root();
      await rejects('update public.problem_versions set title=$1 where id=$2',['tampered',v1]);
      await rejects('update public.problem_evaluation_packages set reference_answer=$1 where problem_version_id=$2',['tampered',v1]);
      await rejects('delete from public.problem_version_categories where problem_version_id=$1',[v1]);
      await login(admin);
      await rejects('update public.problems set status=$1 where id=$2',['draft',problemId],/permission/);
      await rejects('select public.admin_save_problem_version($1,3,$2,$3,$4)',[v1,content,pkg,[]]);
    });
    await t.test('new draft copies complete package; old attempts and classifications stay pinned',async()=>{
      await login(alice); oldAttempt=await scalar('select public.start_interview($1)',[problemId]);
      await login(admin); v2=await scalar('select public.admin_create_version($1)',[problemId]);
      assert.notEqual(v2,v1); assert.equal(await scalar('select public.admin_create_version($1)',[problemId]),v2);
      assert.equal(await scalar('select reference_answer from public.problem_evaluation_packages where problem_version_id=$1',[v2]),pkg.referenceAnswer);
      const changed={...content,title:'m3-test version two',categoryIds:['security'],primaryCategoryId:'security'};
      await scalar("select public.admin_save_problem_version($1,1,$2,$3,'[]')",[v2,changed,pkg]);
      await login(null); assert.equal(await scalar('select current_version_id from public.problems where id=$1',[problemId]),v1);
      assert.equal(await scalar('select count(*)::int from public.problem_versions where id=$1',[v2]),0);
      await login(admin); await scalar('select public.admin_publish_version($1,2)',[v2]);
      await login(alice); assert.equal(await scalar('select public.start_interview($1)',[problemId]),oldAttempt);
      assert.equal(await scalar('select problem_version_id from public.attempts where id=$1',[oldAttempt]),v1);
      assert.equal(await scalar('select category_id from public.problem_version_categories where problem_version_id=$1 and is_primary',[v1]),content.primaryCategoryId);
      await login(bob); newAttempt=await scalar('select public.start_interview($1)',[problemId]);
      assert.equal(await scalar('select problem_version_id from public.attempts where id=$1',[newAttempt]),v2);
      assert.equal(await scalar('select count(*)::int from public.problem_versions where id=$1',[v1]),0);
    });
    await t.test('hints release one at a time, retry safely and reject other owners',async()=>{
      const request='30000000-0000-0000-0000-000000000010';
      await rejects('select public.request_interview_hint($1,$2)',[oldAttempt,request]);
      await scalar('select public.request_interview_hint($1,$2)',[newAttempt,request]);
      await scalar('select public.request_interview_hint($1,$2)',[newAttempt,request]);
      assert.equal(await scalar('select count(*)::int from public.hint_events where attempt_id=$1',[newAttempt]),1);
      await scalar('select public.request_interview_hint($1,$2)',[newAttempt,'30000000-0000-0000-0000-000000000011']);
      assert.equal(await scalar('select count(distinct hint_id)::int from public.hint_events where attempt_id=$1',[newAttempt]),2);
      assert.equal(await scalar('select count(*)::int from public.problem_evaluation_packages'),0);
    });
    await t.test('debrief only releases an allowlist for a completed owned attempt',async()=>{
      await rejects('select public.get_attempt_debrief($1)',[newAttempt]);
      await scalar('select public.finish_interview($1)',[newAttempt]);
      const debrief=await scalar('select public.get_attempt_debrief($1)',[newAttempt]);
      assert.deepEqual(Object.keys(debrief).sort(),['alternativeApproaches','keyIdeas','problemVersionId','referenceAnswer'].sort());
      assert.equal(debrief.problemVersionId,v2); assert.equal(debrief.referenceAnswer,pkg.referenceAnswer);
      await rejects('select public.request_interview_hint($1,$2)',[newAttempt,'30000000-0000-0000-0000-000000000012']);
      await login(alice); await rejects('select public.get_attempt_debrief($1)',[newAttempt]);
      await login(admin); await rejects('select public.get_attempt_debrief($1)',[newAttempt]);
    });
    await t.test('category CRUD blocks self/descendant cycles and deletion of used nodes',async()=>{
      const form={slug:'m3-test-parent',name:'Test parent',parentId:'',description:'Disposable',sortOrder:12};
      const parent=await scalar('select public.admin_save_category(null,$1)',[form]);
      const child=await scalar('select public.admin_save_category(null,$1)',[{...form,slug:'m3-test-child',parentId:parent}]);
      await rejects('select public.admin_save_category($1,$2)',[parent,{...form,parentId:parent}],/cycle|check constraint/i);
      await rejects('select public.admin_save_category($1,$2)',[parent,{...form,parentId:child}],/cycle/i);
      await rejects('select public.admin_delete_category($1)',[parent],/in use/);
      await rejects("select public.admin_delete_category('security')",[],/in use/);
      await q('select public.admin_delete_category($1)',[child]); await q('select public.admin_delete_category($1)',[parent]);
    });
    await t.test('archive removes public discovery while preserving owner review/history',async()=>{
      await q('select public.admin_archive_problem($1)',[problemId]);
      await login(null); assert.equal(await scalar('select count(*)::int from public.problems where id=$1',[problemId]),0);
      await login(bob); assert.equal((await scalar('select public.get_attempt_debrief($1)',[newAttempt])).problemVersionId,v2);
      await rejects('select public.start_interview($1)',[problemId]);
    });
    await t.test('deletion RPCs require admin, and direct table deletes remain denied',async()=>{
      for(const actor of [null,alice]) {
        await login(actor);
        await rejects('select public.admin_delete_source($1)',[sourceId],/permission|Administrator/);
        await rejects('select public.admin_delete_candidate($1)',[candidateId],/permission|Administrator/);
        await rejects('select public.admin_delete_problem($1)',[problemId],/permission|Administrator/);
      }
      await login(admin);
      for(const table of ['sources','question_candidates','problems','problem_versions','problem_evaluation_packages']) {
        await rejects(`delete from public.${table} where false`,[],/permission/);
      }
    });
    await t.test('attempted problem deletion is rejected atomically, preserving candidates and interviews',async()=>{
      await rejects('select public.admin_delete_problem($1)',[problemId],/saved interviews/);
      assert.equal(await scalar('select converted_problem_id from public.question_candidates where id=$1',[candidateId]),problemId);
      assert.equal(await scalar('select status from public.question_candidates where id=$1',[candidateId]),'converted_to_problem');
      assert.equal(await scalar('select count(*)::int from public.problem_versions where problem_id=$1',[problemId]),2);
      await login(bob);
      assert.equal(await scalar('select status from public.attempts where id=$1',[newAttempt]),'completed');
      assert.equal((await scalar('select public.get_attempt_debrief($1)',[newAttempt])).referenceAnswer,pkg.referenceAnswer);
      await login(alice); assert.equal(await scalar('select status from public.attempts where id=$1',[oldAttempt]),'in_progress');
      await login(admin);
    });
    await t.test('deleting a converted candidate keeps its problem and source provenance',async()=>{
      await rejects('select public.admin_delete_source($1)',[sourceId],/used by a candidate or problem version/);
      await q('select public.admin_delete_candidate($1)',[candidateId]);
      assert.equal(await scalar('select count(*)::int from public.question_candidates where id=$1',[candidateId]),0);
      assert.equal(await scalar('select count(*)::int from public.problems where id=$1',[problemId]),1);
      assert.equal(await scalar('select source_id from public.problem_sources where problem_version_id=$1',[v1]),sourceId);
      // A version reference alone still protects the source after the candidate is gone.
      await rejects('select public.admin_delete_source($1)',[sourceId],/used by a candidate or problem version/);
      await rejects('select public.admin_delete_candidate($1)',[candidateId],/not found/);
    });
    await t.test('draft deletion removes dependent content, resets its candidate and allows conversion again',async()=>{
      const sid=await scalar('select public.admin_save_source(null,$1)',[{...source,title:'m3-delete disposable source'}]);
      const cid=await scalar('select public.admin_save_candidate(null,$1)',[{sourceId:sid,suggestedTitle:'m3-delete disposable candidate',suggestedScenario:content.scenario,suggestedQuestion:content.question,suggestedCategoryIds:content.categoryIds,questionType:content.questionType,competencyIds:content.competencyIds,difficulty:content.difficulty,candidateScore:null,status:'pending_review',notes:''}]);
      await rejects('select public.admin_delete_source($1)',[sid],/used by a candidate or problem version/);
      const pid=await scalar("select public.admin_convert_candidate($1,'m3-delete-draft')",[cid]);
      const vid=await scalar('select current_version_id from public.problems where id=$1',[pid]);
      await q('select public.admin_delete_problem($1)',[pid]);
      assert.equal(await scalar('select count(*)::int from public.problems where id=$1',[pid]),0);
      assert.equal(await scalar('select count(*)::int from public.problem_versions where id=$1',[vid]),0);
      for(const table of ['problem_evaluation_packages','problem_sources','problem_version_categories']) {
        assert.equal(await scalar(`select count(*)::int from public.${table} where problem_version_id=$1`,[vid]),0);
      }
      assert.equal(await scalar('select count(*)::int from public.problem_categories where problem_id=$1',[pid]),0);
      assert.deepEqual(await q('select status,converted_problem_id from public.question_candidates where id=$1',[cid]),[{status:'pending_review',converted_problem_id:null}]);
      assert.equal(await scalar('select count(*)::int from public.sources where id=$1',[sid]),1);
      const again=await scalar("select public.admin_convert_candidate($1,'m3-delete-draft')",[cid]);
      assert.notEqual(again,pid);
      await q('select public.admin_delete_problem($1)',[again]);
      await q('select public.admin_delete_candidate($1)',[cid]);
      await q('select public.admin_delete_source($1)',[sid]);
      assert.equal(await scalar('select count(*)::int from public.sources where id=$1',[sid]),0);
      await rejects('select public.admin_delete_problem($1)',[again],/not found/);
      await rejects('select public.admin_delete_source($1)',[sid],/not found/);
    });
    await t.test('unattempted published problems can be deleted whole but their snapshots cannot be edited or deleted separately',async()=>{
      const pid=await scalar("select public.admin_create_problem('m3-delete-published','m3-delete published problem')");
      const vid=await scalar('select current_version_id from public.problems where id=$1',[pid]);
      await scalar('select public.admin_save_problem_version($1,1,$2,$3,$4)',[vid,content,pkg,[{sourceId,relationType:'reference',attributionNote:'Test'}]]);
      await q('select public.admin_publish_version($1,2)',[vid]);
      const next=await scalar('select public.admin_create_version($1)',[pid]);
      await q('select public.admin_publish_version($1,1)',[next]);
      await root();
      await rejects('delete from public.problem_versions where id=$1',[vid],/immutable/);
      for(const table of ['problem_evaluation_packages','problem_sources','problem_version_categories']) {
        await rejects(`delete from public.${table} where problem_version_id=$1`,[vid],/immutable/);
      }
      await rejects('update public.problem_evaluation_packages set reference_answer=$1 where problem_version_id=$2',['changed',vid],/immutable/);
      await login(admin); await q('select public.admin_delete_problem($1)',[pid]);
      assert.equal(await scalar('select count(*)::int from public.problem_versions where problem_id=$1',[pid]),0);
      for(const table of ['problem_evaluation_packages','problem_sources','problem_version_categories']) {
        assert.equal(await scalar(`select count(*)::int from public.${table} where problem_version_id=any($1)`,[[vid,next]]),0);
      }
      assert.equal(await scalar('select count(*)::int from public.sources where id=$1',[sourceId]),1);
      await login(null); assert.equal(await scalar('select count(*)::int from public.problems where id=$1',[pid]),0);
    });
    await t.test('hosted SQL guide assertions run completely and roll back their test records',async()=>{
      await root(); await db.exec(await readFile('supabase/tests/content_workflow.sql','utf8'));
      assert.equal(await scalar("select count(*)::int from auth.users where email like 'm3-check-%'"),0);
      assert.equal(await scalar("select count(*)::int from public.problems where slug like 'm3-check-%'"),0);
    });
  } finally { await db.close(); }
});
