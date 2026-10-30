-- Prepared recognition models and controlled vocabulary. Raw recordings and
-- administrator sessions retain their existing permissions and review flow.
create extension if not exists pg_net with schema extensions;

create table if not exists deafapp_private.recognition_catalog (
  class_id text primary key, category text not null, label text not null,
  comparison_key text not null unique, display_label text not null,
  category_title text not null, color text not null default '#a99bff', emoji text not null default '🤟',
  collection_enabled boolean not null default false,
  state text not null default 'collecting' check(state in ('collecting','testing','enabled','paused')),
  activation_scope text not null default 'prototype' check(activation_scope in ('prototype','evaluated')),
  minimum_originals integer not null default 3 check(minimum_originals between 3 and 100),
  recording_goal integer not null default 50 check(recording_goal between 3 and 2000),
  people_goal integer not null default 10 check(people_goal between 1 and 200),
  alias_of text references deafapp_private.recognition_catalog(class_id),
  forms jsonb not null default '{}'::jsonb check(jsonb_typeof(forms)='object' and octet_length(forms::text)<=2000),
  version integer not null default 0, updated_at timestamptz not null default now(),
  check(class_id=category||'/'||label),check(recording_goal>=minimum_originals),check(alias_of is null or alias_of<>class_id)
);
create table if not exists deafapp_private.recognition_features (
  source_id bigint primary key, source_version integer not null, source_path text not null,
  class_id text not null, feature jsonb, error text, retry_after timestamptz,
  expires_at timestamptz, updated_at timestamptz not null default now(),
  check(feature is null or jsonb_typeof(feature)='object' and octet_length(feature::text)<=150000)
);
create table if not exists deafapp_private.recognition_assignments (
  source_id bigint primary key, source_version integer not null,
  role text not null default 'train' check(role in ('train','evaluation')),
  person text, person_confirmed boolean not null default false,
  version integer not null default 0, updated_at timestamptz not null default now(),
  check(person is null or person ~ '^[A-Za-z0-9_-]{1,32}$'),check(not person_confirmed or person is not null)
);
create table if not exists deafapp_private.recognition_runtime (
  singleton boolean primary key default true check(singleton),
  catalog_revision bigint not null default 1, source_revision bigint not null default 1, model_revision bigint not null default 0,
  model_catalog_revision bigint, model_source_revision bigint,
  dirty boolean not null default true, lease_id uuid, lease_until timestamptz,
  retry_after timestamptz, packet jsonb, preview_packet jsonb, coverage jsonb not null default '[]'::jsonb,
  evaluation_pending jsonb not null default '[]'::jsonb,evaluation_accumulator jsonb not null default '{}'::jsonb,
  evaluation_total integer not null default 0,evaluation_done integer not null default 0,
  model_id text, model_expires_at timestamptz, updated_at timestamptz not null default now(),last_error text
);
insert into deafapp_private.recognition_runtime(singleton) values(true) on conflict do nothing;
alter table deafapp_private.recognition_catalog enable row level security;
alter table deafapp_private.recognition_features enable row level security;
alter table deafapp_private.recognition_assignments enable row level security;
alter table deafapp_private.recognition_runtime enable row level security;
revoke all on deafapp_private.recognition_catalog,deafapp_private.recognition_features,deafapp_private.recognition_assignments,deafapp_private.recognition_runtime from public,anon,authenticated;

create or replace function deafapp_private.recognition_entry(p_row deafapp_private.recognition_catalog)
returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('classId',p_row.class_id,'category',p_row.category,'label',p_row.label,'displayLabel',p_row.display_label,
   'categoryTitle',p_row.category_title,'color',p_row.color,'emoji',p_row.emoji,'collection',p_row.collection_enabled,'state',p_row.state,
   'activationScope',p_row.activation_scope,'minimum',p_row.minimum_originals,'recordingGoal',p_row.recording_goal,'peopleGoal',p_row.people_goal,
   'aliasOf',p_row.alias_of,'forms',p_row.forms,'version',p_row.version);
$$;
create or replace function deafapp_private.recognition_wake()
returns void language plpgsql security definer set search_path='' as $$
begin
  perform net.http_post(url:='https://didlffnluqqurelgnqdp.supabase.co/functions/v1/recognition-runtime',
    headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"action":"refresh"}'::jsonb,timeout_milliseconds:=5000);
exception when others then
  -- A later public revision check can restart preparation after a network outage.
  null;
end $$;
create or replace function deafapp_private.recognition_changed()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='grabaciones' then
   if tg_op='UPDATE' and (old.aprobada,old.moderation_version,old.archivo_path,old.categoria,old.label) is not distinct from
     (new.aprobada,new.moderation_version,new.archivo_path,new.categoria,new.label) then return new;end if;
   if tg_op='INSERT' and not coalesce(new.aprobada,false) then return new;end if;
   if tg_op='DELETE' and not coalesce(old.aprobada,false) then return old;end if;
   if tg_op='UPDATE' and not coalesce(old.aprobada,false) and not coalesce(new.aprobada,false) then return new;end if;
   if tg_op<>'INSERT' then delete from deafapp_private.recognition_features where source_id=old.id;end if;
   update deafapp_private.recognition_runtime set source_revision=source_revision+1,dirty=true,retry_after=null,updated_at=clock_timestamp() where singleton;
 else
   update deafapp_private.recognition_runtime set catalog_revision=catalog_revision+1,dirty=true,retry_after=null,updated_at=clock_timestamp() where singleton;
 end if;
 perform deafapp_private.recognition_wake();
 if tg_level='STATEMENT' then return null;end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
drop trigger if exists deafapp_recognition_review_changed on public.grabaciones;
create trigger deafapp_recognition_review_changed after insert or update or delete on public.grabaciones for each row execute function deafapp_private.recognition_changed();
drop trigger if exists deafapp_recognition_catalog_changed on deafapp_private.recognition_catalog;
create trigger deafapp_recognition_catalog_changed after insert or update on deafapp_private.recognition_catalog for each statement execute function deafapp_private.recognition_changed();
drop trigger if exists deafapp_recognition_assignment_changed on deafapp_private.recognition_assignments;
create trigger deafapp_recognition_assignment_changed after insert or update on deafapp_private.recognition_assignments for each statement execute function deafapp_private.recognition_changed();

create or replace function public.deafapp_recognition_revision()
returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('ok',true,'revision',catalog_revision||':'||source_revision||':'||model_revision,
   'ready',not dirty and packet is not null and (model_expires_at is null or model_expires_at>clock_timestamp()),
   'preparing',dirty or coalesce(model_expires_at<=clock_timestamp(),false),'modelId',model_id,
   'retryAt',retry_after) from deafapp_private.recognition_runtime where singleton;
$$;
create or replace function public.deafapp_recognition_manifest()
returns jsonb language sql security definer set search_path='' as $$
 select public.deafapp_recognition_revision()||jsonb_build_object('catalogue',
   (select coalesce(jsonb_agg(deafapp_private.recognition_entry(c) order by c.category,c.label),'[]'::jsonb)
    from deafapp_private.recognition_catalog c where c.collection_enabled or c.state='enabled'),
   'expiresAt',r.model_expires_at,'compressedBytes',r.packet->'compressedBytes')
 from deafapp_private.recognition_runtime r where singleton;
$$;
create or replace function public.deafapp_recognition_model(p_revision text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r deafapp_private.recognition_runtime;
begin
 select * into r from deafapp_private.recognition_runtime where singleton;
 if r.dirty or p_revision is distinct from r.catalog_revision||':'||r.source_revision||':'||r.model_revision or
   r.model_expires_at<=clock_timestamp() then raise exception 'Model changed; reload the manifest' using errcode='40001';end if;
 return jsonb_build_object('ok',true,'revision',p_revision,'packet',r.packet);
end $$;

create or replace function public.deafapp_admin_vocabulary_list(p_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform deafapp_private.require_admin(p_token);
 select jsonb_build_object('ok',true,'catalogue',(select coalesce(jsonb_agg(deafapp_private.recognition_entry(c) order by c.category,c.label),'[]'::jsonb) from deafapp_private.recognition_catalog c),
   'coverage',r.coverage,'dirty',r.dirty,'preparing',r.lease_until>clock_timestamp(),'lastError',r.last_error,
   'revision',r.catalog_revision||':'||r.source_revision||':'||r.model_revision,'modelId',r.model_id,
   'compressedBytes',r.packet->'compressedBytes','evaluationPending',r.evaluation_total-r.evaluation_done,'evaluationDone',r.evaluation_done,
   'updatedAt',r.updated_at) into result from deafapp_private.recognition_runtime r where singleton;
 return result;
end $$;
create or replace function public.deafapp_admin_vocabulary_save(p_token text,p_entry jsonb,p_version integer,p_ack_prototype boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare c deafapp_private.recognition_catalog;old_row deafapp_private.recognition_catalog;
 category text;label text;class_id text;key text;metric jsonb;r deafapp_private.recognition_runtime;target text;seen text[];v_forms jsonb;form record;
begin
 perform deafapp_private.require_admin(p_token);
 category:=p_entry->>'category';label:=normalize(lower(regexp_replace(trim(p_entry->>'label'),'\s+',' ','g')),NFC);
 class_id:=category||'/'||label;key:=category||'/'||translate(label,'áéíóúü','aeiouu');
 if category is null or category !~ '^[a-z][a-z0-9_]{0,39}$' or label is null or length(label) not between 1 and 80 or label ~ '[[:cntrl:]/<>]' or
   p_entry->>'classId' is distinct from class_id or coalesce(p_entry->>'state','') not in ('collecting','testing','enabled','paused') or
   coalesce(p_entry->>'activationScope','') not in ('prototype','evaluated') or
   coalesce(p_entry->>'color','') !~ '^#[A-Fa-f0-9]{6}$' or length(coalesce(p_entry->>'displayLabel','')) not between 1 and 100 or
   length(coalesce(p_entry->>'categoryTitle','')) not between 1 and 80 or length(coalesce(p_entry->>'emoji',''))>20 or
   (p_entry->>'minimum')::integer not between 3 and 100 or (p_entry->>'recordingGoal')::integer not between (p_entry->>'minimum')::integer and 2000 or
   (p_entry->>'peopleGoal')::integer not between 1 and 200 then raise exception 'Invalid catalogue entry' using errcode='22023';end if;
 v_forms:=coalesce(p_entry->'forms','{}'::jsonb);
 if jsonb_typeof(v_forms)<>'object' or octet_length(v_forms::text)>2000 then raise exception 'Invalid forms' using errcode='22023';end if;
 for form in select * from jsonb_each(v_forms) loop
   if form.key not in ('yo','tu','el','ella','usted','nosotros','ellos','ellas','ustedes','regular') or
     (form.key='regular' and jsonb_typeof(form.value)<>'boolean') or
     (form.key<>'regular' and (jsonb_typeof(form.value)<>'string' or length(form.value#>>'{}') not between 1 and 80)) then raise exception 'Invalid forms' using errcode='22023';end if;
 end loop;
 select * into old_row from deafapp_private.recognition_catalog where recognition_catalog.class_id=class_id for update;
 if old_row.class_id is null and p_version<>-1 or old_row.class_id is not null and old_row.version<>p_version then raise exception 'Catalogue changed' using errcode='40001';end if;
 if exists(select 1 from deafapp_private.recognition_catalog where comparison_key=key and recognition_catalog.class_id<>class_id) then raise exception 'Duplicate catalogue entry' using errcode='23505';end if;
 target:=nullif(p_entry->>'aliasOf','');seen:=array[class_id];
 while target is not null loop
   if target=any(seen) then raise exception 'Alias cycle' using errcode='22023';end if;seen:=seen||target;
   select alias_of into target from deafapp_private.recognition_catalog where recognition_catalog.class_id=target;
   if not found then raise exception 'Alias unavailable' using errcode='22023';end if;
 end loop;
 if p_entry->>'state'='enabled' and (old_row.state is distinct from 'enabled' or old_row.activation_scope is distinct from p_entry->>'activationScope') then
   select * into r from deafapp_private.recognition_runtime where singleton;
   select value into metric from jsonb_array_elements(r.coverage) where value->>'classId'=class_id;
   if r.dirty or metric is null or coalesce((metric->>'originals')::integer,0)<(p_entry->>'minimum')::integer then raise exception 'Prepare enough reviewed recordings before enabling' using errcode='22023';end if;
   if p_entry->>'activationScope'='prototype' and not coalesce(p_ack_prototype,false) then raise exception 'Acknowledge prototype scope' using errcode='22023';end if;
   if p_entry->>'activationScope'='evaluated' and (metric#>>'{evaluation,scope}' is distinct from 'different-confirmed-people' or
     coalesce((metric#>>'{evaluation,samples}')::integer,0)<5 or coalesce((metric#>>'{evaluation,people}')::integer,0)<2 or
     coalesce((metric->>'confirmedPeople')::integer,0)<3 or coalesce((metric#>>'{evaluation,recall}')::numeric,0)<.8 or coalesce((metric#>>'{evaluation,precision}')::numeric,0)<.8)
     then raise exception 'Independent evaluation is still pending' using errcode='22023';end if;
 end if;
 insert into deafapp_private.recognition_catalog(class_id,category,label,comparison_key,display_label,category_title,color,emoji,collection_enabled,state,activation_scope,minimum_originals,recording_goal,people_goal,alias_of,forms,version)
 values(class_id,category,label,key,p_entry->>'displayLabel',p_entry->>'categoryTitle',p_entry->>'color',coalesce(p_entry->>'emoji','🤟'),
   coalesce((p_entry->>'collection')::boolean,false),p_entry->>'state',p_entry->>'activationScope',(p_entry->>'minimum')::integer,
   (p_entry->>'recordingGoal')::integer,(p_entry->>'peopleGoal')::integer,nullif(p_entry->>'aliasOf',''),v_forms,coalesce(old_row.version,-1)+1)
 on conflict on constraint recognition_catalog_pkey do update set display_label=excluded.display_label,category_title=excluded.category_title,color=excluded.color,
   emoji=excluded.emoji,collection_enabled=excluded.collection_enabled,state=excluded.state,activation_scope=excluded.activation_scope,
   minimum_originals=excluded.minimum_originals,recording_goal=excluded.recording_goal,people_goal=excluded.people_goal,alias_of=excluded.alias_of,forms=excluded.forms,
   version=excluded.version,updated_at=clock_timestamp() returning * into c;
 return jsonb_build_object('ok',true,'entry',deafapp_private.recognition_entry(c));
end $$;

create or replace function public.deafapp_admin_vocabulary_samples(p_token text,p_class_id text,p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform deafapp_private.require_admin(p_token);
 if p_offset<0 or p_offset>100000 or not exists(select 1 from deafapp_private.recognition_catalog where class_id=p_class_id) then raise exception 'Invalid sample query' using errcode='22023';end if;
 select jsonb_build_object('ok',true,'total',(select count(*) from public.grabaciones where aprobada and categoria||'/'||label=p_class_id),
   'rows',(select coalesce(jsonb_agg(row_to_json(q)),'[]'::jsonb) from (
     select g.id::text as id,g.moderation_version as "sourceVersion",g.archivo_path as path,
       case when f.source_version=g.moderation_version and f.source_path=g.archivo_path and (f.expires_at is null or f.expires_at>clock_timestamp()) then f.feature is not null else false end as usable,
       f.error,case when a.source_version=g.moderation_version then a.role else 'train' end as role,
       case when a.source_version=g.moderation_version then a.person else null end as person,
       case when a.source_version=g.moderation_version then a.person_confirmed else false end as "personConfirmed",coalesce(a.version,-1) as "assignmentVersion"
     from public.grabaciones g left join deafapp_private.recognition_features f on f.source_id=g.id
     left join deafapp_private.recognition_assignments a on a.source_id=g.id
     where g.aprobada and g.categoria||'/'||g.label=p_class_id order by g.id offset p_offset limit 25) q)) into result;
 return result;
end $$;
create or replace function public.deafapp_admin_vocabulary_assign(p_token text,p_id bigint,p_source_version integer,p_version integer,p_role text,p_person text,p_confirmed boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare current_version integer;
begin
 perform deafapp_private.require_admin(p_token);
 if p_role not in ('train','evaluation') or p_person is not null and p_person !~ '^[A-Za-z0-9_-]{1,32}$' or p_confirmed and p_person is null then raise exception 'Invalid participant assignment' using errcode='22023';end if;
 if not exists(select 1 from public.grabaciones where id=p_id and aprobada and moderation_version=p_source_version) then raise exception 'Recording changed' using errcode='40001';end if;
 select version into current_version from deafapp_private.recognition_assignments where source_id=p_id for update;
 if coalesce(current_version,-1)<>p_version then raise exception 'Assignment changed' using errcode='40001';end if;
 insert into deafapp_private.recognition_assignments(source_id,source_version,role,person,person_confirmed,version)
 values(p_id,p_source_version,p_role,p_person,coalesce(p_confirmed,false),coalesce(current_version,-1)+1)
 on conflict(source_id) do update set source_version=excluded.source_version,role=excluded.role,person=excluded.person,person_confirmed=excluded.person_confirmed,version=excluded.version,updated_at=clock_timestamp();
 return jsonb_build_object('ok',true);
end $$;
create or replace function public.deafapp_admin_vocabulary_preview(p_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r deafapp_private.recognition_runtime;
begin
 perform deafapp_private.require_admin(p_token);select * into r from deafapp_private.recognition_runtime where singleton;
 if r.dirty or r.preview_packet is null or r.model_expires_at<=clock_timestamp() then raise exception 'Prepare the candidate first' using errcode='22023';end if;
 return jsonb_build_object('ok',true,'packet',r.packet,'enabledClasses',r.preview_packet->'enabledClasses','modelId',r.preview_packet->>'id',
   'catalogue',(select jsonb_agg(deafapp_private.recognition_entry(c)) from deafapp_private.recognition_catalog c));
end $$;

-- Edge-only job functions. No public client can submit model contents, reports,
-- feature vectors or a fabricated administrator token to these functions.
create or replace function public.deafapp_runtime_claim()
returns jsonb language plpgsql security definer set search_path='' as $$
declare r deafapp_private.recognition_runtime;job uuid;is_build boolean;
begin
 select * into r from deafapp_private.recognition_runtime where singleton for update;
 is_build:=r.dirty or coalesce(r.model_expires_at<=clock_timestamp(),false);
 if r.lease_until>clock_timestamp() or r.retry_after>clock_timestamp() or not is_build and jsonb_array_length(r.evaluation_pending)=0 then return jsonb_build_object('ok',true,'job',null);end if;
 job:=extensions.gen_random_uuid();
 update deafapp_private.recognition_runtime set lease_id=job,lease_until=clock_timestamp()+interval '90 seconds',dirty=is_build,last_error=null where singleton;
 return jsonb_build_object('ok',true,'job',job,'kind',case when is_build then 'build' else 'evaluation' end,'catalogRevision',r.catalog_revision,'sourceRevision',r.source_revision);
end $$;
create or replace function public.deafapp_runtime_inputs(p_job uuid,p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r deafapp_private.recognition_runtime;
begin
 select * into r from deafapp_private.recognition_runtime where singleton;
 if r.lease_id is distinct from p_job or r.lease_until<=clock_timestamp() or p_offset<0 then raise exception 'Job unavailable' using errcode='40001';end if;
 return jsonb_build_object('ok',true,'catalogRevision',r.catalog_revision,'sourceRevision',r.source_revision,
   'catalogue',case when p_offset=0 then (select jsonb_agg(deafapp_private.recognition_entry(c) order by c.class_id) from deafapp_private.recognition_catalog c) else null end,
   'total',(select count(*) from public.grabaciones g where g.aprobada),
   'rows',(select coalesce(jsonb_agg(row_to_json(q)),'[]'::jsonb) from (
     select g.id::text as id,g.categoria as category,g.label,g.archivo_path as path,g.moderation_version as version,
       case when f.source_version=g.moderation_version and f.source_path=g.archivo_path and (f.retry_after is null or f.retry_after>clock_timestamp()) then true else false end as cached,
       case when f.source_version=g.moderation_version and f.source_path=g.archivo_path then f.feature-'sequence' else null end as feature,
       f.error,coalesce(a.role,'train') as role,a.person,coalesce(a.person_confirmed,false) as "personConfirmed"
     from public.grabaciones g left join deafapp_private.recognition_features f on f.source_id=g.id
     left join deafapp_private.recognition_assignments a on a.source_id=g.id and a.source_version=g.moderation_version
     where g.aprobada order by g.id offset p_offset limit 50) q));
end $$;
create or replace function public.deafapp_runtime_features(p_job uuid,p_ids text[])
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if cardinality(p_ids)>100 or not exists(select 1 from deafapp_private.recognition_runtime where singleton and lease_id=p_job and lease_until>clock_timestamp()) then raise exception 'Job unavailable' using errcode='40001';end if;
 return jsonb_build_object('ok',true,'rows',(select coalesce(jsonb_agg(jsonb_build_object('id',g.id::text,'sequence',f.feature->'sequence')),'[]'::jsonb)
   from public.grabaciones g join deafapp_private.recognition_features f on f.source_id=g.id and f.source_version=g.moderation_version and f.source_path=g.archivo_path
   where g.aprobada and g.id::text=any(p_ids) and f.feature is not null and (f.expires_at is null or f.expires_at>clock_timestamp())));
end $$;
create or replace function public.deafapp_runtime_cache(p_job uuid,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from deafapp_private.recognition_runtime where singleton and lease_id=p_job and lease_until>clock_timestamp()) then raise exception 'Job unavailable' using errcode='40001';end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>16 or octet_length(p_rows::text)>3000000 then raise exception 'Cache batch too large' using errcode='22023';end if;
 insert into deafapp_private.recognition_features(source_id,source_version,source_path,class_id,feature,error,retry_after,expires_at)
 select (v->>'id')::bigint,(v->>'version')::integer,v->>'path',v->>'classId',nullif(v->'feature','null'::jsonb),v->>'error',
   case when v->>'error'='download-failed' then clock_timestamp()+interval '5 minutes' else null end,(v->>'expiresAt')::timestamptz
 from jsonb_array_elements(p_rows) v join public.grabaciones g on g.id=(v->>'id')::bigint and g.aprobada and g.moderation_version=(v->>'version')::integer and g.archivo_path=v->>'path'
 on conflict(source_id) do update set source_version=excluded.source_version,source_path=excluded.source_path,class_id=excluded.class_id,feature=excluded.feature,error=excluded.error,retry_after=excluded.retry_after,expires_at=excluded.expires_at,updated_at=clock_timestamp();
 return jsonb_build_object('ok',true);
end $$;
create or replace function public.deafapp_runtime_complete(p_job uuid,p_catalog_revision bigint,p_source_revision bigint,p_result jsonb default null,p_error text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r deafapp_private.recognition_runtime;again boolean:=false;
begin
 select * into r from deafapp_private.recognition_runtime where singleton for update;
 if r.lease_id is distinct from p_job then raise exception 'Job unavailable' using errcode='40001';end if;
 if p_error is not null then
   update deafapp_private.recognition_runtime set lease_id=null,lease_until=null,retry_after=clock_timestamp()+interval '30 seconds',last_error=left(p_error,300) where singleton;
 elsif p_result is null or r.catalog_revision<>p_catalog_revision or r.source_revision<>p_source_revision then
   update deafapp_private.recognition_runtime set lease_id=null,lease_until=null,dirty=true where singleton;again:=true;
 else
   if octet_length(p_result::text)>50000000 then raise exception 'Prepared model too large' using errcode='22023';end if;
   update deafapp_private.recognition_runtime set lease_id=null,lease_until=null,dirty=false,retry_after=null,last_error=null,
     packet=nullif(p_result->'packet','null'::jsonb),preview_packet=nullif(p_result->'previewPacket','null'::jsonb),coverage=coalesce(p_result->'coverage','[]'::jsonb),
     evaluation_pending=coalesce(p_result->'evaluationPlan','[]'::jsonb),evaluation_accumulator='{}'::jsonb,
     evaluation_total=jsonb_array_length(coalesce(p_result->'evaluationPlan','[]'::jsonb)),evaluation_done=0,
     model_id=p_result->>'modelId',model_expires_at=(p_result->>'expiresAt')::timestamptz,
     model_catalog_revision=p_catalog_revision,model_source_revision=p_source_revision,model_revision=model_revision+1,updated_at=clock_timestamp() where singleton;
   if jsonb_array_length(coalesce(p_result->'evaluationPlan','[]'::jsonb))>0 then again:=true;end if;
 end if;
 if again then perform deafapp_private.recognition_wake();end if;
 return jsonb_build_object('ok',true,'again',again);
end $$;

create or replace function public.deafapp_runtime_evaluation(p_job uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r deafapp_private.recognition_runtime;
begin
 select * into r from deafapp_private.recognition_runtime where singleton;
 if r.lease_id is distinct from p_job or r.lease_until<=clock_timestamp() or r.dirty then raise exception 'Evaluation changed' using errcode='40001';end if;
 return jsonb_build_object('ok',true,'packet',r.packet,'modelId',r.model_id,'enabledClasses',r.preview_packet->'evaluationEnabledClasses',
   'rows',(select coalesce(jsonb_agg(value order by ordinality),'[]'::jsonb) from jsonb_array_elements(r.evaluation_pending) with ordinality where ordinality<=5));
end $$;
create or replace function public.deafapp_runtime_evaluation_complete(p_job uuid,p_model_id text,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare r deafapp_private.recognition_runtime;acc jsonb;remaining jsonb;item jsonb;expected jsonb;actual text;predicted text;metric jsonb;n integer;position integer:=0;coverage jsonb;
begin
 select * into r from deafapp_private.recognition_runtime where singleton for update;
 n:=jsonb_array_length(p_rows);
 if r.lease_id is distinct from p_job or r.dirty or r.model_id is distinct from p_model_id or n not between 1 and 5 or n>jsonb_array_length(r.evaluation_pending) then raise exception 'Evaluation changed' using errcode='40001';end if;
 acc:=r.evaluation_accumulator;
 for item in select value from jsonb_array_elements(p_rows) loop
   expected:=r.evaluation_pending->position;position:=position+1;
   if item->>'id' is distinct from expected->>'id' then raise exception 'Unexpected evaluation sample' using errcode='22023';end if;
   actual:=expected->>'classId';predicted:=item->>'prediction';
   metric:=coalesce(acc->actual,'{"samples":0,"correct":0,"predicted":0}'::jsonb);
   metric:=metric||jsonb_build_object('samples',(metric->>'samples')::integer+1,'correct',(metric->>'correct')::integer+case when predicted=actual then 1 else 0 end);
   acc:=jsonb_set(acc,array[actual],metric,true);
   if predicted is not null then
     if not exists(select 1 from jsonb_array_elements(r.coverage) where value->>'classId'=predicted) then raise exception 'Unexpected predicted class' using errcode='22023';end if;
     metric:=coalesce(acc->predicted,'{"samples":0,"correct":0,"predicted":0}'::jsonb);
     acc:=jsonb_set(acc,array[predicted],metric||jsonb_build_object('predicted',(metric->>'predicted')::integer+1),true);
   end if;
 end loop;
 select coalesce(jsonb_agg(value order by ordinality),'[]'::jsonb) into remaining from jsonb_array_elements(r.evaluation_pending) with ordinality where ordinality>n;
 coverage:=r.coverage;
 if jsonb_array_length(remaining)=0 then
   select coalesce(jsonb_agg(value||jsonb_build_object('evaluation',(value->'evaluation')||jsonb_build_object(
     'samples',coalesce((acc->(value->>'classId')->>'samples')::integer,0),
     'correct',coalesce((acc->(value->>'classId')->>'correct')::integer,0),
     'predicted',coalesce((acc->(value->>'classId')->>'predicted')::integer,0),
     'recall',case when coalesce((acc->(value->>'classId')->>'samples')::numeric,0)>0 then (acc->(value->>'classId')->>'correct')::numeric/(acc->(value->>'classId')->>'samples')::numeric else null end,
     'precision',case when coalesce((acc->(value->>'classId')->>'samples')::numeric,0)>0 then case when coalesce((acc->(value->>'classId')->>'predicted')::numeric,0)>0 then (acc->(value->>'classId')->>'correct')::numeric/(acc->(value->>'classId')->>'predicted')::numeric else 0 end else null end,
     'scope',case when coalesce((acc->(value->>'classId')->>'samples')::integer,0)>0 then value#>>'{evaluation,expectedScope}' else 'pending' end))),'[]'::jsonb) into coverage from jsonb_array_elements(r.coverage);
 end if;
 update deafapp_private.recognition_runtime set lease_id=null,lease_until=null,evaluation_pending=remaining,evaluation_accumulator=acc,evaluation_done=evaluation_done+n,coverage=coverage,updated_at=clock_timestamp() where singleton;
 if jsonb_array_length(remaining)>0 then perform deafapp_private.recognition_wake();end if;
 return jsonb_build_object('ok',true,'remaining',jsonb_array_length(remaining));
end $$;

revoke all on function deafapp_private.recognition_entry(deafapp_private.recognition_catalog),deafapp_private.recognition_wake(),deafapp_private.recognition_changed() from public,anon,authenticated;
revoke all on function public.deafapp_runtime_claim(),public.deafapp_runtime_inputs(uuid,integer),public.deafapp_runtime_features(uuid,text[]),public.deafapp_runtime_cache(uuid,jsonb),public.deafapp_runtime_complete(uuid,bigint,bigint,jsonb,text),public.deafapp_runtime_evaluation(uuid),public.deafapp_runtime_evaluation_complete(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.deafapp_runtime_claim(),public.deafapp_runtime_inputs(uuid,integer),public.deafapp_runtime_features(uuid,text[]),public.deafapp_runtime_cache(uuid,jsonb),public.deafapp_runtime_complete(uuid,bigint,bigint,jsonb,text),public.deafapp_runtime_evaluation(uuid),public.deafapp_runtime_evaluation_complete(uuid,text,jsonb) to service_role;
revoke all on function public.deafapp_recognition_revision(),public.deafapp_recognition_manifest(),public.deafapp_recognition_model(text),public.deafapp_admin_vocabulary_list(text),public.deafapp_admin_vocabulary_save(text,jsonb,integer,boolean),public.deafapp_admin_vocabulary_samples(text,text,integer),public.deafapp_admin_vocabulary_assign(text,bigint,integer,integer,text,text,boolean),public.deafapp_admin_vocabulary_preview(text) from public;
grant execute on function public.deafapp_recognition_revision(),public.deafapp_recognition_manifest(),public.deafapp_recognition_model(text),public.deafapp_admin_vocabulary_list(text),public.deafapp_admin_vocabulary_save(text,jsonb,integer,boolean),public.deafapp_admin_vocabulary_samples(text,text,integer),public.deafapp_admin_vocabulary_assign(text,bigint,integer,integer,text,text,boolean),public.deafapp_admin_vocabulary_preview(text) to anon,authenticated;
notify pgrst,'reload schema';
