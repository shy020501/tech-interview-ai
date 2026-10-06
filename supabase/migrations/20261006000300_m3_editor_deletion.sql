-- M3 follow-up: explicit, admin-only deletion. Applying this migration deletes no data.
-- Keep the whole file atomic for the hosted GitHub migration runner.
do $m3_deletion$
begin
-- Only a whole problem with no interviews may be removed. Attempts retain RESTRICT FKs.
alter table public.problem_versions drop constraint problem_versions_problem_id_fkey,
  add constraint problem_versions_problem_id_fkey foreign key(problem_id) references public.problems(id) on delete cascade;
alter table public.problem_evaluation_packages drop constraint problem_evaluation_packages_problem_version_id_fkey,
  add constraint problem_evaluation_packages_problem_version_id_fkey foreign key(problem_version_id) references public.problem_versions(id) on delete cascade;
alter table public.problem_version_categories drop constraint problem_version_categories_problem_version_id_fkey,
  add constraint problem_version_categories_problem_version_id_fkey foreign key(problem_version_id) references public.problem_versions(id) on delete cascade;
alter table public.problem_sources drop constraint problem_sources_problem_version_id_fkey,
  add constraint problem_sources_problem_version_id_fkey foreign key(problem_version_id) references public.problem_versions(id) on delete cascade;

create or replace function app_private.protect_attempt_version() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_id text; v public.problem_versions;
begin
 if tg_table_name='problem_versions' then v_id:=old.id;
 elsif tg_op='INSERT' then v_id:=new.problem_version_id; else v_id:=old.problem_version_id; end if;
 select * into v from public.problem_versions where id=v_id for update;
 -- Permit cascading cleanup only after the problem identity has been removed.
 -- No client-controlled flag can unlock a published version; standalone changes stay frozen.
 if tg_op='DELETE'
    and not exists(select 1 from public.problems where id=v.problem_id)
    and not exists(select 1 from public.attempts where problem_version_id=v_id) then
   return old;
 end if;
 if tg_table_name='problem_versions' and tg_op='UPDATE' then
   perform app_private.ensure(new.id=old.id and new.problem_id=old.problem_id and new.version_number=old.version_number,'Version identity is immutable');
   if v.published_at is not null and new.status='superseded' and old.status='published'
      and (to_jsonb(new)-'status'-'updated_at')=(to_jsonb(old)-'status'-'updated_at') then return new; end if;
 end if;
 if v.published_at is not null or exists(select 1 from public.attempts where problem_version_id=v_id) then
   raise exception 'Published or attempted versions are immutable; create a new version' using errcode='23514';
 end if;
 if tg_op='UPDATE' and tg_table_name<>'problem_versions' then
   perform app_private.ensure(new.problem_version_id=old.problem_version_id,'Content cannot move between versions');
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end; $$;

create function public.admin_delete_source(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform app_private.require_admin();
 perform 1 from public.sources where id=p_id for update;
 perform app_private.ensure(found,'Source not found. Reload the list.');
 perform app_private.ensure(
   not exists(select 1 from public.question_candidates where source_id=p_id)
   and not exists(select 1 from public.problem_sources where source_id=p_id),
   'Cannot delete a source used by a candidate or problem version. Remove its references first.');
 delete from public.sources where id=p_id;
end; $$;

create function public.admin_delete_candidate(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform app_private.require_admin();
 -- The converted problem and its independent source links are deliberately retained.
 delete from public.question_candidates where id=p_id;
 perform app_private.ensure(found,'Candidate not found. Reload the list.');
end; $$;

create function public.admin_delete_problem(p_problem_id text) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform app_private.require_admin();
 -- start_interview also locks this identity, serializing new attempts with deletion.
 perform 1 from public.problems where id=p_problem_id for update;
 perform app_private.ensure(found,'Problem not found. Reload the list.');
 perform app_private.ensure(not exists(select 1 from public.attempts where problem_id=p_problem_id),
   'Cannot delete a problem with saved interviews. Archive it instead.');
 -- Preserve the original idea and allow another conversion after the old problem is gone.
 update public.question_candidates set converted_problem_id=null,status='pending_review' where converted_problem_id=p_problem_id;
 delete from public.problems where id=p_problem_id;
end; $$;

-- Existing RLS/table-write revocations remain in force. RPCs check the database admin role.
revoke all on function public.admin_delete_source(uuid),public.admin_delete_candidate(uuid),public.admin_delete_problem(text) from public,anon;
grant execute on function public.admin_delete_source(uuid),public.admin_delete_candidate(uuid),public.admin_delete_problem(text) to authenticated;
end;
$m3_deletion$;
