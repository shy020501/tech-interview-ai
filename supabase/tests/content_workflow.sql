-- M3 hosted SQL verification. Execute the ENTIRE file as the trusted SQL editor owner.
-- All m3-check-* content and synthetic Auth users live in one transaction and ROLLBACK.
-- No existing user/content rows are edited. No external APIs or email are involved.
begin;
insert into auth.users(id,email,raw_user_meta_data) values
 ('40000000-0000-0000-0000-000000000001','m3-check-admin@example.invalid','{}'),
 ('40000000-0000-0000-0000-000000000002','m3-check-user-a@example.invalid','{"role":"admin"}'),
 ('40000000-0000-0000-0000-000000000003','m3-check-user-b@example.invalid','{}');
update public.profiles set role='admin' where user_id='40000000-0000-0000-0000-000000000001';
create function pg_temp.m3_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'M3 check failed: %',label; end if; end; $$;
select pg_temp.m3_assert((select role='user' from public.profiles where user_id='40000000-0000-0000-0000-000000000002'),'signup metadata cannot grant admin');
set local role authenticated;
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"40000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select set_config('m3.category',public.admin_save_category(null,'{"slug":"m3-check-category","name":"M3 disposable category","parentId":"","description":"Rollback test","sortOrder":0}'),true);
select set_config('m3.source',public.admin_save_source(null,jsonb_build_object('title','m3-check-source','url','https://example.com/m3-check','sourceType','paper','status','discovered','relevanceScore',null,'suggestedCategoryIds',jsonb_build_array(current_setting('m3.category')),'notes','Disposable','provenanceNotes','Manual test','usageStatus','reference_only','usageNotes','No rights assertion'))::text,true);
select set_config('m3.candidate',public.admin_save_candidate(null,jsonb_build_object('sourceId',current_setting('m3.source'),'suggestedTitle','m3-check-problem','suggestedScenario','A component fails under a changed environment.','suggestedQuestion','How would you test the cause?','suggestedCategoryIds',jsonb_build_array(current_setting('m3.category')),'questionType','applied','competencyIds',jsonb_build_array('failure_diagnosis'),'difficulty','intermediate','candidateScore',null,'status','pending_review','notes','Manual test'))::text,true);
select set_config('m3.problem',public.admin_convert_candidate(current_setting('m3.candidate')::uuid,'m3-check-problem'),true);
select pg_temp.m3_assert(public.admin_convert_candidate(current_setting('m3.candidate')::uuid,'m3-check-duplicate')=current_setting('m3.problem'),'conversion retry returns same problem');
select set_config('m3.v1',(select current_version_id from public.problems where id=current_setting('m3.problem')),true);

do $$ begin
 begin perform public.admin_publish_version(current_setting('m3.v1'),1); raise exception 'Incomplete draft published'; exception when invalid_parameter_value then null; end;
end $$;
select set_config('m3.content',jsonb_build_object('title','m3-check-problem','shortDescription','Disposable publication test','scenario','An environment changes.','question','How would you isolate the cause?','assumptions',jsonb_build_array('Measurements are available.'),'tags','[]'::jsonb,'visualization',null,'categoryIds',jsonb_build_array(current_setting('m3.category')),'primaryCategoryId',current_setting('m3.category'),'questionType','applied','competencyIds',jsonb_build_array('failure_diagnosis'),'difficulty','intermediate')::text,true);
select set_config('m3.package','{"referenceAnswer":"M3 PRIVATE REFERENCE: compare controlled interventions.","reasoningRubric":[{"id":"m3_node","label":"Controlled comparison","description":"Separate competing causes.","weight":1,"prerequisiteNodeIds":[],"sufficientEvidenceDescription":"A test that distinguishes causes."}],"acceptableAlternativeApproaches":[{"id":"m3_alternative","title":"Ablation","description":"Hold one factor fixed.","rubricNodeIds":["m3_node"]}],"misconceptions":[{"id":"m3_misconception","title":"Correlation only","description":"M3 PRIVATE MISCONCEPTION","relatedRubricNodeIds":["m3_node"]}],"hintLadder":[{"id":"m3_hint_1","targetRubricNodeId":"m3_node","level":1,"text":"M3 first reviewed hint."},{"id":"m3_hint_2","targetRubricNodeId":"m3_node","level":2,"text":"M3 second reviewed hint."}],"completionCriteria":{"requiredNodeIds":["m3_node"],"alternativeNodeGroups":[],"description":"Explain a discriminating test."},"evaluationExamples":[{"id":"m3_example","response":"Compare controlled interventions.","expectedResult":{"rubricAssessments":[{"rubricNodeId":"m3_node","status":"confirmed","evidence":[{"messageId":"m3_example"}]}],"detectedMisconceptions":[],"contradictions":[],"needsEscalation":false,"escalationReason":null,"feedbackCategory":"reasoning_supported"}}]}',true);
select public.admin_save_problem_version(current_setting('m3.v1'),1,current_setting('m3.content')::jsonb,current_setting('m3.package')::jsonb,'[]','needs_review');

do $$ begin
 begin perform public.admin_save_problem_version(current_setting('m3.v1'),1,current_setting('m3.content')::jsonb,current_setting('m3.package')::jsonb,'[]'); raise exception 'Stale edit accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.admin_save_category(current_setting('m3.category'),jsonb_build_object('slug','m3-check-category','name','Self cycle','parentId',current_setting('m3.category'),'description','','sortOrder',0)); raise exception 'Self parent accepted'; exception when check_violation then null; end;
 begin perform public.admin_delete_category(current_setting('m3.category')); raise exception 'Used category deleted'; exception when invalid_parameter_value then null; end;
end $$;
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"anon"}',true);
select pg_temp.m3_assert(not exists(select 1 from public.problems where id=current_setting('m3.problem')),'draft hidden');
select pg_temp.m3_assert(not exists(select 1 from public.problem_version_categories where problem_version_id=current_setting('m3.v1')),'draft categories hidden');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"40000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
do $$ begin
 begin perform public.admin_save_source(null,'{}'); raise exception 'User authored source'; exception when insufficient_privilege then null; end;
 begin perform public.admin_save_candidate(null,'{}'); raise exception 'User authored candidate'; exception when insufficient_privilege then null; end;
 begin perform public.admin_save_problem_version(current_setting('m3.v1'),2,current_setting('m3.content')::jsonb,current_setting('m3.package')::jsonb,'[]'); raise exception 'User edited draft'; exception when insufficient_privilege then null; end;
 begin perform public.admin_publish_version(current_setting('m3.v1'),2); raise exception 'User published'; exception when insufficient_privilege then null; end;
 if exists(select 1 from public.problem_evaluation_packages) then raise exception 'Private package exposed'; end if;
end $$;
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"40000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select public.admin_publish_version(current_setting('m3.v1'),2);
reset role;
-- Even a trusted table write must not silently mutate the frozen package.
do $$ begin
 begin update public.problem_versions set question='Changed' where id=current_setting('m3.v1'); raise exception 'Published content changed'; exception when check_violation then null; end;
 begin update public.problem_evaluation_packages set reference_answer='Changed' where problem_version_id=current_setting('m3.v1'); raise exception 'Published answer changed'; exception when check_violation then null; end;
end $$;
set local role anon;
select pg_temp.m3_assert(exists(select 1 from public.problems where id=current_setting('m3.problem')),'published problem visible');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"40000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select set_config('m3.attempt_a',public.start_interview(current_setting('m3.problem'))::text,true);
select public.append_interview_turn(current_setting('m3.attempt_a')::uuid,'M3 manual test reasoning','40000000-0000-0000-0000-000000000020');
do $$ begin
 begin perform public.get_attempt_debrief(current_setting('m3.attempt_a')::uuid); raise exception 'In-progress answer released'; exception when insufficient_privilege then null; end;
end $$;
select public.request_interview_hint(current_setting('m3.attempt_a')::uuid,'40000000-0000-0000-0000-000000000021');
select public.request_interview_hint(current_setting('m3.attempt_a')::uuid,'40000000-0000-0000-0000-000000000021');
select pg_temp.m3_assert((select count(*)=1 from public.hint_events where attempt_id=current_setting('m3.attempt_a')::uuid),'one hint and retry idempotency');
select public.request_interview_hint(current_setting('m3.attempt_a')::uuid,'40000000-0000-0000-0000-000000000022');
select pg_temp.m3_assert((select count(distinct hint_id)=2 from public.hint_events where attempt_id=current_setting('m3.attempt_a')::uuid),'next distinct hint');
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"40000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select set_config('m3.v2',public.admin_create_version(current_setting('m3.problem')),true);
select pg_temp.m3_assert(public.admin_create_version(current_setting('m3.problem'))=current_setting('m3.v2'),'version creation retry');
select pg_temp.m3_assert((select reference_answer like 'M3 PRIVATE REFERENCE:%' from public.problem_evaluation_packages where problem_version_id=current_setting('m3.v2')),'private package copied');
select public.admin_publish_version(current_setting('m3.v2'),1);
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"40000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select pg_temp.m3_assert(public.start_interview(current_setting('m3.problem'))=current_setting('m3.attempt_a')::uuid,'old attempt resumes');
select pg_temp.m3_assert((select problem_version_id=current_setting('m3.v1') from public.attempts where id=current_setting('m3.attempt_a')::uuid),'old attempt pinned');
select public.finish_interview(current_setting('m3.attempt_a')::uuid);
select pg_temp.m3_assert(public.get_attempt_debrief(current_setting('m3.attempt_a')::uuid)->>'referenceAnswer' like 'M3 PRIVATE REFERENCE:%','completed owner gets reference');
select pg_temp.m3_assert(not(public.get_attempt_debrief(current_setting('m3.attempt_a')::uuid) ?| array['hintLadder','reasoningRubric','misconceptions','evaluationExamples']),'debrief allowlist');
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"40000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select set_config('m3.attempt_b',public.start_interview(current_setting('m3.problem'))::text,true);
select pg_temp.m3_assert((select problem_version_id=current_setting('m3.v2') from public.attempts where id=current_setting('m3.attempt_b')::uuid),'new attempt gets latest');
do $$ begin
 if exists(select 1 from public.attempts where id=current_setting('m3.attempt_a')::uuid) then raise exception 'Other user attempt leaked'; end if;
 begin perform public.request_interview_hint(current_setting('m3.attempt_a')::uuid,gen_random_uuid()); raise exception 'Other user hint released'; exception when insufficient_privilege then null; end;
 begin perform public.get_attempt_debrief(current_setting('m3.attempt_a')::uuid); raise exception 'Other user answer released'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'M3 content workflow SQL checks passed; all test data will be rolled back.' as result;
rollback;
