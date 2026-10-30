-- Variants follow the reviewed original. Explicit batch decisions remain independent.
alter table deafapp_private.recording_variant_batches add column if not exists inherit_approval boolean not null default false;

create or replace function deafapp_private.initialize_variant_approval()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 new.inherit_approval:=true;
 if (select count(*) from public.grabaciones g where g.id=any(new.parent_ids) and g.aprobada and g.moderation_status='approved'
  and deafapp_private.variant_class(g.categoria,g.label)=new.class_id)=cardinality(new.parent_ids) then
   new.status:='approved';new.reviewed_at:=clock_timestamp();
 end if;
 return new;
end $$;
drop trigger if exists deafapp_variants_initialize_approval on deafapp_private.recording_variant_batches;
create trigger deafapp_variants_initialize_approval before insert on deafapp_private.recording_variant_batches
 for each row execute function deafapp_private.initialize_variant_approval();

create or replace function deafapp_private.inherit_variant_approval(p_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare b deafapp_private.recording_variant_batches;g public.grabaciones;n integer:=0;
begin
 select * into b from deafapp_private.recording_variant_batches where id=p_id for update;
 if not found or b.status<>'pending' or not b.inherit_approval then return false;end if;
 if (select count(*) from deafapp_private.recording_variants where batch_id=b.id)<>b.quantity then return false;end if;
 for g in select * from public.grabaciones where id=any(b.parent_ids) order by id for share loop
   if not g.aprobada or g.moderation_status<>'approved' or deafapp_private.variant_class(g.categoria,g.label)<>b.class_id or
    exists(select 1 from deafapp_private.recording_variants v where v.batch_id=b.id and v.parent_id=g.id and v.source_path<>g.archivo_path) then return false;end if;
   n:=n+1;
 end loop;
 if n<>cardinality(b.parent_ids) then return false;end if;
 update deafapp_private.recording_variants v set source_version=source_row.moderation_version
 from public.grabaciones source_row where v.batch_id=b.id and v.parent_id=source_row.id;
 update deafapp_private.recording_variant_batches set status='approved',version=version+1,reviewed_at=clock_timestamp() where id=b.id;
 return true;
end $$;

create or replace function deafapp_private.variants_changed()
returns trigger language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 if tg_table_name='grabaciones' then
   if tg_op='UPDATE' and (old.aprobada,old.moderation_status,old.moderation_version,old.archivo_path,old.categoria,old.label) is not distinct from
    (new.aprobada,new.moderation_status,new.moderation_version,new.archivo_path,new.categoria,new.label) then return new;end if;
   update deafapp_private.recording_variant_batches set status='pending',version=version+1,reviewed_at=null where status='approved'
    and (case when tg_op='DELETE' then old.id else new.id end)=any(parent_ids);
   if tg_op='UPDATE' and new.aprobada and new.moderation_status='approved' then
     for target in select id from deafapp_private.recording_variant_batches where status='pending' and inherit_approval and new.id=any(parent_ids) order by id loop
       perform deafapp_private.inherit_variant_approval(target);
     end loop;
   end if;
 else
   if new.status='approved' or tg_op='UPDATE' and old.status='approved' then
     update deafapp_private.recognition_runtime set catalog_revision=catalog_revision+1,dirty=true,retry_after=null,updated_at=clock_timestamp() where singleton;
     perform deafapp_private.recognition_wake();
   end if;
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
drop trigger if exists deafapp_variants_review_changed on deafapp_private.recording_variant_batches;
create trigger deafapp_variants_review_changed after insert or update on deafapp_private.recording_variant_batches
 for each row execute function deafapp_private.variants_changed();

create or replace function deafapp_private.variant_batch(p_batch deafapp_private.recording_variant_batches)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p_batch.id,'classId',p_batch.class_id,'quantity',p_batch.quantity,'status',p_batch.status,
 'version',p_batch.version,'inheritApproval',p_batch.inherit_approval,'createdAt',p_batch.created_at,'reviewedAt',p_batch.reviewed_at,'displayLabel',c.display_label,'categoryTitle',c.category_title,
 'parents',(select coalesce(jsonb_agg(jsonb_build_object('id',g.id::text,'label',g.label,'category',g.categoria,'path',g.archivo_path,
 'version',g.moderation_version,'status',g.moderation_status,'usable',f.feature is not null and f.source_version=g.moderation_version and f.source_path=g.archivo_path and (f.expires_at is null or f.expires_at>now()),
 'durationMs',f.feature->'durationMs') order by array_position(p_batch.parent_ids,g.id)),'[]'::jsonb)
 from public.grabaciones g left join deafapp_private.recognition_features f on f.source_id=g.id where g.id=any(p_batch.parent_ids)),
 'parentCount',cardinality(p_batch.parent_ids)) from deafapp_private.recognition_catalog c where c.class_id=p_batch.class_id;
$$;

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
 update deafapp_private.recording_variant_batches set inherit_approval=false,status=p_status,version=version+1,reviewed_at=clock_timestamp() where id=b.id returning * into b;
 return jsonb_build_object('ok',true,'batch',deafapp_private.variant_batch(b));
end $$;

create or replace function deafapp_private.list_recordings(p_token text,p_status text,p_query text,p_offset integer,p_limit integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_rows jsonb; v_counts jsonb; v_total bigint;
begin
  perform deafapp_private.require_admin(p_token);
  if p_status is null or p_status not in ('pending','approved','rejected','all') or p_offset is null or p_offset<0 or p_offset>1000000
    or p_limit is null or p_limit<1 or p_limit>50 or length(coalesce(p_query,''))>120 then
    raise exception using errcode='22023',message='INVALID_FILTER';
  end if;
  select jsonb_build_object('pending',count(*) filter(where moderation_status='pending'),
    'approved',count(*) filter(where moderation_status='approved'),'rejected',count(*) filter(where moderation_status='rejected'))
    into v_counts from public.grabaciones;
  select count(*) into v_total from public.grabaciones where (p_status='all' or moderation_status=p_status)
    and (coalesce(p_query,'')='' or strpos(lower(coalesce(label,'')||' '||coalesce(categoria,'')),lower(p_query))>0);
  select coalesce(jsonb_agg(jsonb_build_object('id',id::text,'label',label,'category',categoria,'path',archivo_path,
    'status',moderation_status,'version',moderation_version,'createdAt',timestamp) order by id desc),'[]'::jsonb) into v_rows
    from (select * from public.grabaciones where (p_status='all' or moderation_status=p_status)
      and (coalesce(p_query,'')='' or strpos(lower(coalesce(label,'')||' '||coalesce(categoria,'')),lower(p_query))>0)
      order by id desc offset p_offset limit p_limit) r;
  return jsonb_build_object('ok',true,'rows',v_rows,'counts',v_counts,'total',v_total,'variantCounts',(select jsonb_build_object('pending',coalesce(sum(quantity) filter(where status='pending'),0),'approved',coalesce(sum(quantity) filter(where status='approved'),0),'rejected',coalesce(sum(quantity) filter(where status='rejected'),0)) from deafapp_private.recording_variant_batches));
end $$;

drop function if exists public.deafapp_admin_variant_list(text,text,integer);
create or replace function public.deafapp_admin_variant_list(p_token text,p_status text default 'pending',p_offset integer default 0,p_query text default '',p_limit integer default 25)
returns jsonb language plpgsql security definer set search_path='' as $$
declare total bigint;quantity bigint;items jsonb;
begin
 perform deafapp_private.require_admin(p_token);
 if p_status is null or p_offset is null or p_limit is null or p_status not in ('all','pending','approved','rejected') or p_offset<0 or p_offset>100000
  or p_limit not in (5,25) or length(coalesce(p_query,''))>120 then raise exception 'Invalid filter' using errcode='22023';end if;
 select count(*),coalesce(sum(b.quantity),0) into total,quantity from deafapp_private.recording_variant_batches b
 join deafapp_private.recognition_catalog c on c.class_id=b.class_id where (p_status='all' or b.status=p_status)
 and strpos(lower(c.display_label||' '||c.category_title||' '||b.class_id),lower(coalesce(p_query,'')))>0;
 select coalesce(jsonb_agg(q.value),'[]'::jsonb) into items from (
  select deafapp_private.variant_batch(b) as value from deafapp_private.recording_variant_batches b
  join deafapp_private.recognition_catalog c on c.class_id=b.class_id where (p_status='all' or b.status=p_status)
  and strpos(lower(c.display_label||' '||c.category_title||' '||b.class_id),lower(coalesce(p_query,'')))>0
  order by b.created_at desc,b.id offset p_offset limit p_limit) q;
 return jsonb_build_object('ok',true,'total',total,'totalVariants',quantity,'rows',items,
 'pending',(select count(*) from deafapp_private.recording_variant_batches where status='pending'));
end $$;

revoke all on function deafapp_private.initialize_variant_approval(),deafapp_private.inherit_variant_approval(uuid) from public,anon,authenticated;
revoke all on function public.deafapp_admin_variant_list(text,text,integer,text,integer) from public;
grant execute on function public.deafapp_admin_variant_list(text,text,integer,text,integer) to anon,authenticated;

-- Migrate only batches that have never received a decision. Rejected or manually
-- reopened batches keep their explicit review state.
update deafapp_private.recording_variant_batches set inherit_approval=true
 where status='pending' and version=0 and reviewed_at is null;
do $$ declare target uuid;begin
 for target in select id from deafapp_private.recording_variant_batches where status='pending' and inherit_approval order by id loop
  perform deafapp_private.inherit_variant_approval(target);
 end loop;
end $$;
notify pgrst,'reload schema';
