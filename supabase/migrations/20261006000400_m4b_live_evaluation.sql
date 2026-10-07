-- Incremental and atomic. No existing conversations or published packages are rewritten.
do $m4b$
begin
create table app_private.evaluator_runtime (
 singleton boolean primary key default true check(singleton),
 secret_sha256 text not null check(secret_sha256 ~ '^[a-f0-9]{64}$')
);
revoke all on app_private.evaluator_runtime from public,anon,authenticated;

alter table public.attempts add column progress numeric not null default 0 check(progress between 0 and 100),
 add column core_complete boolean not null default false,
 add column evaluation_mode text check(evaluation_mode in ('live','mock')),
 add column abuse_strikes integer not null default 0,
 add column abuse_until timestamptz;
grant select(progress,core_complete,evaluation_mode) on public.attempts to authenticated;
-- Product message limit is configurable up to this storage ceiling.
alter table public.attempt_messages drop constraint attempt_messages_content_check;
alter table public.attempt_messages add constraint attempt_messages_content_check check(length(btrim(content)) between 1 and 20000);

create table public.message_evaluations (
 id uuid primary key default gen_random_uuid(), attempt_id uuid not null references public.attempts(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 problem_version_id text not null references public.problem_versions(id),
 message_id uuid not null unique references public.attempt_messages(id) on delete cascade,
 client_request_id uuid not null, retry_request_ids uuid[] not null default '{}',
 sequence_number bigint not null, based_on_revision integer not null,
 mode text not null check(mode in ('mock','live')),
 status text not null check(status in ('running','succeeded','failed')),
 claim_token uuid not null, lease_until timestamptz not null, retry_count integer not null default 0,
 final_assessment_run_id uuid, final_intent text, final_result jsonb,
 progress_before numeric not null, progress_after numeric not null,
 state_revision integer not null, error_type text,
 feedback_message_id uuid references public.attempt_messages(id),
 human_review text not null default 'not_reviewed' check(human_review in ('not_reviewed','correct','incorrect','partially_incorrect','needs_investigation')),
 reviewer_notes text not null default '' check(length(reviewer_notes)<=4000), reviewed_by uuid references auth.users(id), reviewed_at timestamptz,
 created_at timestamptz not null default now(), last_started_at timestamptz not null default now(), completed_at timestamptz,
 unique(attempt_id,client_request_id)
);
create unique index one_running_evaluation on public.message_evaluations(attempt_id) where status='running';
create index evaluation_user_quota on public.message_evaluations(user_id,completed_at,status);
create index evaluation_attempt_history on public.message_evaluations(attempt_id,sequence_number desc);
create table public.assessment_runs (
 id uuid primary key default gen_random_uuid(), evaluation_id uuid not null references public.message_evaluations(id) on delete cascade,
 attempt_id uuid not null references public.attempts(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 problem_version_id text not null references public.problem_versions(id), message_id uuid not null references public.attempt_messages(id),
 claim_token uuid not null, call_index integer not null,
 role text not null check(role in ('primary','escalation')), mode text not null check(mode in ('live','mock')),
 evaluator_profile text not null, provider text not null, model text not null,
 policy_version text not null, schema_version text not null, profile_version text not null, revealed_hint_ids jsonb not null default '[]', recent_message_ids jsonb not null default '[]',
 status text not null default 'running' check(status in ('running','valid','failed')),
 intent text, validated_result jsonb, schema_valid boolean not null default false, semantic_valid boolean not null default false,
 issue_codes jsonb not null default '[]', escalation_reason jsonb not null default '[]',
 input_tokens bigint, output_tokens bigint, cached_tokens bigint, usage_status text not null default 'unavailable' check(usage_status in ('exact','estimated','unavailable')),
 latency_ms numeric, estimated_cost numeric, cost_status text not null default 'unavailable', error_type text,
 created_at timestamptz not null default now(), completed_at timestamptz,
 unique(evaluation_id,claim_token,role,call_index)
);
alter table public.message_evaluations add foreign key(final_assessment_run_id) references public.assessment_runs(id);
create index assessment_user_cost_window on public.assessment_runs(user_id,created_at,role);
create index assessment_evaluation on public.assessment_runs(evaluation_id,created_at);
alter table public.message_evaluations enable row level security;
alter table public.assessment_runs enable row level security;
revoke all on public.message_evaluations,public.assessment_runs from public,anon,authenticated;
grant select on public.message_evaluations,public.assessment_runs to authenticated;
create policy evaluation_admin_read on public.message_evaluations for select to authenticated using((select app_private.is_admin()));
create policy assessment_admin_read on public.assessment_runs for select to authenticated using((select app_private.is_admin()));

-- Both a verified user session AND a server-only capability are required. The
-- hash is provisioned through trusted SQL, never an app-admin/browser endpoint.
create function app_private.require_evaluator(p_secret text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or p_secret is null or length(p_secret)<32 or not exists(
 select 1 from app_private.evaluator_runtime where singleton and secret_sha256=encode(sha256(convert_to(p_secret,'UTF8')),'hex'))
 then raise exception 'Evaluation service unavailable' using errcode='42501'; end if;
end; $$;

create function app_private.evaluation_context(p_attempt uuid,p_evaluation uuid default null) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('attemptId',a.id,'state',a.reasoning_state,'progress',a.progress,
 'problem',jsonb_build_object('id',v.problem_id,'versionId',v.id,'scenario',v.scenario,'question',v.question,'assumptions',v.assumptions),
 -- No reference answer, evaluation examples or author notes are loaded for evaluation.
 'package',jsonb_build_object('problemVersionId',v.id,'referenceAnswer','','evaluationExamples','[]'::jsonb,
 'reasoningRubric',(select jsonb_agg(n-'notes' order by ord) from jsonb_array_elements(p.reasoning_rubric) with ordinality as item(n,ord)),
 'acceptableAlternativeApproaches',p.acceptable_alternative_approaches,'misconceptions',p.misconceptions,
 'hintLadder',case when p_evaluation is null then p.hint_ladder else '[]'::jsonb end,'completionCriteria',p.completion_criteria),
 'message',(select jsonb_build_object('id',m.id,'sequence',m.sequence_number,'content',m.content) from public.message_evaluations e join public.attempt_messages m on m.id=e.message_id where e.id=p_evaluation),
 'recentContext',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'sequence',r.sequence_number,'content',r.content) order by r.sequence_number) from
 (select m.* from public.attempt_messages m where m.attempt_id=a.id and m.role='user'
 and (p_evaluation is null or m.sequence_number<(select sequence_number from public.message_evaluations where id=p_evaluation)) order by sequence_number desc limit 4) r),'[]'::jsonb),
 'usedHints',coalesce((select jsonb_agg(jsonb_build_object('hintId',h.hint_id,'text',h.displayed_text) order by h.created_at,h.id) from public.hint_events h where h.attempt_id=a.id),'[]'::jsonb))
 from public.attempts a join public.problem_versions v on v.id=a.problem_version_id
 join public.problem_evaluation_packages p on p.problem_version_id=v.id where a.id=p_attempt;
$$;

-- All limits are passed by the trusted application, never by a public action argument.
create function public.evaluator_operation(p_secret text,p_operation text,p_attempt_id uuid,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.attempts; e public.message_evaluations; r public.assessment_runs;
 actor uuid:=auth.uid(); limits jsonb:=p_data->'limits'; req uuid; msg public.attempt_messages;
 current_revision integer; n integer; daily_start timestamptz:=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
 state jsonb; feedback_id uuid; h jsonb; final_run uuid;
begin
 perform app_private.require_evaluator(p_secret);
 -- Same lock order for every operation: user, then attempt. Durable cross-instance quotas.
 perform 1 from public.profiles where user_id=actor for update;
 select * into a from public.attempts where id=p_attempt_id and user_id=actor for update;
 if not found then raise exception 'Attempt unavailable' using errcode='42501'; end if;
 current_revision:=coalesce((a.reasoning_state->>'revision')::integer,0);
 if p_operation in ('claim','hint_context','hint_commit','reserve_run','finalize') and a.status<>'in_progress' then return jsonb_build_object('guard','attempt_not_active'); end if;
 -- Expired work cannot ever commit, even if its remote request later returns.
 -- Recover ALL this user's expired reservations so abandoned tabs cannot consume
 -- the user's in-flight quota forever. The shared profile lock serializes workers.
 update public.assessment_runs set status='failed',error_type='stale_evaluation',completed_at=now()
 where status='running' and evaluation_id in(select id from public.message_evaluations where user_id=actor and status='running' and lease_until<=now());
 update public.message_evaluations set status='failed',error_type='stale_evaluation',completed_at=now()
 where user_id=actor and status='running' and lease_until<=now();

 if p_operation='claim' then
  req:=(p_data->>'requestId')::uuid;
  perform app_private.ensure(req is not null and limits is not null,'Evaluation configuration required');
  if p_data->>'retryEvaluationId' is not null then
   select * into e from public.message_evaluations where id=(p_data->>'retryEvaluationId')::uuid and attempt_id=a.id;
   if not found then return jsonb_build_object('guard','retry_unavailable'); end if;
   if req=any(e.retry_request_ids) or e.status<>'failed' then return jsonb_build_object('duplicate',true); end if;
   if e.retry_count >= (limits->>'maxRetries')::integer or e.sequence_number<>(select max(sequence_number) from public.message_evaluations where attempt_id=a.id)
    or e.based_on_revision<>current_revision then return jsonb_build_object('guard','retry_unavailable'); end if;
  else
   select * into e from public.message_evaluations where attempt_id=a.id and client_request_id=req;
   if found then return jsonb_build_object('duplicate',true); end if;
   if coalesce(length(btrim(p_data->>'content')),0)<1 then return jsonb_build_object('guard','empty_message'); end if;
   if length(p_data->>'content')>(limits->>'maxMessageChars')::integer then return jsonb_build_object('guard','message_too_long'); end if;
   if btrim(p_data->>'content')=(select content from public.attempt_messages where attempt_id=a.id and role='user' order by sequence_number desc limit 1) then return jsonb_build_object('guard','duplicate_message'); end if;
  end if;
  if exists(select 1 from public.message_evaluations where attempt_id=a.id and status='running') then return jsonb_build_object('guard','evaluation_busy'); end if;
  if a.abuse_until>now() then return jsonb_build_object('guard','abuse_cooldown'); end if;
  if a.evaluation_mode is not null and a.evaluation_mode<>p_data->>'mode' then return jsonb_build_object('guard','mode_changed'); end if;
  if (select count(*) from public.assessment_runs where user_id=actor and created_at>now()-interval '1 minute') >= (limits->>'perUserMinute')::integer
   or (select count(*) from public.message_evaluations where user_id=actor and status='running')+(select count(*) from public.message_evaluations where user_id=actor and last_started_at>now()-interval '1 minute') >= (limits->>'perUserMinute')::integer
   or (select count(*) from public.assessment_runs where attempt_id=a.id and created_at>now()-interval '1 minute') >= (limits->>'perAttemptMinute')::integer
   then return jsonb_build_object('guard','rate_limit'); end if;
  if (select count(*) from public.message_evaluations where attempt_id=a.id and status in ('succeeded','running')) >= (limits->>'perAttempt')::integer then return jsonb_build_object('guard','attempt_quota'); end if;
  if (select count(*) from public.message_evaluations where user_id=actor and (status='running' or (status='succeeded' and completed_at>=daily_start))) >= (limits->>'perDay')::integer then return jsonb_build_object('guard','daily_quota'); end if;
  if (select count(*) from public.assessment_runs where user_id=actor and created_at>=daily_start) >= (limits->>'requestsPerDay')::integer then return jsonb_build_object('guard','request_quota'); end if;
  if a.abuse_until is not null and a.abuse_until<=now() then update public.attempts set abuse_strikes=0,abuse_until=null where id=a.id; end if;
  if e.id is null then
   insert into public.attempt_messages(attempt_id,role,content,request_id) values(a.id,'user',btrim(p_data->>'content'),req) returning * into msg;
   insert into public.message_evaluations(attempt_id,user_id,problem_version_id,message_id,client_request_id,sequence_number,based_on_revision,mode,status,claim_token,lease_until,progress_before,progress_after,state_revision)
   values(a.id,actor,a.problem_version_id,msg.id,req,msg.sequence_number,current_revision,p_data->>'mode','running',gen_random_uuid(),now()+make_interval(secs=>(limits->>'leaseSeconds')::integer),a.progress,a.progress,current_revision) returning * into e;
  else
   update public.message_evaluations set status='running',claim_token=gen_random_uuid(),lease_until=now()+make_interval(secs=>(limits->>'leaseSeconds')::integer),retry_count=retry_count+1,retry_request_ids=array_append(retry_request_ids,req),error_type=null,last_started_at=now(),completed_at=null
   where id=e.id returning * into e;
  end if;
  update public.attempts set evaluation_mode=p_data->>'mode' where id=a.id;
  return jsonb_build_object('evaluationId',e.id,'claimToken',e.claim_token,'context',app_private.evaluation_context(a.id,e.id));
 end if;

 if p_operation in ('reserve_run','finish_run','finalize') then
  select * into e from public.message_evaluations where id=(p_data->>'evaluationId')::uuid and attempt_id=a.id;
  if not found or e.status<>'running' or e.claim_token<>(p_data->>'claimToken')::uuid or e.lease_until<=now() then return jsonb_build_object('guard','stale_evaluation'); end if;
 end if;
 if p_operation='reserve_run' then
  if (select count(*) from public.assessment_runs where user_id=actor and created_at>=daily_start)>=(limits->>'requestsPerDay')::integer then return jsonb_build_object('guard','request_quota'); end if;
  if p_data->>'role'='escalation' and (select count(*) from public.assessment_runs where user_id=actor and role='escalation' and created_at>=daily_start)>=(limits->>'escalationsPerDay')::integer then return jsonb_build_object('guard','escalation_quota'); end if;
  insert into public.assessment_runs(evaluation_id,attempt_id,user_id,problem_version_id,message_id,claim_token,call_index,role,mode,evaluator_profile,provider,model,policy_version,schema_version,profile_version,escalation_reason,revealed_hint_ids,recent_message_ids)
  values(e.id,a.id,actor,a.problem_version_id,e.message_id,e.claim_token,(p_data->>'callIndex')::integer,p_data->>'role',e.mode,p_data->>'profile',p_data->>'provider',p_data->>'model',p_data->>'policyVersion',p_data->>'schemaVersion',p_data->>'profileVersion',coalesce(p_data->'reasons','[]'),coalesce(p_data->'revealedHintIds','[]'),coalesce(p_data->'recentMessageIds','[]')) returning * into r;
  return jsonb_build_object('runId',r.id);
 elsif p_operation='finish_run' then
  update public.assessment_runs set status=case when p_data->>'errorType' is null then 'valid' else 'failed' end,
   error_type=p_data->>'errorType',validated_result=nullif(p_data->'result','null'),intent=p_data->'result'->>'intent',
   schema_valid=(p_data->>'schemaValid')::boolean,semantic_valid=(p_data->>'semanticValid')::boolean,issue_codes=coalesce(p_data->'issueCodes','[]'),
   input_tokens=(p_data->>'inputTokens')::bigint,output_tokens=(p_data->>'outputTokens')::bigint,cached_tokens=(p_data->>'cachedTokens')::bigint,
   usage_status=p_data->>'usageStatus',latency_ms=(p_data->>'latencyMs')::numeric,estimated_cost=(p_data->>'estimatedCost')::numeric,cost_status=p_data->>'costStatus',completed_at=now()
   where id=(p_data->>'runId')::uuid and evaluation_id=e.id and claim_token=e.claim_token and status='running';
  if not found then return jsonb_build_object('guard','stale_evaluation'); end if;
  return jsonb_build_object('ok',true);
 elsif p_operation='finalize' then
  if current_revision<>e.based_on_revision then return jsonb_build_object('guard','stale_evaluation'); end if;
  state:=nullif(p_data->'state','null'); final_run:=(p_data->>'finalRunId')::uuid;
  if p_data->>'status'='succeeded' then
   select * into r from public.assessment_runs where id=final_run and evaluation_id=e.id and claim_token=e.claim_token and status='valid' and semantic_valid;
   perform app_private.ensure(found,'A validated final assessment is required');
   if r.intent='reasoning' then
    perform app_private.ensure(state->>'problemVersionId'=a.problem_version_id and (state->>'revision')::integer=current_revision+1 and (state->>'lastSequence')::bigint=e.sequence_number,'Invalid reasoning revision');
    update public.attempts set reasoning_state=state,progress=(p_data->>'progress')::numeric,core_complete=(p_data->>'coreComplete')::boolean where id=a.id;
   else
    perform app_private.ensure(state is null,'Non-reasoning cannot change state');
   end if;
   n:=case when r.intent in ('off_topic','prompt_injection') then a.abuse_strikes+1 else 0 end;
   update public.attempts set abuse_strikes=n,abuse_until=case when n>=(limits->>'abuseThreshold')::integer then now()+make_interval(secs=>(limits->>'cooldownSeconds')::integer) else null end where id=a.id;
  else
   perform app_private.ensure(state is null,'Failure cannot change reasoning state');
  end if;
  -- Retry replaces only the previous failure notice, never the user's message.
  if e.feedback_message_id is null then
   insert into public.attempt_messages(attempt_id,role,content) values(a.id,'interviewer',p_data->>'feedback') returning id into feedback_id;
  else
   feedback_id:=e.feedback_message_id;
   update public.attempt_messages set content=p_data->>'feedback' where id=feedback_id and attempt_id=a.id and role='interviewer';
  end if;
  update public.message_evaluations set status=p_data->>'status',final_assessment_run_id=final_run,
   final_intent=case when p_data->>'status'='succeeded' then r.intent else null end,
   final_result=case when p_data->>'status'='succeeded' then r.validated_result else null end,
   progress_after=(select progress from public.attempts where id=a.id),state_revision=(select (reasoning_state->>'revision')::integer from public.attempts where id=a.id),
   error_type=p_data->>'errorType',feedback_message_id=feedback_id,completed_at=now() where id=e.id;
  return jsonb_build_object('ok',true);
 elsif p_operation='hint_context' then
  if exists(select 1 from public.hint_events where attempt_id=a.id and request_id=(p_data->>'requestId')::uuid) then return jsonb_build_object('ok',true,'duplicate',true); end if;
  if exists(select 1 from public.message_evaluations where attempt_id=a.id and status='running') then return jsonb_build_object('guard','evaluation_busy'); end if;
  return app_private.evaluation_context(a.id);
 elsif p_operation='hint_commit' then
  req:=(p_data->>'requestId')::uuid;
  if exists(select 1 from public.hint_events where attempt_id=a.id and request_id=req) then return jsonb_build_object('ok',true); end if;
  if current_revision<>(p_data->>'revision')::integer or exists(select 1 from public.message_evaluations where attempt_id=a.id and status='running') then return jsonb_build_object('guard','evaluation_busy'); end if;
  select x into h from public.problem_evaluation_packages p cross join lateral jsonb_array_elements(p.hint_ladder) x
   where p.problem_version_id=a.problem_version_id and x->>'id'=p_data->>'hintId' and not exists(select 1 from public.hint_events where attempt_id=a.id and hint_id=x->>'id');
  if h is null then return jsonb_build_object('guard','hints_unavailable'); end if;
  insert into public.hint_events(attempt_id,hint_id,hint_level,displayed_text,request_id) values(a.id,h->>'id',(h->>'level')::integer,h->>'text',req);
  insert into public.attempt_messages(attempt_id,role,content) values(a.id,'system_hint',h->>'text');
  return jsonb_build_object('ok',true);
 end if;
 raise exception 'Unknown evaluator operation' using errcode='22023';
end; $$;

create function public.get_evaluation_status(p_attempt_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.message_evaluations;
begin
 if not exists(select 1 from public.attempts where id=p_attempt_id and user_id=auth.uid()) then raise exception 'Attempt unavailable' using errcode='42501'; end if;
 select * into e from public.message_evaluations where attempt_id=p_attempt_id order by sequence_number desc limit 1;
 return jsonb_build_object('id',e.id,'status',case when e.status='running' and e.lease_until<=now() then 'failed' else coalesce(e.status,'idle') end,
 'error',case when e.status='running' and e.lease_until<=now() then 'stale_evaluation' else e.error_type end,'retryCount',coalesce(e.retry_count,0));
end; $$;
create function public.admin_review_evaluation(p_id uuid,p_review text,p_notes text) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform app_private.require_admin();
 perform app_private.ensure(p_review in ('correct','incorrect','partially_incorrect','needs_investigation') and length(p_notes)<=4000,'Invalid human review');
 update public.message_evaluations set human_review=p_review,reviewer_notes=p_notes,reviewed_by=auth.uid(),reviewed_at=now() where id=p_id;
 if not found then raise exception 'Evaluation unavailable' using errcode='P0002'; end if;
end; $$;
create or replace function public.finish_interview(p_attempt_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.attempts;
begin
 select * into a from public.attempts where id=p_attempt_id and user_id=auth.uid() for update;
 if not found then raise exception 'Attempt unavailable' using errcode='42501'; end if;
 if a.status='completed' then return a.id; end if;
 perform app_private.ensure(a.status='in_progress','Interview unavailable');
 if exists(select 1 from public.message_evaluations where attempt_id=a.id and status='running' and lease_until>now()) then raise exception 'Evaluation in progress' using errcode='23514'; end if;
 update public.attempts set status='completed',completed_at=now() where id=a.id;
 return a.id;
end; $$;
create or replace function public.get_attempt_debrief(p_attempt_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.attempts; p public.problem_evaluation_packages;
begin
 select * into a from public.attempts where id=p_attempt_id and user_id=(select auth.uid()) and status='completed';
 if not found then raise exception 'Completed interview unavailable' using errcode='42501'; end if;
 select * into p from public.problem_evaluation_packages where problem_version_id=a.problem_version_id;
 if not found then raise exception 'Reference material unavailable' using errcode='P0002'; end if;
 return jsonb_build_object('problemVersionId',a.problem_version_id,'referenceAnswer',p.reference_answer,
   'progress',a.progress,'evaluated',a.evaluation_mode='live' and coalesce((a.reasoning_state->>'revision')::integer,0)>0,
   'areas',coalesce((select jsonb_agg(jsonb_build_object('label',x->>'label','status',coalesce(a.reasoning_state->'nodes'->(x->>'id')->>'status','unseen'))) from jsonb_array_elements(p.reasoning_rubric) x),'[]'::jsonb),
   'keyIdeas',coalesce((select jsonb_agg(jsonb_build_object('label',x->>'label','description',x->>'description')) from jsonb_array_elements(p.reasoning_rubric) x),'[]'::jsonb),
   'alternativeApproaches',coalesce((select jsonb_agg(jsonb_build_object('id',x->>'id','title',coalesce(nullif(btrim(x->>'title'),''),'Alternative approach'),'description',x->>'description')) from jsonb_array_elements(p.acceptable_alternative_approaches) x),'[]'::jsonb));
end; $$;


-- QA reads messages through admin-only RLS, never through a user endpoint.
create policy messages_admin_qa on public.attempt_messages for select to authenticated using((select app_private.is_admin()));
-- Prevent bypassing the live pipeline through the old scripted mutation RPCs.
revoke execute on function public.append_interview_turn(uuid,text,uuid),public.request_interview_hint(uuid,uuid) from public,anon,authenticated;
revoke all on function app_private.require_evaluator(text),app_private.evaluation_context(uuid,uuid) from public,anon,authenticated;
revoke all on function public.evaluator_operation(text,text,uuid,jsonb),public.get_evaluation_status(uuid),public.admin_review_evaluation(uuid,text,text) from public,anon;
grant execute on function public.evaluator_operation(text,text,uuid,jsonb),public.get_evaluation_status(uuid),public.admin_review_evaluation(uuid,text,text) to authenticated;
end;
$m4b$;
