-- M3: incremental manual authoring. No reset, no external services, no elevated app key.
-- The migration runner owns this transaction. Existing identities/attempts remain intact.
lock table public.problems, public.problem_versions, public.problem_evaluation_packages in access exclusive mode;
drop trigger version_frozen on public.problem_versions;
alter table public.problems add column created_by uuid references auth.users(id) on delete set null;
alter table public.problem_versions
  add column status text not null default 'draft' check (status in ('draft','needs_review','published','superseded')),
  add column published_at timestamptz,
  add column published_by uuid references auth.users(id) on delete set null,
  add column created_by uuid references auth.users(id) on delete set null,
  add column updated_at timestamptz not null default now(),
  add column revision integer not null default 1 check (revision > 0);
-- Old versions with attempts are treated as published snapshots even if their identity is archived.
update public.problem_versions v set
  status = case when p.status = 'published' and p.current_version_id=v.id then 'published' when p.status = 'archived' or (p.status='published' and v.version_number < (select current_v.version_number from public.problem_versions current_v where current_v.id=p.current_version_id)) or exists (select 1 from public.attempts a where a.problem_version_id=v.id) then 'superseded' when p.status='needs_review' then 'needs_review' else 'draft' end,
  published_at = case when p.status='archived' or (p.status='published' and v.version_number <= (select current_v.version_number from public.problem_versions current_v where current_v.id=p.current_version_id)) or exists (select 1 from public.attempts a where a.problem_version_id=v.id) then coalesce(p.published_at,v.created_at) else null end
from public.problems p where p.id=v.problem_id;
alter table public.problem_versions drop constraint problem_versions_origin_check;
alter table public.problem_versions add constraint problem_versions_origin_check check (origin in ('original_mock','manual'));
create unique index one_published_version_per_problem on public.problem_versions(problem_id) where status='published';
create unique index one_editable_version_per_problem on public.problem_versions(problem_id) where status in ('draft','needs_review');

create table public.problem_version_categories (
  problem_version_id text not null references public.problem_versions(id) on delete restrict,
  category_id text not null references public.categories(id) on delete restrict,
  is_primary boolean not null default false,
  primary key(problem_version_id,category_id)
);
create unique index one_primary_category_per_version on public.problem_version_categories(problem_version_id) where is_primary;
insert into public.problem_version_categories select v.id, c.category_id, c.is_primary from public.problem_versions v join public.problem_categories c on c.problem_id=v.problem_id;

create table public.sources (
  id uuid primary key default gen_random_uuid(), title text not null check(length(btrim(title)) between 1 and 500),
  url text not null check(url ~ '^https?://[^[:space:]]+$'),
  source_type text not null check(source_type in ('paper','technical_blog','video','interview_report','educational_material','social_media','other')),
  status text not null default 'discovered' check(status in ('discovered','screened','rejected','candidate_created')),
  discovered_at timestamptz not null default now(), relevance_score integer check(relevance_score between 0 and 100),
  suggested_category_ids text[] not null default '{}', notes text not null default '', provenance_notes text not null default '',
  usage_status text not null default 'unknown' check(usage_status in ('unknown','reference_only','approved_for_reuse')),
  usage_notes text not null default '', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
create table public.question_candidates (
  id uuid primary key default gen_random_uuid(), source_id uuid references public.sources(id) on delete restrict,
  suggested_title text not null check(length(btrim(suggested_title)) between 1 and 500), suggested_scenario text not null default '', suggested_question text not null default '',
  suggested_category_ids text[] not null default '{}', question_type text not null check(question_type in ('fundamental','applied')),
  competency_ids text[] not null default '{}', difficulty text not null check(difficulty in ('beginner','intermediate','advanced')),
  candidate_score integer check(candidate_score between 0 and 100), status text not null default 'pending_review' check(status in ('pending_review','rejected','converted_to_problem')),
  notes text not null default '', converted_problem_id text unique references public.problems(id) on delete restrict,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id) on delete set null,
  check ((status='converted_to_problem') = (converted_problem_id is not null))
);
create table public.problem_sources (
  problem_version_id text not null references public.problem_versions(id) on delete restrict,
  source_id uuid not null references public.sources(id) on delete restrict,
  relation_type text not null check(relation_type in ('inspired_by','adapted_from','reference','validation_source')),
  attribution_note text not null default '', primary key(problem_version_id,source_id)
);
create index candidates_source_idx on public.question_candidates(source_id);
create index version_categories_category_idx on public.problem_version_categories(category_id);
create index problem_sources_source_idx on public.problem_sources(source_id);
create trigger sources_updated before update on public.sources for each row execute function app_private.touch_updated_at();
create trigger candidates_updated before update on public.question_candidates for each row execute function app_private.touch_updated_at();
create trigger versions_updated before update on public.problem_versions for each row execute function app_private.touch_updated_at();

alter table public.sources enable row level security;
alter table public.question_candidates enable row level security;
alter table public.problem_sources enable row level security;
alter table public.problem_version_categories enable row level security;
revoke all on public.sources, public.question_candidates, public.problem_sources, public.problem_version_categories from public, anon, authenticated;
grant select on public.sources, public.question_candidates, public.problem_sources to authenticated;
grant select on public.problem_version_categories to anon, authenticated;
-- All editorial writes go through validated, role-checked RPCs. An admin cannot bypass publication by PATCHing a table.
revoke insert,update,delete on public.categories,public.problems,public.problem_versions,public.problem_categories,public.problem_evaluation_packages from authenticated;
create policy sources_admin on public.sources for select to authenticated using ((select app_private.is_admin()));
create policy candidates_admin on public.question_candidates for select to authenticated using ((select app_private.is_admin()));
create policy problem_sources_admin on public.problem_sources for select to authenticated using ((select app_private.is_admin()));
create policy version_categories_visible on public.problem_version_categories for select to anon,authenticated using (
  exists(select 1 from public.problem_versions v where v.id=problem_version_id)
);
-- Existing version RLS exposes only current public content, admin content, or an owner's pinned history.

create function app_private.require_admin() returns uuid language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not app_private.is_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
 return auth.uid();
end; $$;
create function app_private.ensure(p_ok boolean,p_message text) returns void language plpgsql set search_path='' as $$
begin if p_ok is not true then raise exception '%',p_message using errcode='22023'; end if; end; $$;
create function app_private.string_array(p_value jsonb) returns text[] language plpgsql set search_path='' as $$
begin
 perform app_private.ensure(jsonb_typeof(p_value)='array','Expected a list of text values');
 perform app_private.ensure(not exists(select 1 from jsonb_array_elements(p_value) x where jsonb_typeof(x)<>'string'),'Expected text list items');
 return array(select jsonb_array_elements_text(p_value));
end; $$;
create function app_private.check_categories(p_ids text[]) returns void language plpgsql set search_path='' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(7312401);
 perform app_private.ensure(not exists(select 1 from unnest(p_ids) x where not exists(select 1 from public.categories c where c.id=x)),'A referenced category does not exist');
 perform app_private.ensure(cardinality(p_ids)=(select count(distinct x) from unnest(p_ids) x),'Duplicate category IDs');
end; $$;
create function app_private.check_competencies(p_ids text[]) returns void language plpgsql set search_path='' as $$
begin
 perform app_private.ensure(p_ids <@ array['objective_design','failure_diagnosis','debugging','architecture_choice','experiment_design','tradeoff','system_design']::text[],'Invalid competency');
end; $$;
create function app_private.empty_package() returns jsonb language sql immutable set search_path='' as $$
 select '{"referenceAnswer":"","reasoningRubric":[],"acceptableAlternativeApproaches":[],"misconceptions":[],"hintLadder":[],"completionCriteria":{"requiredNodeIds":[],"alternativeNodeGroups":[],"description":""},"evaluationExamples":[]}'::jsonb;
$$;

create or replace function app_private.protect_attempt_version() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_id text; v public.problem_versions;
begin
 if tg_table_name='problem_versions' then v_id:=old.id;
 elsif tg_op='INSERT' then v_id:=new.problem_version_id; else v_id:=old.problem_version_id; end if;
 select * into v from public.problem_versions where id=v_id for update;
 if tg_table_name='problem_versions' and tg_op='UPDATE' then
   perform app_private.ensure(new.id=old.id and new.problem_id=old.problem_id and new.version_number=old.version_number,'Version identity is immutable');
   -- A publication transition can supersede a snapshot, never rewrite its content or remove publication evidence.
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
create trigger version_frozen before update or delete on public.problem_versions for each row execute function app_private.protect_attempt_version();
create trigger version_categories_frozen before insert or update or delete on public.problem_version_categories for each row execute function app_private.protect_attempt_version();
create trigger problem_sources_frozen before insert or update or delete on public.problem_sources for each row execute function app_private.protect_attempt_version();

-- Structural checks run on draft saves too; completeness is required only for publication.
create function app_private.check_package(p jsonb, p_publish boolean default false) returns void
language plpgsql set search_path='' as $$
declare n jsonb; h jsonb; x jsonb; e jsonb; a jsonb; r jsonb; ids text[]; mids text[]; refs text[]; k text;
begin
 perform app_private.ensure(jsonb_typeof(p)='object','Evaluation package must be an object');
 perform app_private.ensure(jsonb_typeof(p->'referenceAnswer')='string' and length(p->>'referenceAnswer')<=30000,'Invalid reference answer');
 foreach k in array array['reasoningRubric','acceptableAlternativeApproaches','misconceptions','hintLadder','evaluationExamples'] loop
   perform app_private.ensure(jsonb_typeof(p->k)='array','Evaluation sections must be lists');
   perform app_private.ensure(jsonb_array_length(p->k)<=100,'Too many evaluation items');
   perform app_private.ensure(not exists(select 1 from jsonb_array_elements(p->k) q where jsonb_typeof(q)<>'object' or coalesce(q->>'id','') !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$'),'Evaluation items need stable IDs');
   perform app_private.ensure((select count(*)=count(distinct q->>'id') from jsonb_array_elements(p->k) q),'Duplicate evaluation IDs');
 end loop;
 ids:=array(select q->>'id' from jsonb_array_elements(p->'reasoningRubric') q);
 mids:=array(select q->>'id' from jsonb_array_elements(p->'misconceptions') q);
 for n in select * from jsonb_array_elements(p->'reasoningRubric') loop
   perform app_private.ensure(jsonb_typeof(n->'weight')='number','Rubric weight must be a number');
   perform app_private.ensure((n->>'weight')::numeric>=0 and (n->>'weight')::numeric<=10000,'Rubric weight must be between 0 and 10000');
   refs:=app_private.string_array(n->'prerequisiteNodeIds');
   perform app_private.ensure(refs <@ ids and not (n->>'id'=any(refs)),'Invalid rubric prerequisite');
   foreach k in array array['label','description','sufficientEvidenceDescription'] loop
     perform app_private.ensure(jsonb_typeof(n->k)='string' and length(n->>k)<=10000,'Invalid rubric text');
     if p_publish then perform app_private.ensure(length(btrim(n->>k))>0,'Complete every rubric node before publishing'); end if;
   end loop;
 end loop;
 perform app_private.ensure(not exists(
   with recursive reach(origin,id) as (
     select q->>'id',dep from jsonb_array_elements(p->'reasoningRubric') q
       cross join lateral jsonb_array_elements_text(q->'prerequisiteNodeIds') dep
     union
     select reach.origin,dep from reach join jsonb_array_elements(p->'reasoningRubric') q on q->>'id'=reach.id
       cross join lateral jsonb_array_elements_text(q->'prerequisiteNodeIds') dep
   ) select 1 from reach where origin=id
 ),'Rubric prerequisites contain a cycle');
 for x in select * from jsonb_array_elements(p->'acceptableAlternativeApproaches') loop
   refs:=app_private.string_array(x->'rubricNodeIds');
   perform app_private.ensure(refs <@ ids and jsonb_typeof(x->'description')='string','Invalid alternative approach');
 end loop;
 for x in select * from jsonb_array_elements(p->'misconceptions') loop
   refs:=app_private.string_array(x->'relatedRubricNodeIds');
   perform app_private.ensure(refs <@ ids and jsonb_typeof(x->'description')='string' and jsonb_typeof(x->'title')='string','Invalid misconception');
 end loop;
 for h in select * from jsonb_array_elements(p->'hintLadder') loop
   perform app_private.ensure(h->>'targetRubricNodeId'=any(ids),'Hint target does not exist');
   perform app_private.ensure(jsonb_typeof(h->'level')='number' and h->>'level' ~ '^[1-9][0-9]{0,2}$','Hint level must be an integer between 1 and 999');
   perform app_private.ensure(jsonb_typeof(h->'text')='string' and length(h->>'text')<=4000,'Hint text must fit within 4000 characters');
   if p_publish then perform app_private.ensure(length(btrim(h->>'text'))>0,'Every hint needs text'); end if;
 end loop;
 x:=p->'completionCriteria';
 perform app_private.ensure(jsonb_typeof(x)='object' and jsonb_typeof(x->'description')='string','Invalid completion criteria');
 refs:=app_private.string_array(x->'requiredNodeIds');
 perform app_private.ensure(refs <@ ids,'Completion criteria refer to missing rubric nodes');
 perform app_private.ensure(jsonb_typeof(x->'alternativeNodeGroups')='array','Alternative completion groups must be a list');
 for e in select * from jsonb_array_elements(x->'alternativeNodeGroups') loop
   refs:=app_private.string_array(e);
   perform app_private.ensure(cardinality(refs)>0 and refs <@ ids,'Invalid alternative completion group');
 end loop;
 for e in select * from jsonb_array_elements(p->'evaluationExamples') loop
   perform app_private.ensure(jsonb_typeof(e->'response')='string','Example response must be text');
   r:=e->'expectedResult';
   perform app_private.ensure(jsonb_typeof(r)='object' and jsonb_typeof(r->'needsEscalation')='boolean','Invalid expected evaluation');
   perform app_private.ensure(r->>'feedbackCategory'=any(array['acknowledgement','clarification_needed','reasoning_supported','reasoning_conflict']),'Invalid feedback category');
   perform app_private.ensure(jsonb_typeof(r->'escalationReason') in ('null','string'),'Invalid escalation reason');
   foreach k in array array['rubricAssessments','detectedMisconceptions','contradictions'] loop
     perform app_private.ensure(jsonb_typeof(r->k)='array','Expected assessments must be lists');
   end loop;
   for a in select * from jsonb_array_elements(r->'rubricAssessments') loop
     perform app_private.ensure(a->>'rubricNodeId'=any(ids) and a->>'status'=any(array['unseen','partial','confirmed','misconception','uncertain']),'Invalid expected rubric assessment');
   end loop;
   for a in select * from jsonb_array_elements(r->'detectedMisconceptions') loop
     perform app_private.ensure(a->>'misconceptionId'=any(mids),'Expected misconception does not exist');
   end loop;
   for a in select * from jsonb_array_elements(r->'contradictions') loop
     refs:=app_private.string_array(a->'rubricNodeIds');
     perform app_private.ensure(refs <@ ids and jsonb_typeof(a->'explanation')='string','Invalid expected contradiction');
   end loop;
   for a in select value from jsonb_array_elements((r->'rubricAssessments')||(r->'detectedMisconceptions')||(r->'contradictions')) loop
     perform app_private.ensure(jsonb_typeof(a->'evidence')='array','Evidence must be a list');
     for n in select * from jsonb_array_elements(a->'evidence') loop
       perform app_private.ensure(jsonb_typeof(n->'messageId')='string','Evidence requires a message ID');
       if n ? 'quote' then perform app_private.ensure(jsonb_typeof(n->'quote')='string','Invalid evidence quote'); end if;
     end loop;
   end loop;
 end loop;
 if p_publish then
   perform app_private.ensure(length(btrim(p->>'referenceAnswer'))>0,'Reference answer is missing');
   perform app_private.ensure(cardinality(ids)>0 and exists(select 1 from jsonb_array_elements(p->'reasoningRubric') q where (q->>'weight')::numeric>0),'A meaningful rubric with positive weight is required');
   perform app_private.ensure(length(btrim(x->>'description'))>0 and (jsonb_array_length(x->'requiredNodeIds')>0 or jsonb_array_length(x->'alternativeNodeGroups')>0),'Completion criteria are incomplete');
   perform app_private.ensure(jsonb_array_length(p->'hintLadder')>0,'At least one reviewed hint is required');
 end if;
end; $$;

create function app_private.check_content(p jsonb,p_publish boolean default false) returns void
language plpgsql set search_path='' as $$
declare ids text[]; k text; v jsonb; n jsonb;
begin
 perform app_private.ensure(jsonb_typeof(p)='object','Invalid public content');
 foreach k in array array['title','shortDescription','scenario','question'] loop
   perform app_private.ensure(jsonb_typeof(p->k)='string' and length(p->>k)<=30000,'Invalid public text');
 end loop;
 perform app_private.ensure(length(btrim(p->>'title')) between 1 and 500,'A draft title is required');
 perform app_private.ensure(p->>'questionType' in ('fundamental','applied') and p->>'difficulty' in ('beginner','intermediate','advanced'),'Invalid classification');
 perform app_private.check_competencies(app_private.string_array(p->'competencyIds'));
 perform app_private.string_array(p->'assumptions'); perform app_private.string_array(p->'tags');
 ids:=app_private.string_array(p->'categoryIds'); perform app_private.check_categories(ids);
 perform app_private.ensure(jsonb_typeof(p->'primaryCategoryId')='string','Invalid primary category');
 perform app_private.ensure(p->>'primaryCategoryId'='' or p->>'primaryCategoryId'=any(ids),'Primary category must be in the category list');
 v:=p->'visualization';
 perform app_private.ensure(v='null'::jsonb or jsonb_typeof(v)='object','Invalid visualization');
 if v<>'null'::jsonb then
   perform app_private.ensure(v->>'kind'='flow' and jsonb_typeof(v->'title')='string' and jsonb_typeof(v->'caption')='string' and jsonb_typeof(v->'nodes')='array','Only structured flow visualizations are supported');
   perform app_private.ensure(jsonb_array_length(v->'nodes') between 1 and 30,'A flow needs 1 to 30 nodes');
   perform app_private.ensure((select count(*)=count(distinct q->>'id') from jsonb_array_elements(v->'nodes') q),'Duplicate flow node IDs');
   for n in select * from jsonb_array_elements(v->'nodes') loop
     perform app_private.ensure(coalesce(n->>'id','') ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$' and jsonb_typeof(n->'label')='string' and jsonb_typeof(n->'detail')='string','Invalid flow node');
   end loop;
 end if;
 if p_publish then
   perform app_private.ensure(length(btrim(p->>'scenario'))>0 and length(btrim(p->>'question'))>0,'Scenario and question are required');
   perform app_private.ensure(p->>'primaryCategoryId'<>'' and cardinality(ids)>0,'A primary category is required');
   perform app_private.ensure(jsonb_array_length(p->'competencyIds')>0,'At least one competency is required');
 end if;
end; $$;

create function public.admin_save_source(p_id uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=app_private.require_admin(); result uuid; cats text[];
begin
 cats:=app_private.string_array(p_data->'suggestedCategoryIds'); perform app_private.check_categories(cats);
 perform app_private.ensure(length(p_data::text)<=100000,'Source is too large');
 if p_id is null then
   insert into public.sources(title,url,source_type,status,relevance_score,suggested_category_ids,notes,provenance_notes,usage_status,usage_notes,created_by)
   values(p_data->>'title',p_data->>'url',p_data->>'sourceType',p_data->>'status',(p_data->>'relevanceScore')::integer,cats,p_data->>'notes',p_data->>'provenanceNotes',p_data->>'usageStatus',p_data->>'usageNotes',actor) returning id into result;
 else
   update public.sources set title=p_data->>'title',url=p_data->>'url',source_type=p_data->>'sourceType',status=p_data->>'status',relevance_score=(p_data->>'relevanceScore')::integer,suggested_category_ids=cats,notes=p_data->>'notes',provenance_notes=p_data->>'provenanceNotes',usage_status=p_data->>'usageStatus',usage_notes=p_data->>'usageNotes' where id=p_id returning id into result;
   perform app_private.ensure(result is not null,'Source does not exist');
 end if;
 return result;
end; $$;
create function public.admin_save_candidate(p_id uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=app_private.require_admin(); result uuid; cats text[]; comps text[];
begin
 cats:=app_private.string_array(p_data->'suggestedCategoryIds'); perform app_private.check_categories(cats);
 comps:=app_private.string_array(p_data->'competencyIds'); perform app_private.check_competencies(comps);
 perform app_private.ensure(p_data->>'status' in ('pending_review','rejected'),'Invalid candidate status');
 perform app_private.ensure(length(p_data::text)<=100000,'Candidate is too large');
 if p_id is null then
   insert into public.question_candidates(source_id,suggested_title,suggested_scenario,suggested_question,suggested_category_ids,question_type,competency_ids,difficulty,candidate_score,status,notes,created_by)
   values(nullif(p_data->>'sourceId','')::uuid,p_data->>'suggestedTitle',p_data->>'suggestedScenario',p_data->>'suggestedQuestion',cats,p_data->>'questionType',comps,p_data->>'difficulty',(p_data->>'candidateScore')::integer,p_data->>'status',p_data->>'notes',actor) returning id into result;
 else
   update public.question_candidates set source_id=nullif(p_data->>'sourceId','')::uuid,suggested_title=p_data->>'suggestedTitle',suggested_scenario=p_data->>'suggestedScenario',suggested_question=p_data->>'suggestedQuestion',suggested_category_ids=cats,question_type=p_data->>'questionType',competency_ids=comps,difficulty=p_data->>'difficulty',candidate_score=(p_data->>'candidateScore')::integer,status=p_data->>'status',notes=p_data->>'notes' where id=p_id and converted_problem_id is null returning id into result;
   perform app_private.ensure(result is not null,'Converted candidates are read-only');
 end if;
 if nullif(p_data->>'sourceId','') is not null then
   update public.sources set status='candidate_created' where id=(p_data->>'sourceId')::uuid and status<>'rejected';
 end if;
 return result;
end; $$;
create function public.admin_save_category(p_id text,p_data jsonb) returns text
language plpgsql security definer set search_path='' as $$
declare actor uuid:=app_private.require_admin(); result text;
begin
 perform pg_catalog.pg_advisory_xact_lock(7312401);
 perform app_private.ensure(coalesce(p_data->>'slug','') ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(p_data->>'slug')<=150,'Use a lowercase hyphenated category slug');
 if p_id is null then
   result:='category-'||gen_random_uuid()::text;
   insert into public.categories(id,slug,name,parent_id,description,sort_order) values(result,p_data->>'slug',p_data->>'name',nullif(p_data->>'parentId',''),p_data->>'description',(p_data->>'sortOrder')::integer);
 else
   update public.categories set slug=p_data->>'slug',name=p_data->>'name',parent_id=nullif(p_data->>'parentId',''),description=p_data->>'description',sort_order=(p_data->>'sortOrder')::integer where id=p_id returning id into result;
   perform app_private.ensure(result is not null,'Category does not exist');
 end if;
 return result;
end; $$;
create function public.admin_delete_category(p_id text) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform app_private.require_admin(); perform pg_catalog.pg_advisory_xact_lock(7312401);
 perform app_private.ensure(not exists(select 1 from public.categories where parent_id=p_id)
   and not exists(select 1 from public.problem_categories where category_id=p_id)
   and not exists(select 1 from public.problem_version_categories where category_id=p_id)
   and not exists(select 1 from public.sources where p_id=any(suggested_category_ids))
   and not exists(select 1 from public.question_candidates where p_id=any(suggested_category_ids)), 'Cannot delete a category that is in use.');
 delete from public.categories where id=p_id;
 perform app_private.ensure(found,'Category does not exist');
end; $$;

create function app_private.store_package(p_version text,p jsonb) returns void
language sql set search_path='' as $$
 insert into public.problem_evaluation_packages(problem_version_id,reference_answer,reasoning_rubric,acceptable_alternative_approaches,misconceptions,hint_ladder,completion_criteria,evaluation_examples)
 values(p_version,p->>'referenceAnswer',p->'reasoningRubric',p->'acceptableAlternativeApproaches',p->'misconceptions',p->'hintLadder',p->'completionCriteria',p->'evaluationExamples')
 on conflict(problem_version_id) do update set reference_answer=excluded.reference_answer,reasoning_rubric=excluded.reasoning_rubric,acceptable_alternative_approaches=excluded.acceptable_alternative_approaches,misconceptions=excluded.misconceptions,hint_ladder=excluded.hint_ladder,completion_criteria=excluded.completion_criteria,evaluation_examples=excluded.evaluation_examples;
$$;
create function app_private.load_package(p_version text) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('referenceAnswer',reference_answer,'reasoningRubric',reasoning_rubric,'acceptableAlternativeApproaches',acceptable_alternative_approaches,'misconceptions',misconceptions,'hintLadder',hint_ladder,'completionCriteria',completion_criteria,'evaluationExamples',evaluation_examples) from public.problem_evaluation_packages where problem_version_id=p_version;
$$;
create function public.admin_create_problem(p_slug text,p_title text) returns text
language plpgsql security definer set search_path='' as $$
declare actor uuid:=app_private.require_admin(); pid text:='problem-'||gen_random_uuid()::text; vid text:='pv-'||gen_random_uuid()::text;
begin
 perform app_private.ensure(p_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(p_slug)<=200,'Use a lowercase hyphenated problem slug');
 perform app_private.ensure(length(btrim(p_title)) between 1 and 500,'A title is required');
 insert into public.problems(id,slug,created_by) values(pid,p_slug,actor);
 insert into public.problem_versions(id,problem_id,version_number,title,short_description,scenario,question,question_type,difficulty,origin,created_by)
 values(vid,pid,1,btrim(p_title),'','','','applied','intermediate','manual',actor);
 update public.problems set current_version_id=vid where id=pid;
 perform app_private.store_package(vid,app_private.empty_package());
 return pid;
end; $$;
create function public.admin_convert_candidate(p_id uuid,p_slug text) returns text
language plpgsql security definer set search_path='' as $$
declare c public.question_candidates; pid text; vid text;
begin
 perform app_private.require_admin();
 select * into c from public.question_candidates where id=p_id for update;
 perform app_private.ensure(found,'Candidate does not exist');
 if c.converted_problem_id is not null then return c.converted_problem_id; end if;
 perform app_private.ensure(c.status='pending_review','Only pending candidates can become drafts');
 pid:=public.admin_create_problem(p_slug,c.suggested_title);
 select current_version_id into vid from public.problems where id=pid;
 update public.problem_versions set scenario=c.suggested_scenario,question=c.suggested_question,question_type=c.question_type,difficulty=c.difficulty,competency_ids=c.competency_ids where id=vid;
 insert into public.problem_version_categories select vid,x,x=c.suggested_category_ids[1] from unnest(c.suggested_category_ids) x;
 if c.source_id is not null then insert into public.problem_sources values(vid,c.source_id,'inspired_by',c.notes); end if;
 update public.question_candidates set status='converted_to_problem',converted_problem_id=pid where id=p_id;
 return pid;
end; $$;

create function public.admin_save_problem_version(p_version_id text,p_revision integer,p_content jsonb,p_package jsonb,p_sources jsonb,p_status text default 'draft') returns integer
language plpgsql security definer set search_path='' as $$
declare v public.problem_versions; pid text; cats text[]; s jsonb;
begin
 perform app_private.require_admin();
 perform app_private.ensure(length(p_content::text)+length(p_package::text)+length(p_sources::text)<=500000,'Problem package is too large');
 select problem_id into pid from public.problem_versions where id=p_version_id;
 perform 1 from public.problems where id=pid for update;
 select * into v from public.problem_versions where id=p_version_id for update;
 perform app_private.ensure(found and v.published_at is null and v.status in ('draft','needs_review'),'Only draft versions can be edited');
 perform app_private.ensure(v.revision=p_revision,'This draft changed. Reload before saving.');
 perform app_private.ensure(p_status in ('draft','needs_review'),'Invalid draft status');
 perform app_private.check_content(p_content,false); perform app_private.check_package(p_package,false);
 cats:=app_private.string_array(p_content->'categoryIds');
 perform app_private.ensure(jsonb_typeof(p_sources)='array' and jsonb_array_length(p_sources)<=50,'Invalid source links');
 perform app_private.ensure((select count(*)=count(distinct q->>'sourceId') from jsonb_array_elements(p_sources) q),'Duplicate source links');
 update public.problem_versions set title=p_content->>'title',short_description=p_content->>'shortDescription',scenario=p_content->>'scenario',question=p_content->>'question',assumptions=app_private.string_array(p_content->'assumptions'),tags=app_private.string_array(p_content->'tags'),visualization=nullif(p_content->'visualization','null'::jsonb),question_type=p_content->>'questionType',competency_ids=app_private.string_array(p_content->'competencyIds'),difficulty=p_content->>'difficulty',status=p_status,revision=revision+1 where id=p_version_id;
 delete from public.problem_version_categories where problem_version_id=p_version_id;
 insert into public.problem_version_categories select p_version_id,x,x=p_content->>'primaryCategoryId' from unnest(cats) x;
 perform app_private.store_package(p_version_id,p_package);
 delete from public.problem_sources where problem_version_id=p_version_id;
 for s in select * from jsonb_array_elements(p_sources) loop
   insert into public.problem_sources values(p_version_id,(s->>'sourceId')::uuid,s->>'relationType',coalesce(s->>'attributionNote',''));
 end loop;
 update public.problems set status=case when status in ('draft','needs_review') then p_status else status end,updated_at=now() where id=pid;
 return v.revision+1;
end; $$;

create function public.admin_create_version(p_problem_id text) returns text
language plpgsql security definer set search_path='' as $$
declare actor uuid:=app_private.require_admin(); p public.problems; v public.problem_versions; vid text; num integer;
begin
 select * into p from public.problems where id=p_problem_id for update;
 perform app_private.ensure(found,'Problem does not exist');
 select id into vid from public.problem_versions where problem_id=p.id and status in ('draft','needs_review');
 if vid is not null then return vid; end if;
 select * into v from public.problem_versions where id=p.current_version_id;
 perform app_private.ensure(v.published_at is not null,'Only a published snapshot can be copied');
 select max(version_number)+1 into num from public.problem_versions where problem_id=p.id;
 vid:='pv-'||gen_random_uuid()::text;
 insert into public.problem_versions(id,problem_id,version_number,title,short_description,scenario,question,assumptions,visualization,question_type,competency_ids,difficulty,tags,origin,created_by)
 values(vid,p.id,num,v.title,v.short_description,v.scenario,v.question,v.assumptions,v.visualization,v.question_type,v.competency_ids,v.difficulty,v.tags,v.origin,actor);
 insert into public.problem_version_categories select vid,category_id,is_primary from public.problem_version_categories where problem_version_id=v.id;
 insert into public.problem_sources select vid,source_id,relation_type,attribution_note from public.problem_sources where problem_version_id=v.id;
 perform app_private.store_package(vid,coalesce(app_private.load_package(v.id),app_private.empty_package()));
 update public.problems set updated_at=now() where id=p.id;
 return vid;
end; $$;
create function public.admin_publish_version(p_version_id text,p_revision integer) returns text
language plpgsql security definer set search_path='' as $$
declare actor uuid:=app_private.require_admin(); v public.problem_versions; pid text; c jsonb; cats jsonb; primary_id text;
begin
 select problem_id into pid from public.problem_versions where id=p_version_id;
 perform 1 from public.problems where id=pid for update;
 select * into v from public.problem_versions where id=p_version_id for update;
 perform app_private.ensure(found and v.status in ('draft','needs_review') and v.published_at is null,'Only a draft version can be published');
 perform app_private.ensure(v.revision=p_revision,'This draft changed. Reload before publishing.');
 select coalesce(jsonb_agg(category_id),'[]'::jsonb),max(category_id) filter(where is_primary) into cats,primary_id from public.problem_version_categories where problem_version_id=v.id;
 c:=jsonb_build_object('title',v.title,'shortDescription',v.short_description,'scenario',v.scenario,'question',v.question,'assumptions',v.assumptions,'tags',v.tags,'visualization',v.visualization,'questionType',v.question_type,'difficulty',v.difficulty,'competencyIds',v.competency_ids,'categoryIds',cats,'primaryCategoryId',coalesce(primary_id,''));
 perform app_private.check_content(c,true);
 perform app_private.check_package(app_private.load_package(v.id),true);
 -- All validation precedes the atomic pointer/status/membership updates.
 update public.problem_versions set status='superseded' where problem_id=pid and status='published';
 update public.problem_versions set status='published',published_at=now(),published_by=actor,revision=revision+1 where id=v.id;
 delete from public.problem_categories where problem_id=pid;
 insert into public.problem_categories select pid,category_id,is_primary from public.problem_version_categories where problem_version_id=v.id;
 update public.problems set status='published',current_version_id=v.id,published_at=now() where id=pid;
 return pid;
end; $$;
create function public.admin_archive_problem(p_problem_id text) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform app_private.require_admin();
 update public.problems set status='archived' where id=p_problem_id;
 perform app_private.ensure(found,'Problem does not exist');
end; $$;

alter table public.hint_events add column request_id uuid;
create unique index hint_request_idempotency on public.hint_events(attempt_id,request_id) where request_id is not null;
drop function public.request_interview_hint(uuid);
create function public.request_interview_hint(p_attempt_id uuid,p_request_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.attempts; h jsonb;
begin
 select * into a from public.attempts where id=p_attempt_id and user_id=(select auth.uid()) for update;
 if not found then raise exception 'Attempt unavailable' using errcode='42501'; end if;
 perform app_private.ensure(p_request_id is not null,'A request ID is required');
 if exists(select 1 from public.hint_events where attempt_id=a.id and request_id=p_request_id) then return a.id; end if;
 perform app_private.ensure(a.status='in_progress','Interview is finished');
 -- M3 policy: ascending level, then configured array order. No evaluator or adaptive inference.
 select q.value into h from public.problem_evaluation_packages p
 cross join lateral jsonb_array_elements(p.hint_ladder) with ordinality q(value,position)
 where p.problem_version_id=a.problem_version_id and not exists(select 1 from public.hint_events e where e.attempt_id=a.id and e.hint_id=q.value->>'id')
 order by (q.value->>'level')::integer,q.position limit 1;
 if h is null then raise exception 'No more hints are available' using errcode='P0002'; end if;
 insert into public.hint_events(attempt_id,hint_id,hint_level,displayed_text,request_id) values(a.id,h->>'id',(h->>'level')::integer,h->>'text',p_request_id);
 insert into public.attempt_messages(attempt_id,role,content) values(a.id,'system_hint',h->>'text');
 update public.attempts set updated_at=now() where id=a.id;
 return a.id;
end; $$;
create function public.get_attempt_debrief(p_attempt_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.attempts; p public.problem_evaluation_packages;
begin
 select * into a from public.attempts where id=p_attempt_id and user_id=(select auth.uid()) and status='completed';
 if not found then raise exception 'Completed interview unavailable' using errcode='42501'; end if;
 select * into p from public.problem_evaluation_packages where problem_version_id=a.problem_version_id;
 if not found then raise exception 'Reference material unavailable' using errcode='P0002'; end if;
 return jsonb_build_object('problemVersionId',a.problem_version_id,'referenceAnswer',p.reference_answer,
   'keyIdeas',coalesce((select jsonb_agg(jsonb_build_object('label',x->>'label','description',x->>'description')) from jsonb_array_elements(p.reasoning_rubric) x),'[]'::jsonb),
   'alternativeApproaches',coalesce((select jsonb_agg(jsonb_build_object('id',x->>'id','title',coalesce(nullif(btrim(x->>'title'),''),'Alternative approach'),'description',x->>'description')) from jsonb_array_elements(p.acceptable_alternative_approaches) x),'[]'::jsonb));
end; $$;

-- Explicit function grants; app_private is not exposed by PostgREST.
revoke all on all functions in schema app_private from public,anon,authenticated;
grant execute on function app_private.is_admin() to anon,authenticated;
revoke all on function public.admin_save_source(uuid,jsonb),public.admin_save_candidate(uuid,jsonb),public.admin_save_category(text,jsonb),public.admin_delete_category(text),public.admin_create_problem(text,text),public.admin_convert_candidate(uuid,text),public.admin_save_problem_version(text,integer,jsonb,jsonb,jsonb,text),public.admin_create_version(text),public.admin_publish_version(text,integer),public.admin_archive_problem(text),public.request_interview_hint(uuid,uuid),public.get_attempt_debrief(uuid) from public,anon;
grant execute on function public.admin_save_source(uuid,jsonb),public.admin_save_candidate(uuid,jsonb),public.admin_save_category(text,jsonb),public.admin_delete_category(text),public.admin_create_problem(text,text),public.admin_convert_candidate(uuid,text),public.admin_save_problem_version(text,integer,jsonb,jsonb,jsonb,text),public.admin_create_version(text),public.admin_publish_version(text,integer),public.admin_archive_problem(text),public.request_interview_hint(uuid,uuid),public.get_attempt_debrief(uuid) to authenticated;
