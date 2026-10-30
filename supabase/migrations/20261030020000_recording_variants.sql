-- Variant clips reference real recordings; images and original counters are not duplicated.
create table if not exists deafapp_private.recording_variant_batches (
 id uuid primary key default extensions.gen_random_uuid(), request_id uuid not null unique,
 class_id text not null references deafapp_private.recognition_catalog(class_id),
 quantity integer not null check(quantity in (50,100)), parent_ids bigint[] not null check(cardinality(parent_ids) between 1 and 3),
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 version integer not null default 0, created_at timestamptz not null default now(), reviewed_at timestamptz
);
create table if not exists deafapp_private.recording_variants (
 batch_id uuid not null references deafapp_private.recording_variant_batches(id) on delete cascade,
 variant_index integer not null check(variant_index between 1 and 100),
 parent_id bigint not null, source_version integer not null, source_path text not null,
 angle_degrees double precision not null check(abs(angle_degrees) between .01 and 3),
 primary key(batch_id,variant_index)
);
create index if not exists recording_variants_parent_idx on deafapp_private.recording_variants(parent_id);
alter table deafapp_private.recording_variant_batches enable row level security;
alter table deafapp_private.recording_variants enable row level security;
revoke all on deafapp_private.recording_variant_batches,deafapp_private.recording_variants from public,anon,authenticated;

create or replace function deafapp_private.variant_class(p_category text,p_label text)
returns text language sql stable security definer set search_path='' as $$
 with normalized as (select p_category||'/'||case when p_category='oraciones' and normalize(lower(regexp_replace(trim(replace(p_label,'_',' ')),'\s+',' ','g')),NFC)='yo bien'
 then 'estoy bien' else normalize(lower(regexp_replace(trim(replace(p_label,'_',' ')),'\s+',' ','g')),NFC) end as id)
 select coalesce((select c.class_id from deafapp_private.recognition_catalog c where c.comparison_key=translate(n.id,'áéíóúü','aeiouu')),n.id) from normalized n;
$$;
create or replace function deafapp_private.variant_batch(p_batch deafapp_private.recording_variant_batches)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p_batch.id,'classId',p_batch.class_id,'quantity',p_batch.quantity,'status',p_batch.status,
 'version',p_batch.version,'createdAt',p_batch.created_at,'reviewedAt',p_batch.reviewed_at,'displayLabel',c.display_label,'categoryTitle',c.category_title,
 'parents',(select coalesce(jsonb_agg(jsonb_build_object('id',g.id::text,'label',g.label,'category',g.categoria,'path',g.archivo_path,
 'version',g.moderation_version,'status',g.moderation_status,'usable',f.feature is not null and f.source_version=g.moderation_version and f.source_path=g.archivo_path and (f.expires_at is null or f.expires_at>now()),
 'durationMs',f.feature->'durationMs') order by array_position(p_batch.parent_ids,g.id)),'[]'::jsonb)
 from public.grabaciones g left join deafapp_private.recognition_features f on f.source_id=g.id where g.id=any(p_batch.parent_ids)),
 'parentCount',cardinality(p_batch.parent_ids)) from deafapp_private.recognition_catalog c where c.class_id=p_batch.class_id;
$$;

create or replace function deafapp_private.create_recording_variants(p_request_id uuid,p_items jsonb,p_quantity integer)
returns jsonb language plpgsql security definer set search_path='' as $$

#variable_conflict use_variable
declare b deafapp_private.recording_variant_batches;ids bigint[];source public.grabaciones;item jsonb;class_id text;category text;label text;n integer;ordinal integer;idx integer;angle numeric;
begin
 if p_request_id is null or p_quantity is null or p_quantity not in (50,100) or p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 3 then raise exception 'Invalid variant request' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 select array_agg((value->>'id')::bigint order by position) into ids from jsonb_array_elements(p_items) with ordinality as t(value,position);
 if (select count(distinct v) from unnest(ids) v)<>cardinality(ids) then raise exception 'Duplicate source' using errcode='22023';end if;
 select * into b from deafapp_private.recording_variant_batches where request_id=p_request_id;
 if found then
   if b.parent_ids<>ids or b.quantity<>p_quantity then raise exception 'Request changed' using errcode='40001';end if;
   return jsonb_build_object('ok',true,'batch',deafapp_private.variant_batch(b),'alreadyCreated',true);
 end if;
 for item in select value from jsonb_array_elements(p_items) loop
   select * into source from public.grabaciones where id=(item->>'id')::bigint for share;
   if not found or source.moderation_version is distinct from (item->>'version')::integer or source.moderation_status='rejected' then raise exception 'Recording changed' using errcode='40001';end if;
   if class_id is not null and class_id<>deafapp_private.variant_class(source.categoria,source.label) then raise exception 'Use recordings of the same sign' using errcode='22023';end if;
   class_id:=deafapp_private.variant_class(source.categoria,source.label);category:=source.categoria;label:=substring(class_id from length(category)+2);
 end loop;
 if category !~ '^[a-z][a-z0-9_]{0,39}$' or length(label) not between 1 and 80 or label ~ '[[:cntrl:]/<>]' then raise exception 'Invalid sign' using errcode='22023';end if;
 insert into deafapp_private.recognition_catalog(class_id,category,label,comparison_key,display_label,category_title)
 values(class_id,category,label,category||'/'||translate(label,'áéíóúü','aeiouu'),label,category) on conflict do nothing;
 insert into deafapp_private.recording_variant_batches(request_id,class_id,quantity,parent_ids) values(p_request_id,class_id,p_quantity,ids) returning * into b;
 n:=cardinality(ids);
 for idx in 0..p_quantity-1 loop
   ordinal:=idx/n;
   angle:=round((case when ordinal%2=0 then 1 else -1 end)*(.15+(floor(ordinal::numeric/2)+1)/(ceil(p_quantity::numeric/n/2)+1)*2.85),6);
   select * into source from public.grabaciones where id=ids[1+idx%n];
   insert into deafapp_private.recording_variants(batch_id,variant_index,parent_id,source_version,source_path,angle_degrees)
   values(b.id,idx+1,source.id,source.moderation_version,source.archivo_path,angle);
 end loop;
 return jsonb_build_object('ok',true,'batch',deafapp_private.variant_batch(b),'alreadyCreated',false);
end $$;

create or replace function public.deafapp_admin_variant_list(p_token text,p_status text default 'pending',p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform deafapp_private.require_admin(p_token);
 if p_status is null or p_offset is null or p_status not in ('all','pending','approved','rejected') or p_offset<0 or p_offset>100000 then raise exception 'Invalid filter' using errcode='22023';end if;
 return jsonb_build_object('ok',true,'total',(select count(*) from deafapp_private.recording_variant_batches where p_status='all' or status=p_status),
 'pending',(select count(*) from deafapp_private.recording_variant_batches where status='pending'),
 'rows',(select coalesce(jsonb_agg(q.value),'[]'::jsonb) from
 (select deafapp_private.variant_batch(b) as value from deafapp_private.recording_variant_batches b where p_status='all' or status=p_status order by created_at desc,id offset p_offset limit 25) q));
end $$;
create or replace function public.deafapp_admin_variant_detail(p_token text,p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare b deafapp_private.recording_variant_batches;
begin
 perform deafapp_private.require_admin(p_token);select * into b from deafapp_private.recording_variant_batches where id=p_id;
 if not found then raise exception 'Batch unavailable' using errcode='22023';end if;
 return jsonb_build_object('ok',true,'batch',deafapp_private.variant_batch(b),
 'variants',(select jsonb_agg(jsonb_build_object('index',variant_index,'parentId',parent_id::text,'angleDegrees',angle_degrees,'preservesTiming',true,'transform','camera-roll-v1') order by variant_index)
 from deafapp_private.recording_variants where batch_id=b.id));
end $$;
create or replace function deafapp_private.review_recording_variants(p_id uuid,p_version integer,p_status text,p_parents jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare b deafapp_private.recording_variant_batches;g public.grabaciones;item jsonb;
begin
 select * into b from deafapp_private.recording_variant_batches where id=p_id for update;
 if not found or b.version is distinct from p_version then raise exception 'Batch changed' using errcode='40001';end if;
 if p_status is null or p_status not in ('pending','approved','rejected') then raise exception 'Invalid review' using errcode='22023';end if;
 if p_status='approved' then
   if p_parents is null or jsonb_typeof(p_parents)<>'array' or jsonb_array_length(p_parents)<>cardinality(b.parent_ids) or
     (select count(distinct value->>'id') from jsonb_array_elements(p_parents))<>cardinality(b.parent_ids) then raise exception 'Review every original' using errcode='22023';end if;
   for item in select value from jsonb_array_elements(p_parents) loop
     select * into g from public.grabaciones where id=(item->>'id')::bigint and id=any(b.parent_ids) for share;
     if not found or not g.aprobada or g.moderation_status<>'approved' or g.moderation_version is distinct from (item->>'version')::integer or
       deafapp_private.variant_class(g.categoria,g.label)<>b.class_id then raise exception 'Approve and recheck originals first' using errcode='40001';end if;
     update deafapp_private.recording_variants set source_version=g.moderation_version,source_path=g.archivo_path where batch_id=b.id and parent_id=g.id;
   end loop;
 end if;
 update deafapp_private.recording_variant_batches set status=p_status,version=version+1,reviewed_at=clock_timestamp() where id=b.id returning * into b;
 return jsonb_build_object('ok',true,'batch',deafapp_private.variant_batch(b));
end $$;

create or replace function public.deafapp_admin_variant_create(p_token text,p_request_id uuid,p_items jsonb,p_quantity integer)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform deafapp_private.require_admin(p_token);
 return deafapp_private.create_recording_variants(p_request_id,p_items,p_quantity);
end $$;
create or replace function public.deafapp_admin_variant_review(p_token text,p_id uuid,p_version integer,p_status text,p_parents jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform deafapp_private.require_admin(p_token);
 return deafapp_private.review_recording_variants(p_id,p_version,p_status,p_parents);
end $$;
revoke all on function deafapp_private.create_recording_variants(uuid,jsonb,integer),deafapp_private.review_recording_variants(uuid,integer,text,jsonb) from public,anon,authenticated;

create or replace function deafapp_private.variants_changed()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='grabaciones' then
   if tg_op='UPDATE' and (old.aprobada,old.moderation_status,old.moderation_version,old.archivo_path,old.categoria,old.label) is not distinct from
    (new.aprobada,new.moderation_status,new.moderation_version,new.archivo_path,new.categoria,new.label) then return new;end if;
   update deafapp_private.recording_variant_batches set status='pending',version=version+1,reviewed_at=null where status='approved'
    and (case when tg_op='DELETE' then old.id else new.id end)=any(parent_ids);
 else
   if old.status='approved' or new.status='approved' then
     update deafapp_private.recognition_runtime set catalog_revision=catalog_revision+1,dirty=true,retry_after=null,updated_at=clock_timestamp() where singleton;
     perform deafapp_private.recognition_wake();
   end if;
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
drop trigger if exists deafapp_variants_source_changed on public.grabaciones;
create trigger deafapp_variants_source_changed after update or delete on public.grabaciones for each row execute function deafapp_private.variants_changed();
drop trigger if exists deafapp_variants_review_changed on deafapp_private.recording_variant_batches;
create trigger deafapp_variants_review_changed after update on deafapp_private.recording_variant_batches for each row execute function deafapp_private.variants_changed();

create or replace function public.deafapp_runtime_variants(p_job uuid,p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if p_offset<0 or not exists(select 1 from deafapp_private.recognition_runtime where singleton and lease_id=p_job and lease_until>clock_timestamp()) then raise exception 'Job unavailable' using errcode='40001';end if;
 return jsonb_build_object('ok',true,'rows',(select coalesce(jsonb_agg(row_to_json(q)),'[]'::jsonb) from (
 select distinct on(v.parent_id,sign(v.angle_degrees)) v.parent_id::text as "parentId",f.feature->>'hash' as "parentHash",b.class_id as "classId",
 v.angle_degrees as "angleDegrees",b.id::text as "batchId",v.variant_index as "index",b.quantity as "batchQuantity"
 from deafapp_private.recording_variants v join deafapp_private.recording_variant_batches b on b.id=v.batch_id and b.status='approved'
 join public.grabaciones g on g.id=v.parent_id and g.aprobada and g.moderation_status='approved' and g.moderation_version=v.source_version and g.archivo_path=v.source_path
 join deafapp_private.recognition_features f on f.source_id=g.id and f.source_version=g.moderation_version and f.source_path=g.archivo_path and f.feature is not null
 where f.expires_at is null or f.expires_at>clock_timestamp()
 order by v.parent_id,sign(v.angle_degrees),abs(abs(v.angle_degrees)-1.5),b.created_at,v.variant_index offset p_offset limit 500) q));
end $$;
revoke all on function deafapp_private.variant_class(text,text),deafapp_private.variant_batch(deafapp_private.recording_variant_batches),deafapp_private.variants_changed() from public,anon,authenticated;
revoke all on function public.deafapp_runtime_variants(uuid,integer) from public,anon,authenticated;
grant execute on function public.deafapp_runtime_variants(uuid,integer) to service_role;
grant execute on function public.deafapp_admin_variant_create(text,uuid,jsonb,integer),public.deafapp_admin_variant_list(text,text,integer),
 public.deafapp_admin_variant_detail(text,uuid),public.deafapp_admin_variant_review(text,uuid,integer,text,jsonb) to anon,authenticated;
notify pgrst,'reload schema';
