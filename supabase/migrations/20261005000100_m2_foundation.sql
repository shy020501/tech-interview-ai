-- M2 only. Apply once to a Supabase project as its trusted migration owner.
-- Application runtime uses a publishable key + the authenticated user's JWT.
-- The Supabase migration runner owns the transaction and migration history.

create schema if not exists app_private;
revoke all on schema app_private from public;
grant usage on schema app_private to anon, authenticated;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create function app_private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(user_id, role) values (new.id, 'user');
  return new;
end;
$$;
revoke all on function app_private.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users
for each row execute function app_private.handle_new_user();
insert into public.profiles(user_id) select id from auth.users on conflict do nothing;

create function app_private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where user_id = (select auth.uid()) and role = 'admin');
$$;
revoke all on function app_private.is_admin() from public;
grant execute on function app_private.is_admin() to anon, authenticated;

create table public.categories (
  id text primary key,
  slug text not null unique check (length(slug) between 1 and 150),
  name text not null check (length(btrim(name)) > 0),
  parent_id text references public.categories(id) on delete restrict,
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (parent_id is distinct from id)
);
create index categories_parent_idx on public.categories(parent_id, sort_order);
create function app_private.prevent_category_cycle() returns trigger
language plpgsql set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(7312401);
  if exists (
    with recursive ancestors as (
      select id, parent_id from public.categories where id = new.parent_id
      union
      select c.id, c.parent_id from public.categories c join ancestors a on c.id = a.parent_id
    ) select 1 from ancestors where id = new.id
  ) then raise exception 'Category cycle is not allowed' using errcode = '23514'; end if;
  return new;
end;
$$;
create trigger categories_no_cycles before insert or update of parent_id on public.categories
for each row execute function app_private.prevent_category_cycle();

create table public.problems (
  id text primary key,
  slug text not null unique check (length(slug) between 1 and 200),
  status text not null default 'draft' check (status in ('draft', 'needs_review', 'published', 'archived')),
  current_version_id text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'published' or (current_version_id is not null and published_at is not null))
);
create table public.problem_versions (
  id text primary key,
  problem_id text not null references public.problems(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  title text not null check (length(btrim(title)) > 0),
  short_description text not null,
  scenario text not null,
  question text not null,
  assumptions text[] not null default '{}',
  visualization jsonb check (visualization is null or jsonb_typeof(visualization) = 'object'),
  question_type text not null check (question_type in ('fundamental', 'applied')),
  competency_ids text[] not null default '{}',
  difficulty text not null check (difficulty in ('beginner', 'intermediate', 'advanced')),
  tags text[] not null default '{}',
  origin text not null default 'original_mock' check (origin = 'original_mock'),
  created_at timestamptz not null default now(),
  unique (problem_id, version_number),
  unique (id, problem_id)
);
alter table public.problems add constraint current_version_belongs_to_problem
foreign key (current_version_id, id) references public.problem_versions(id, problem_id)
deferrable initially deferred;

create table public.problem_categories (
  problem_id text not null references public.problems(id) on delete cascade,
  category_id text not null references public.categories(id) on delete restrict,
  is_primary boolean not null default false,
  primary key (problem_id, category_id)
);
create unique index one_primary_category_per_problem on public.problem_categories(problem_id) where is_primary;
create index problem_categories_category_idx on public.problem_categories(category_id);

create table public.problem_evaluation_packages (
  id uuid primary key default gen_random_uuid(),
  problem_version_id text not null unique references public.problem_versions(id) on delete restrict,
  reference_answer text not null,
  reasoning_rubric jsonb not null check (jsonb_typeof(reasoning_rubric) = 'array'),
  acceptable_alternative_approaches jsonb not null check (jsonb_typeof(acceptable_alternative_approaches) = 'array'),
  misconceptions jsonb not null check (jsonb_typeof(misconceptions) = 'array'),
  hint_ladder jsonb not null check (jsonb_typeof(hint_ladder) = 'array'),
  completion_criteria jsonb not null check (jsonb_typeof(completion_criteria) = 'object'),
  evaluation_examples jsonb not null check (jsonb_typeof(evaluation_examples) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  problem_id text not null references public.problems(id) on delete restrict,
  problem_version_id text not null,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed', 'abandoned')),
  reasoning_state jsonb not null default jsonb_build_object('revision', 0, 'assessments', '{}'::jsonb, 'contradictions', '[]'::jsonb, 'updatedAt', now()) check (jsonb_typeof(reasoning_state) = 'object'),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  foreign key (problem_version_id, problem_id) references public.problem_versions(id, problem_id) on delete restrict,
  check ((status = 'in_progress' and completed_at is null) or (status <> 'in_progress' and completed_at is not null))
);
create unique index one_active_attempt_per_problem on public.attempts(user_id, problem_id) where status = 'in_progress';
create index attempts_owner_history_idx on public.attempts(user_id, started_at desc);
create index attempts_version_idx on public.attempts(problem_version_id);
create index attempts_problem_idx on public.attempts(problem_id);

create table public.attempt_messages (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  sequence_number bigint generated always as identity,
  role text not null check (role in ('user', 'interviewer', 'system_hint')),
  content text not null check (length(btrim(content)) between 1 and 4000),
  request_id uuid,
  created_at timestamptz not null default now(),
  unique (attempt_id, request_id, role)
);
create index attempt_messages_order_idx on public.attempt_messages(attempt_id, sequence_number);
create table public.hint_events (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  hint_id text not null,
  hint_level integer not null check (hint_level > 0),
  displayed_text text not null check (length(btrim(displayed_text)) between 1 and 4000),
  created_at timestamptz not null default now(),
  unique (attempt_id, hint_id)
);

create function app_private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end;
$$;
create trigger profiles_updated before update on public.profiles for each row execute function app_private.touch_updated_at();
create trigger categories_updated before update on public.categories for each row execute function app_private.touch_updated_at();
create trigger problems_updated before update on public.problems for each row execute function app_private.touch_updated_at();
create trigger packages_updated before update on public.problem_evaluation_packages for each row execute function app_private.touch_updated_at();
create trigger attempts_updated before update on public.attempts for each row execute function app_private.touch_updated_at();

-- Once an attempt references a version, neither its public content nor its private
-- evaluation criteria can be edited in place. Author a new version in M3.
create function app_private.protect_attempt_version() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_id text;
begin
  if tg_table_name = 'problem_versions' then v_id := old.id;
  elsif tg_op = 'INSERT' then v_id := new.problem_version_id;
  else v_id := old.problem_version_id;
  end if;
  -- Serialize against start_interview, which locks the version before inserting an attempt.
  perform 1 from public.problem_versions where id = v_id for update;
  if exists (select 1 from public.attempts where problem_version_id = v_id) then
    raise exception 'Create a new problem version; this version has attempts' using errcode = '23514';
  end if;
  if tg_table_name = 'problem_evaluation_packages' then
    if tg_op = 'UPDATE' and new.problem_version_id <> old.problem_version_id then
      raise exception 'Evaluation packages cannot move between versions' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger version_frozen before update or delete on public.problem_versions for each row execute function app_private.protect_attempt_version();
create trigger package_frozen before insert or update or delete on public.problem_evaluation_packages for each row execute function app_private.protect_attempt_version();
revoke all on function app_private.protect_attempt_version() from public, anon, authenticated;
revoke all on function app_private.touch_updated_at() from public, anon, authenticated;
revoke all on function app_private.prevent_category_cycle() from public, anon, authenticated;

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.problems enable row level security;
alter table public.problem_versions enable row level security;
alter table public.problem_categories enable row level security;
alter table public.problem_evaluation_packages enable row level security;
alter table public.attempts enable row level security;
alter table public.attempt_messages enable row level security;
alter table public.hint_events enable row level security;

revoke all on public.profiles, public.categories, public.problems, public.problem_versions,
  public.problem_categories, public.problem_evaluation_packages, public.attempts,
  public.attempt_messages, public.hint_events from public, anon, authenticated;
revoke all on sequence public.attempt_messages_sequence_number_seq from public, anon, authenticated;
grant select on public.categories, public.problems, public.problem_versions, public.problem_categories to anon, authenticated;
grant insert, update, delete on public.categories, public.problems, public.problem_versions, public.problem_categories to authenticated;
grant select, insert, update, delete on public.problem_evaluation_packages to authenticated;
grant select on public.profiles, public.attempt_messages, public.hint_events to authenticated;
-- Keep future evaluator state server-owned even when an owner uses the Data API directly.
grant select (id, user_id, problem_id, problem_version_id, status, started_at, completed_at, updated_at) on public.attempts to authenticated;
-- No profile UPDATE grant/policy, even for app admins. Bootstrap uses trusted SQL.
create policy profiles_self_read on public.profiles for select to authenticated using (user_id = (select auth.uid()));
create policy categories_public_read on public.categories for select to anon, authenticated using (true);
create policy categories_admin_write on public.categories for all to authenticated using ((select app_private.is_admin())) with check ((select app_private.is_admin()));
create policy problems_public_read on public.problems for select to anon, authenticated using (status = 'published');
create policy problems_admin_write on public.problems for all to authenticated using ((select app_private.is_admin())) with check ((select app_private.is_admin()));
-- Historical identity/content is available only to an owner of an existing attempt.
create policy problems_attempt_owner_read on public.problems for select to authenticated using (exists (select 1 from public.attempts a where a.problem_id = problems.id and a.user_id = (select auth.uid())));
create policy versions_public_read on public.problem_versions for select to anon, authenticated using (exists (select 1 from public.problems p where p.id = problem_id and p.status = 'published' and p.current_version_id = problem_versions.id));
create policy versions_attempt_owner_read on public.problem_versions for select to authenticated using (exists (select 1 from public.attempts a where a.problem_version_id = problem_versions.id and a.user_id = (select auth.uid())));
create policy versions_admin_write on public.problem_versions for all to authenticated using ((select app_private.is_admin())) with check ((select app_private.is_admin()));
create policy problem_categories_public_read on public.problem_categories for select to anon, authenticated using (exists (select 1 from public.problems p where p.id = problem_id and p.status = 'published'));
create policy problem_categories_owner_read on public.problem_categories for select to authenticated using (exists (select 1 from public.attempts a where a.problem_id = problem_categories.problem_id and a.user_id = (select auth.uid())));
create policy problem_categories_admin_write on public.problem_categories for all to authenticated using ((select app_private.is_admin())) with check ((select app_private.is_admin()));
create policy packages_admin_only on public.problem_evaluation_packages for all to authenticated using ((select app_private.is_admin())) with check ((select app_private.is_admin()));
create policy attempts_owner_read on public.attempts for select to authenticated using (user_id = (select auth.uid()));
create policy messages_owner_read on public.attempt_messages for select to authenticated using (exists (select 1 from public.attempts a where a.id = attempt_id and a.user_id = (select auth.uid())));
create policy hints_owner_read on public.hint_events for select to authenticated using (exists (select 1 from public.attempts a where a.id = attempt_id and a.user_id = (select auth.uid())));

-- Deliberately narrow, atomic write API. Direct table writes are denied, so a
-- browser cannot forge interviewer messages, reasoning_state, or hint contents.
create function public.start_interview(p_problem_id text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_problem public.problems; v_attempt uuid;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  perform 1 from public.profiles where user_id = v_user for update;
  if not found then raise exception 'Profile unavailable' using errcode = '42501'; end if;
  select * into v_problem from public.problems where id = p_problem_id and status = 'published' for share;
  if not found then raise exception 'Problem unavailable' using errcode = '42501'; end if;
  select id into v_attempt from public.attempts where user_id = v_user and problem_id = p_problem_id and status = 'in_progress' order by started_at desc limit 1;
  if v_attempt is not null then return v_attempt; end if;
  perform 1 from public.problem_versions where id = v_problem.current_version_id for share;
  insert into public.attempts(user_id, problem_id, problem_version_id)
    values (v_user, v_problem.id, v_problem.current_version_id) returning id into v_attempt;
  return v_attempt;
end;
$$;
create function public.append_interview_turn(p_attempt_id uuid, p_content text, p_request_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_attempt public.attempts; v_turn integer; v_feedback text;
begin
  select * into v_attempt from public.attempts where id = p_attempt_id and user_id = (select auth.uid()) for update;
  if not found then raise exception 'Attempt unavailable' using errcode = '42501'; end if;
  if exists (select 1 from public.attempt_messages where attempt_id = p_attempt_id and request_id = p_request_id and role = 'user') then return p_attempt_id; end if;
  if v_attempt.status <> 'in_progress' then raise exception 'Interview is finished' using errcode = '23514'; end if;
  if p_request_id is null or p_content is null or length(btrim(p_content)) not between 1 and 4000 then raise exception 'Invalid message' using errcode = '22023'; end if;
  select count(*) into v_turn from public.attempt_messages where attempt_id = p_attempt_id and role = 'user';
  v_feedback := case when v_turn = 0 then 'Response recorded. Continue explaining the assumptions behind your approach. This preview does not assess correctness.'
    when v_turn = 1 then 'Your reasoning has been added to the conversation. You can refine an earlier statement or explain a limitation.'
    else 'Response recorded. You can continue your explanation, request the optional hint, or finish to review your saved conversation.' end;
  insert into public.attempt_messages(attempt_id, role, content, request_id) values (p_attempt_id, 'user', btrim(p_content), p_request_id);
  insert into public.attempt_messages(attempt_id, role, content, request_id) values (p_attempt_id, 'interviewer', v_feedback, p_request_id);
  update public.attempts set updated_at = now() where id = p_attempt_id;
  return p_attempt_id;
end;
$$;
create function public.request_interview_hint(p_attempt_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_attempt public.attempts; v_hint jsonb;
begin
  select * into v_attempt from public.attempts where id = p_attempt_id and user_id = (select auth.uid()) for update;
  if not found then raise exception 'Attempt unavailable' using errcode = '42501'; end if;
  if exists (select 1 from public.hint_events where attempt_id = p_attempt_id) then return p_attempt_id; end if;
  if v_attempt.status <> 'in_progress' then raise exception 'Interview is finished' using errcode = '23514'; end if;
  -- M2 fixed first hint only, never the entire ladder or adaptive selection.
  select hint_ladder -> 0 into v_hint from public.problem_evaluation_packages where problem_version_id = v_attempt.problem_version_id;
  if v_hint is null or coalesce(length(v_hint ->> 'id'), 0) = 0 or coalesce(length(v_hint ->> 'text'), 0) = 0 then raise exception 'Hint unavailable' using errcode = '22023'; end if;
  insert into public.hint_events(attempt_id, hint_id, hint_level, displayed_text) values (p_attempt_id, v_hint ->> 'id', (v_hint ->> 'level')::integer, v_hint ->> 'text');
  insert into public.attempt_messages(attempt_id, role, content) values (p_attempt_id, 'system_hint', v_hint ->> 'text');
  update public.attempts set updated_at = now() where id = p_attempt_id;
  return p_attempt_id;
end;
$$;
create function public.finish_interview(p_attempt_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_attempt public.attempts;
begin
  select * into v_attempt from public.attempts where id = p_attempt_id and user_id = (select auth.uid()) for update;
  if not found then raise exception 'Attempt unavailable' using errcode = '42501'; end if;
  if v_attempt.status = 'completed' then return p_attempt_id; end if;
  if v_attempt.status <> 'in_progress' then raise exception 'Interview unavailable' using errcode = '23514'; end if;
  update public.attempts set status = 'completed', completed_at = now() where id = p_attempt_id;
  return p_attempt_id;
end;
$$;
revoke all on function public.start_interview(text), public.append_interview_turn(uuid, text, uuid), public.request_interview_hint(uuid), public.finish_interview(uuid) from public, anon;
grant execute on function public.start_interview(text), public.append_interview_turn(uuid, text, uuid), public.request_interview_hint(uuid), public.finish_interview(uuid) to authenticated;
