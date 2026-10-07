-- Remove the retired Core/Advanced classification; difficulty values are unchanged.
-- Only the two question_type columns are discarded. No problem/candidate/version,
-- evaluation package or attempt row is deleted, rewritten or repinned.
-- Previously applied migrations remain intact. Apply with the matching application code.
-- One statement preserves atomicity in the GitHub/Supabase migration runner.
do $remove_question_type$
begin
lock table public.problems, public.problem_versions, public.question_candidates in access exclusive mode;

-- CREATE OR REPLACE preserves existing grants. Role checks, validation, version
-- locks and atomic publication stay the same; no RPC accepts a question type.
create or replace function app_private.check_content(p jsonb,p_publish boolean default false) returns void
language plpgsql set search_path='' as $$
declare ids text[]; k text; v jsonb; n jsonb;
begin
 perform app_private.ensure(jsonb_typeof(p)='object','Invalid public content');
 foreach k in array array['title','shortDescription','scenario','question'] loop
   perform app_private.ensure(jsonb_typeof(p->k)='string' and length(p->>k)<=30000,'Invalid public text');
 end loop;
 perform app_private.ensure(length(btrim(p->>'title')) between 1 and 500,'A draft title is required');
 perform app_private.ensure(p->>'difficulty' in ('beginner','intermediate','advanced'),'Invalid difficulty');
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

create or replace function public.admin_save_candidate(p_id uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=app_private.require_admin(); result uuid; cats text[]; comps text[];
begin
 cats:=app_private.string_array(p_data->'suggestedCategoryIds'); perform app_private.check_categories(cats);
 comps:=app_private.string_array(p_data->'competencyIds'); perform app_private.check_competencies(comps);
 perform app_private.ensure(p_data->>'status' in ('pending_review','rejected'),'Invalid candidate status');
 perform app_private.ensure(length(p_data::text)<=100000,'Candidate is too large');
 if p_id is null then
   insert into public.question_candidates(source_id,suggested_title,suggested_scenario,suggested_question,suggested_category_ids,competency_ids,difficulty,candidate_score,status,notes,created_by)
   values(nullif(p_data->>'sourceId','')::uuid,p_data->>'suggestedTitle',p_data->>'suggestedScenario',p_data->>'suggestedQuestion',cats,comps,p_data->>'difficulty',(p_data->>'candidateScore')::integer,p_data->>'status',p_data->>'notes',actor) returning id into result;
 else
   update public.question_candidates set source_id=nullif(p_data->>'sourceId','')::uuid,suggested_title=p_data->>'suggestedTitle',suggested_scenario=p_data->>'suggestedScenario',suggested_question=p_data->>'suggestedQuestion',suggested_category_ids=cats,competency_ids=comps,difficulty=p_data->>'difficulty',candidate_score=(p_data->>'candidateScore')::integer,status=p_data->>'status',notes=p_data->>'notes' where id=p_id and converted_problem_id is null returning id into result;
   perform app_private.ensure(result is not null,'Converted candidates are read-only');
 end if;
 if nullif(p_data->>'sourceId','') is not null then
   update public.sources set status='candidate_created' where id=(p_data->>'sourceId')::uuid and status<>'rejected';
 end if;
 return result;
end; $$;

create or replace function public.admin_create_problem(p_slug text,p_title text) returns text
language plpgsql security definer set search_path='' as $$
declare actor uuid:=app_private.require_admin(); pid text:='problem-'||gen_random_uuid()::text; vid text:='pv-'||gen_random_uuid()::text;
begin
 perform app_private.ensure(p_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(p_slug)<=200,'Use a lowercase hyphenated problem slug');
 perform app_private.ensure(length(btrim(p_title)) between 1 and 500,'A title is required');
 insert into public.problems(id,slug,created_by) values(pid,p_slug,actor);
 insert into public.problem_versions(id,problem_id,version_number,title,short_description,scenario,question,difficulty,origin,created_by)
 values(vid,pid,1,btrim(p_title),'','','','intermediate','manual',actor);
 update public.problems set current_version_id=vid where id=pid;
 perform app_private.store_package(vid,app_private.empty_package());
 return pid;
end; $$;

create or replace function public.admin_convert_candidate(p_id uuid,p_slug text) returns text
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
 update public.problem_versions set scenario=c.suggested_scenario,question=c.suggested_question,difficulty=c.difficulty,competency_ids=c.competency_ids where id=vid;
 insert into public.problem_version_categories select vid,x,x=c.suggested_category_ids[1] from unnest(c.suggested_category_ids) x;
 if c.source_id is not null then insert into public.problem_sources values(vid,c.source_id,'inspired_by',c.notes); end if;
 update public.question_candidates set status='converted_to_problem',converted_problem_id=pid where id=p_id;
 return pid;
end; $$;

create or replace function public.admin_save_problem_version(p_version_id text,p_revision integer,p_content jsonb,p_package jsonb,p_sources jsonb,p_status text default 'draft') returns integer
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
 update public.problem_versions set title=p_content->>'title',short_description=p_content->>'shortDescription',scenario=p_content->>'scenario',question=p_content->>'question',assumptions=app_private.string_array(p_content->'assumptions'),tags=app_private.string_array(p_content->'tags'),visualization=nullif(p_content->'visualization','null'::jsonb),competency_ids=app_private.string_array(p_content->'competencyIds'),difficulty=p_content->>'difficulty',status=p_status,revision=revision+1 where id=p_version_id;
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

create or replace function public.admin_create_version(p_problem_id text) returns text
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
 insert into public.problem_versions(id,problem_id,version_number,title,short_description,scenario,question,assumptions,visualization,competency_ids,difficulty,tags,origin,created_by)
 values(vid,p.id,num,v.title,v.short_description,v.scenario,v.question,v.assumptions,v.visualization,v.competency_ids,v.difficulty,v.tags,v.origin,actor);
 insert into public.problem_version_categories select vid,category_id,is_primary from public.problem_version_categories where problem_version_id=v.id;
 insert into public.problem_sources select vid,source_id,relation_type,attribution_note from public.problem_sources where problem_version_id=v.id;
 perform app_private.store_package(vid,coalesce(app_private.load_package(v.id),app_private.empty_package()));
 update public.problems set updated_at=now() where id=p.id;
 return vid;
end; $$;

create or replace function public.admin_publish_version(p_version_id text,p_revision integer) returns text
language plpgsql security definer set search_path='' as $$
declare actor uuid:=app_private.require_admin(); v public.problem_versions; pid text; c jsonb; cats jsonb; primary_id text;
begin
 select problem_id into pid from public.problem_versions where id=p_version_id;
 perform 1 from public.problems where id=pid for update;
 select * into v from public.problem_versions where id=p_version_id for update;
 perform app_private.ensure(found and v.status in ('draft','needs_review') and v.published_at is null,'Only a draft version can be published');
 perform app_private.ensure(v.revision=p_revision,'This draft changed. Reload before publishing.');
 select coalesce(jsonb_agg(category_id),'[]'::jsonb),max(category_id) filter(where is_primary) into cats,primary_id from public.problem_version_categories where problem_version_id=v.id;
 c:=jsonb_build_object('title',v.title,'shortDescription',v.short_description,'scenario',v.scenario,'question',v.question,'assumptions',v.assumptions,'tags',v.tags,'visualization',v.visualization,'difficulty',v.difficulty,'competencyIds',v.competency_ids,'categoryIds',cats,'primaryCategoryId',coalesce(primary_id,''));
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

-- No CASCADE: unexpected external dependencies must fail rather than be removed.
alter table public.problem_versions drop column question_type;
alter table public.question_candidates drop column question_type;
notify pgrst, 'reload schema';
end;
$remove_question_type$;
