-- Create 50 variants when an administrator approves a sign with no batches.
-- Uploading a pending recording does not create variants. Existing decisions,
-- source-version checks and administrator authentication remain authoritative.

create or replace function deafapp_private.create_recording_variants(p_request_id uuid,p_items jsonb,p_quantity integer)
returns jsonb language plpgsql security definer set search_path='' as $$

#variable_conflict use_variable
declare b deafapp_private.recording_variant_batches;ids bigint[];source public.grabaciones;item jsonb;class_id text;category text;label text;n integer;ordinal integer;idx integer;angle numeric;lock_class text;source_count integer;class_count integer;
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
 -- All manual creation and moderation use the same sign lock before source
 -- row locks. Concurrent approvals cannot create two automatic batches.
 select min(deafapp_private.variant_class(g.categoria,g.label)),count(*),count(distinct deafapp_private.variant_class(g.categoria,g.label))
 into lock_class,source_count,class_count from public.grabaciones g where g.id=any(ids);
 if source_count<>cardinality(ids) then raise exception 'Recording changed' using errcode='40001';end if;
 if class_count<>1 then raise exception 'Use recordings of the same sign' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('deafapp:variant-class:'||lock_class,0));
 for item in select value from jsonb_array_elements(p_items) loop
   select * into source from public.grabaciones where id=(item->>'id')::bigint for share;
   if not found or source.moderation_version is distinct from (item->>'version')::integer or source.moderation_status='rejected' then raise exception 'Recording changed' using errcode='40001';end if;
   if lock_class is distinct from deafapp_private.variant_class(source.categoria,source.label) then raise exception 'Recording changed' using errcode='40001';end if;
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

create or replace function deafapp_private.review_recordings(p_token text,p_items jsonb,p_status text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor bytea; v_count integer; v_expected integer; v_old record; v_classes text[]; v_class text; v_result jsonb; v_automatic_batches integer:=0;
begin
  v_actor := deafapp_private.require_admin(p_token);
  if p_status is null or p_status not in ('pending','approved','rejected') or jsonb_typeof(p_items) is distinct from 'array' then
    raise exception using errcode='22023',message='INVALID_REVIEW';
  end if;
  v_expected := jsonb_array_length(p_items);
  if v_expected<1 or v_expected>50 or exists (select 1 from jsonb_array_elements(p_items) x where
    jsonb_typeof(x) is distinct from 'object' or (x->>'id') is null or (x->>'id') !~ '^[0-9]{1,20}$'
    or jsonb_typeof(x->'version') is distinct from 'number' or (x->>'version') !~ '^[0-9]{1,9}$') then
    raise exception using errcode='22023',message='INVALID_REVIEW';
  end if;
  if (select count(distinct x->>'id') from jsonb_array_elements(p_items) x)<>v_expected then
    raise exception using errcode='22023',message='DUPLICATE_REVIEW';
  end if;
  -- Ordered locks prevent duplicate automatic batches for bulk/concurrent
  -- reviews and serialize them with explicit manual multiplication.
  select array_agg(class_id order by class_id) into v_classes from (
    select distinct deafapp_private.variant_class(g.categoria,g.label) as class_id
    from public.grabaciones g join jsonb_to_recordset(p_items) as x(id text,version integer) on g.id::text=x.id
  ) q;
  foreach v_class in array coalesce(v_classes,array[]::text[]) loop
    perform pg_advisory_xact_lock(hashtextextended('deafapp:variant-class:'||v_class,0));
  end loop;
  v_count := 0;
  for v_old in select g.* from public.grabaciones g join jsonb_to_recordset(p_items) as x(id text,version integer) on g.id::text=x.id order by g.id for update of g loop
    if v_old.moderation_version<>(select x.version from jsonb_to_recordset(p_items) as x(id text,version integer) where x.id=v_old.id::text) then
      raise exception using errcode='40001',message='REVIEW_CONFLICT';
    end if;
    if not (deafapp_private.variant_class(v_old.categoria,v_old.label)=any(v_classes)) then raise exception using errcode='40001',message='REVIEW_CONFLICT';end if;
    v_count := v_count+1;
  end loop;
  if v_count<>v_expected then raise exception using errcode='40001',message='RECORDING_NOT_FOUND'; end if;
  insert into deafapp_private.moderation_audit(recording_id,previous_status,new_status,actor_hash)
    select g.id::text,g.moderation_status,p_status,v_actor from public.grabaciones g
    join jsonb_to_recordset(p_items) as x(id text,version integer) on g.id::text=x.id;
  update public.grabaciones g set moderation_status=p_status,aprobada=(p_status='approved'),
    validada=(p_status='approved'),visible=(p_status='approved'),moderation_version=g.moderation_version+1,moderated_at=clock_timestamp()
    from jsonb_to_recordset(p_items) as x(id text,version integer) where g.id::text=x.id;
  if p_status='approved' then
    for v_old in select g.* from public.grabaciones g
      join jsonb_to_recordset(p_items) as x(id text,version integer) on g.id::text=x.id order by g.id loop
      v_class:=deafapp_private.variant_class(v_old.categoria,v_old.label);
      -- Existing pending/rejected batches are also retained. Approval must not
      -- duplicate earlier work or override a deliberate variant review.
      if not exists(select 1 from deafapp_private.recording_variant_batches b where b.class_id=v_class) then
        v_result:=deafapp_private.create_recording_variants(extensions.gen_random_uuid(),
          jsonb_build_array(jsonb_build_object('id',v_old.id::text,'version',v_old.moderation_version)),50);
        if not coalesce((v_result->>'alreadyCreated')::boolean,false) then v_automatic_batches:=v_automatic_batches+1;end if;
      end if;
    end loop;
  end if;
  return jsonb_build_object('ok',true,'changed',v_count,'status',p_status,
    'automaticBatches',v_automatic_batches,'automaticVariants',v_automatic_batches*50);
end $$;

-- Variant decisions take the same sign lock before their batch/source locks.
create or replace function deafapp_private.review_recording_variants(p_id uuid,p_version integer,p_status text,p_parents jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare b deafapp_private.recording_variant_batches;g public.grabaciones;item jsonb;lock_class text;
begin
 select class_id into lock_class from deafapp_private.recording_variant_batches where id=p_id;
 if not found then raise exception 'Batch changed' using errcode='40001';end if;
 perform pg_advisory_xact_lock(hashtextextended('deafapp:variant-class:'||lock_class,0));
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

notify pgrst,'reload schema';
