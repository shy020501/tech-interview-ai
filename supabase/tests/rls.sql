-- Run after the migration, in a disposable/staging Supabase project's SQL editor
-- as postgres. No extensions required. Synthetic users/data are always rolled back.
-- NOT executed during M2 because no Supabase credentials were available.
begin;

insert into auth.users(id, email, raw_user_meta_data) values
  ('10000000-0000-0000-0000-000000000001', 'm2-rls-user-a@example.invalid', '{"role":"admin"}'),
  ('10000000-0000-0000-0000-000000000002', 'm2-rls-user-b@example.invalid', '{}'),
  ('10000000-0000-0000-0000-000000000003', 'm2-rls-admin@example.invalid', '{}');
do $$ begin
  if (select role from public.profiles where user_id = '10000000-0000-0000-0000-000000000001') <> 'user' then raise exception 'metadata escalated profile role'; end if;
end $$;
update public.profiles set role = 'admin' where user_id = '10000000-0000-0000-0000-000000000003';
insert into public.categories(id, slug, name) values ('m2-rls-root', 'm2-rls-root', 'RLS test root');
insert into public.categories(id, slug, name, parent_id) values ('m2-rls-child', 'm2-rls-child', 'RLS test child', 'm2-rls-root');
insert into public.problems(id, slug, status, current_version_id, published_at) values
  ('m2-rls-published', 'm2-rls-published', 'published', 'm2-rls-v1', now()),
  ('m2-rls-draft', 'm2-rls-draft', 'draft', 'm2-rls-draft-v1', null);
insert into public.problem_versions(id, problem_id, version_number, title, short_description, scenario, question, question_type, difficulty) values
  ('m2-rls-v1', 'm2-rls-published', 1, 'RLS version 1', '', 'Scenario', 'Question', 'applied', 'intermediate'),
  ('m2-rls-v2', 'm2-rls-published', 2, 'RLS version 2', '', 'Scenario 2', 'Question 2', 'applied', 'intermediate'),
  ('m2-rls-draft-v1', 'm2-rls-draft', 1, 'RLS draft', '', '', '', 'fundamental', 'beginner');
insert into public.problem_categories(problem_id, category_id, is_primary) values
  ('m2-rls-published', 'm2-rls-child', true), ('m2-rls-draft', 'm2-rls-root', true);
insert into public.problem_evaluation_packages(problem_version_id, reference_answer, reasoning_rubric, acceptable_alternative_approaches, misconceptions, hint_ladder, completion_criteria, evaluation_examples)
values ('m2-rls-v1', 'PRIVATE RLS ANSWER', '[]', '[]', '[]', '[{"id":"m2-rls-hint","level":1,"text":"A fixed test hint","targetRubricNodeId":"test"}]', '{}', '[]');
set constraints all immediate;
set constraints all deferred;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  if not exists (select 1 from public.categories where id = 'm2-rls-child' and parent_id = 'm2-rls-root') then raise exception 'anonymous category read denied'; end if;
  if not exists (select 1 from public.problems where id = 'm2-rls-published') then raise exception 'anonymous published read denied'; end if;
  if exists (select 1 from public.problems where id = 'm2-rls-draft') then raise exception 'draft leaked'; end if;
  if exists (select 1 from public.problem_versions where id in ('m2-rls-draft-v1', 'm2-rls-v2')) then raise exception 'unpublished version leaked'; end if;
  begin perform 1 from public.problem_evaluation_packages; raise exception 'anonymous package grant leaked'; exception when insufficient_privilege then null; end;
  begin perform public.start_interview('m2-rls-published'); raise exception 'anonymous could start interview'; exception when insufficient_privilege then null; end;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
do $$ begin
  if app_private.is_admin() then raise exception 'regular user is admin'; end if;
  if exists (select 1 from public.problem_evaluation_packages where problem_version_id = 'm2-rls-v1') then raise exception 'user read private package'; end if;
  begin update public.profiles set role = 'admin' where user_id = auth.uid(); raise exception 'user changed own role'; exception when insufficient_privilege then null; end;
  begin insert into public.categories(id, slug, name) values ('m2-rls-unauthorized', 'm2-rls-unauthorized', 'No'); raise exception 'user wrote category'; exception when insufficient_privilege then null; end;
  begin perform public.start_interview('m2-rls-draft'); raise exception 'user started draft'; exception when insufficient_privilege then null; end;
end $$;
select set_config('m2.attempt_id', public.start_interview('m2-rls-published')::text, true);
do $$ begin
  if public.start_interview('m2-rls-published') <> current_setting('m2.attempt_id')::uuid then raise exception 'resume created a duplicate'; end if;
  begin insert into public.attempt_messages(attempt_id, role, content) values (current_setting('m2.attempt_id')::uuid, 'interviewer', 'forged'); raise exception 'user forged interviewer'; exception when insufficient_privilege then null; end;
  begin update public.attempts set reasoning_state = '{}' where id = current_setting('m2.attempt_id')::uuid; raise exception 'user wrote reasoning state'; exception when insufficient_privilege then null; end;
  begin perform reasoning_state from public.attempts where id = current_setting('m2.attempt_id')::uuid; raise exception 'raw reasoning state exposed'; exception when insufficient_privilege then null; end;
end $$;
select public.append_interview_turn(current_setting('m2.attempt_id')::uuid, 'My reasoning', '20000000-0000-0000-0000-000000000001');
select public.append_interview_turn(current_setting('m2.attempt_id')::uuid, 'My reasoning', '20000000-0000-0000-0000-000000000001');
select public.request_interview_hint(current_setting('m2.attempt_id')::uuid);
select public.request_interview_hint(current_setting('m2.attempt_id')::uuid);
do $$ begin
  if (select count(*) from public.attempt_messages where attempt_id = current_setting('m2.attempt_id')::uuid) <> 3 then raise exception 'turn/hint retry duplicated messages'; end if;
  if (select count(*) from public.hint_events where attempt_id = current_setting('m2.attempt_id')::uuid) <> 1 then raise exception 'hint retry duplicated events'; end if;
end $$;

-- A different authenticated user cannot read or mutate another user's attempt.
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
do $$ begin
  if exists (select id from public.attempts where id = current_setting('m2.attempt_id')::uuid) then raise exception 'another user read attempt'; end if;
  if exists (select id from public.attempt_messages where attempt_id = current_setting('m2.attempt_id')::uuid) then raise exception 'another user read messages'; end if;
  if exists (select id from public.hint_events where attempt_id = current_setting('m2.attempt_id')::uuid) then raise exception 'another user read hints'; end if;
  begin perform public.append_interview_turn(current_setting('m2.attempt_id')::uuid, 'forged', gen_random_uuid()); raise exception 'another user wrote turn'; exception when insufficient_privilege then null; end;
  begin perform public.request_interview_hint(current_setting('m2.attempt_id')::uuid); raise exception 'another user requested hint'; exception when insufficient_privilege then null; end;
  begin perform public.finish_interview(current_setting('m2.attempt_id')::uuid); raise exception 'another user finished attempt'; exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
do $$ begin
  if not app_private.is_admin() then raise exception 'trusted admin role not recognized'; end if;
  if not exists (select 1 from public.problem_evaluation_packages where reference_answer = 'PRIVATE RLS ANSWER') then raise exception 'admin private read denied'; end if;
  if not exists (select 1 from public.problems where id = 'm2-rls-draft') then raise exception 'admin draft read denied'; end if;
  if exists (select id from public.attempts where id = current_setting('m2.attempt_id')::uuid) then raise exception 'admin unexpectedly reads user attempts'; end if;
  begin update public.problem_versions set question = 'Changed silently' where id = 'm2-rls-v1'; raise exception 'attempt version mutated'; exception when check_violation then null; end;
  begin update public.problem_evaluation_packages set reference_answer = 'Changed silently' where problem_version_id = 'm2-rls-v1'; raise exception 'attempt package mutated'; exception when check_violation then null; end;
  begin update public.categories set parent_id = 'm2-rls-child' where id = 'm2-rls-root'; raise exception 'category cycle accepted'; exception when check_violation then null; end;
  begin insert into public.problem_categories(problem_id, category_id, is_primary) values ('m2-rls-published', 'm2-rls-root', true); raise exception 'duplicate primary accepted'; exception when unique_violation then null; end;
end $$;
update public.problems set current_version_id = 'm2-rls-v2' where id = 'm2-rls-published';
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
do $$ begin
  if (select problem_version_id from public.attempts where id = current_setting('m2.attempt_id')::uuid) <> 'm2-rls-v1' then raise exception 'attempt silently changed versions'; end if;
  if not exists (select 1 from public.problem_versions where id = 'm2-rls-v1') then raise exception 'owner lost historical version'; end if;
end $$;
select public.finish_interview(current_setting('m2.attempt_id')::uuid);
do $$ begin
  begin perform public.append_interview_turn(current_setting('m2.attempt_id')::uuid, 'too late', gen_random_uuid()); raise exception 'completed attempt accepted turn'; exception when check_violation then null; end;
  if public.start_interview('m2-rls-published') = current_setting('m2.attempt_id')::uuid then raise exception 'completed attempt reused'; end if;
end $$;
reset role;
rollback;
