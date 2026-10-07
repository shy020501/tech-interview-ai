-- Admin tests use the existing evaluator, but never resume a practice conversation.
-- Applying this migration preserves every existing attempt and assessment.
do $admin_test$
begin
alter table public.attempts
  add column origin text not null default 'practice' check (origin in ('practice','admin_test')),
  add column test_request_id uuid;
grant select(origin) on public.attempts to authenticated;
drop index public.one_active_attempt_per_problem;
create unique index one_active_attempt_per_problem on public.attempts(user_id,problem_id,origin) where status='in_progress';
create unique index admin_test_request_unique on public.attempts(user_id,test_request_id) where test_request_id is not null;
alter table public.attempts add constraint admin_test_request_origin
  check ((origin='admin_test' and test_request_id is not null) or (origin='practice' and test_request_id is null));

alter table public.message_evaluations add column origin text not null default 'practice' check (origin in ('practice','admin_test'));
create function app_private.set_evaluation_origin() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' then
    select origin into new.origin from public.attempts where id=new.attempt_id;
  elsif new.origin<>old.origin or new.attempt_id<>old.attempt_id then
    raise exception 'Evaluation origin is immutable' using errcode='23514';
  end if;
  return new;
end; $$;
create trigger evaluation_origin before insert or update on public.message_evaluations
  for each row execute function app_private.set_evaluation_origin();
revoke all on function app_private.set_evaluation_origin() from public,anon,authenticated;

drop policy attempts_owner_read on public.attempts;
create policy attempts_owner_read on public.attempts for select to authenticated
  using (user_id=(select auth.uid()) and (origin='practice' or (select app_private.is_admin())));

create or replace function public.start_interview(p_problem_id text) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); p public.problems; result uuid;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform 1 from public.profiles where user_id=actor for update;
  if not found then raise exception 'Profile unavailable' using errcode='42501'; end if;
  select * into p from public.problems where id=p_problem_id and status='published' for share;
  if not found then raise exception 'Problem unavailable' using errcode='42501'; end if;
  select id into result from public.attempts where user_id=actor and problem_id=p.id and origin='practice' and status='in_progress';
  if result is not null then return result; end if;
  perform 1 from public.problem_versions where id=p.current_version_id for share;
  insert into public.attempts(user_id,problem_id,problem_version_id,origin)
    values(actor,p.id,p.current_version_id,'practice') returning id into result;
  return result;
end; $$;

-- Reset is a new attempt, not a deletion. A request UUID makes lost-response retries safe.
-- Profile locking matches evaluator_operation, including resets during a provider call.
create function public.admin_start_test(p_problem_id text,p_request_id uuid,p_reset_attempt_id uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); p public.problems; active_id uuid; previous public.attempts; result uuid;
begin
  perform app_private.require_admin();
  perform 1 from public.profiles where user_id=actor for update;
  perform app_private.require_admin();
  perform app_private.ensure(p_request_id is not null,'A test request ID is required');
  select id into result from public.attempts where user_id=actor and test_request_id=p_request_id and origin='admin_test';
  if result is not null then return result; end if;
  select * into p from public.problems where id=p_problem_id and status='published' for share;
  if not found then raise exception 'Published problem unavailable' using errcode='42501'; end if;
  select id into active_id from public.attempts
    where user_id=actor and problem_id=p.id and origin='admin_test' and status='in_progress' for update;
  if p_reset_attempt_id is null and active_id is not null then return active_id; end if;
  if p_reset_attempt_id is not null then
    select * into previous from public.attempts where id=p_reset_attempt_id and user_id=actor and problem_id=p.id and origin='admin_test' for update;
    if not found then raise exception 'Admin test unavailable' using errcode='42501'; end if;
    -- Another tab already reset this session. Do not discard its new conversation.
    if active_id is not null and active_id<>previous.id then return active_id; end if;
    update public.attempts set status='abandoned',completed_at=now() where id=previous.id and status='in_progress';
    update public.assessment_runs set status='failed',error_type='admin_test_reset',completed_at=now()
      where attempt_id=previous.id and status='running';
    update public.message_evaluations set status='failed',error_type='admin_test_reset',completed_at=now(),lease_until=now()
      where attempt_id=previous.id and status='running';
  end if;
  perform 1 from public.problem_versions where id=p.current_version_id and published_at is not null for share;
  if not found then raise exception 'Published version unavailable' using errcode='42501'; end if;
  insert into public.attempts(user_id,problem_id,problem_version_id,origin,test_request_id)
    values(actor,p.id,p.current_version_id,'admin_test',p_request_id) returning id into result;
  return result;
end; $$;
revoke all on function public.admin_start_test(text,uuid,uuid) from public,anon;
grant execute on function public.admin_start_test(text,uuid,uuid) to authenticated;

-- Keep the tested evaluator implementation intact behind an additional origin guard.
-- Revoking the internal function's grants prevents a bypass after moving its schema.
alter function public.evaluator_operation(text,text,uuid,jsonb) set schema app_private;
alter function app_private.evaluator_operation(text,text,uuid,jsonb) rename to evaluator_operation_core;
revoke all on function app_private.evaluator_operation_core(text,text,uuid,jsonb) from public,anon,authenticated;
create function public.evaluator_operation(p_secret text,p_operation text,p_attempt_id uuid,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare source text;
begin
  perform app_private.require_evaluator(p_secret);
  perform 1 from public.profiles where user_id=auth.uid() for update;
  select origin into source from public.attempts where id=p_attempt_id and user_id=auth.uid();
  if not found then raise exception 'Attempt unavailable' using errcode='42501'; end if;
  if source='admin_test' then perform app_private.require_admin(); end if;
  return app_private.evaluator_operation_core(p_secret,p_operation,p_attempt_id,p_data);
end; $$;
revoke all on function public.evaluator_operation(text,text,uuid,jsonb) from public,anon;
grant execute on function public.evaluator_operation(text,text,uuid,jsonb) to authenticated;
notify pgrst, 'reload schema';
end;
$admin_test$;
