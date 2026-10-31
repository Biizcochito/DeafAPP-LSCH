-- Locations are separate from grabaciones so migration cannot reset moderation,
-- variant parents, source hashes, feature caches or the recognition revision.
create table if not exists deafapp_private.recording_objects (
  path text primary key,
  source_id bigint not null references public.grabaciones(id) on delete cascade,
  bucket text not null check(bucket='deafapp-grabaciones-privadas'),
  object_key text not null check(object_key='contribuciones/'||path),
  sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
  bytes bigint not null check(bytes between 1 and 40000000),
  original_object_id uuid not null,
  original_object_version text,
  original_etag text not null,
  original_updated_at timestamptz not null,
  registered_source_version integer not null,
  state text not null default 'copied' check(state in ('copied','active')),
  copied_at timestamptz not null default clock_timestamp(),
  read_verified_at timestamptz,
  activated_at timestamptz
);
alter table deafapp_private.recording_objects enable row level security;
revoke all on deafapp_private.recording_objects from public,anon,authenticated;

create or replace function deafapp_private.recording_location(p_path text,p_copy boolean default false)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c deafapp_private.recording_objects;
begin
  if p_path is null or length(p_path)>512 or p_path !~ '^[^/]+(/[^/]+){0,7}\.json$' or
    p_path ~ '[%?#\\[:cntrl:]]' or p_path ~ '(^|/)\.\.?(/|$)' then
    raise exception 'Invalid recording path' using errcode='22023';
  end if;
  if not exists(select 1 from public.grabaciones g where g.archivo_path=p_path) then
    raise exception 'Recording unavailable' using errcode='22023';
  end if;
  select o.* into c from deafapp_private.recording_objects o
    join public.grabaciones g on g.id=o.source_id and g.archivo_path=o.path
    where o.path=p_path and (o.state='active' or p_copy);
  if found then
    return jsonb_build_object('ok',true,'provider','r2','path',c.path,'bucket',c.bucket,
      'key',c.object_key,'sha256',c.sha256,'bytes',c.bytes);
  end if;
  if p_copy then raise exception 'Copy unavailable' using errcode='22023';end if;
  return jsonb_build_object('ok',true,'provider','supabase','path',p_path);
end $$;

-- Public callers learn only the routing flag for paths already in the public
-- recording index. This RPC never returns a key, signed URL, image or secret.
create or replace function public.deafapp_storage_route(p_path text)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('ok',true,'provider',case when exists(
    select 1 from deafapp_private.recording_objects o join public.grabaciones g
    on g.id=o.source_id and g.archivo_path=o.path where o.path=p_path and o.state='active')
    then 'r2' else 'supabase' end);
$$;

create or replace function public.deafapp_admin_storage_location(p_token text,p_path text,p_copy boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform deafapp_private.require_admin(p_token);
  return deafapp_private.recording_location(p_path,p_copy);
end $$;

create or replace function public.deafapp_storage_server_location(p_path text,p_copy boolean default false)
returns jsonb language sql stable security definer set search_path='' as $$
  select deafapp_private.recording_location(p_path,p_copy);
$$;

create or replace function public.deafapp_storage_register_copy(p_copy jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare g public.grabaciones;o storage.objects;c deafapp_private.recording_objects;
begin
  if p_copy is null or jsonb_typeof(p_copy)<>'object' or octet_length(p_copy::text)>8000 or
    coalesce(p_copy->>'sourceId','') !~ '^\d+$' or coalesce(p_copy->>'sha256','') !~ '^[a-f0-9]{64}$' or
    coalesce(p_copy->>'bytes','') !~ '^\d+$' then raise exception 'Invalid copy' using errcode='22023';end if;
  select * into g from public.grabaciones where id=(p_copy->>'sourceId')::bigint for update;
  if not found or g.aprobada is distinct from true or g.moderation_status is distinct from 'approved' or
    g.moderation_version is distinct from (p_copy->>'sourceVersion')::integer or
    g.archivo_path is distinct from p_copy->>'path' or g.label is distinct from p_copy->>'label' or
    g.categoria is distinct from p_copy->>'category' then raise exception 'Source changed' using errcode='40001';end if;
  perform deafapp_private.recording_location(g.archivo_path,false);
  select * into o from storage.objects where bucket_id='contribuciones' and name=g.archivo_path for update;
  if not found or o.id is distinct from (p_copy->>'objectId')::uuid or
    o.version is distinct from p_copy->>'objectVersion' or
    -- Storage's JSON API truncates timestamps to milliseconds. Preserve and
    -- later compare the full database timestamp, while matching API precision
    -- here; object ID, version, ETag and size must still match exactly.
    date_trunc('milliseconds',o.updated_at) is distinct from (p_copy->>'updatedAt')::timestamptz or
    o.metadata->>'eTag' is distinct from p_copy->>'etag' or
    (o.metadata->>'size')::bigint is distinct from (p_copy->>'bytes')::bigint then
    raise exception 'Storage source changed' using errcode='40001';end if;
  select * into c from deafapp_private.recording_objects where path=g.archivo_path for update;
  if found then
    if c.sha256 is distinct from p_copy->>'sha256' or c.bytes is distinct from (p_copy->>'bytes')::bigint or
      c.source_id<>g.id or c.original_object_id<>o.id or c.original_object_version is distinct from o.version then
      raise exception 'Conflicting copy; no overwrite' using errcode='40001';end if;
    return jsonb_build_object('ok',true,'alreadyRegistered',true,'state',c.state);
  end if;
  insert into deafapp_private.recording_objects(path,source_id,bucket,object_key,sha256,bytes,original_object_id,
    original_object_version,original_etag,original_updated_at,registered_source_version)
  values(g.archivo_path,g.id,'deafapp-grabaciones-privadas','contribuciones/'||g.archivo_path,p_copy->>'sha256',
    (p_copy->>'bytes')::bigint,o.id,o.version,o.metadata->>'eTag',o.updated_at,g.moderation_version);
  return jsonb_build_object('ok',true,'alreadyRegistered',false,'state','copied');
end $$;

-- Only the server calls this after reading and hashing the complete R2 object.
create or replace function public.deafapp_storage_verify_copy(p_path text,p_sha256 text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  update deafapp_private.recording_objects o set read_verified_at=clock_timestamp()
  where path=p_path and sha256=p_sha256 and exists(select 1 from public.grabaciones g where g.id=o.source_id and g.archivo_path=o.path);
  if not found then raise exception 'Copy changed' using errcode='40001';end if;
  return jsonb_build_object('ok',true);
end $$;

create or replace function public.deafapp_storage_set_active(p_path text,p_sha256 text,p_active boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c deafapp_private.recording_objects;o storage.objects;g public.grabaciones;
begin
  select * into c from deafapp_private.recording_objects where path=p_path and sha256=p_sha256 for update;
  if not found or p_active is null then raise exception 'Copy unavailable' using errcode='22023';end if;
  select * into g from public.grabaciones where id=c.source_id and archivo_path=c.path for update;
  if not found then raise exception 'Source changed' using errcode='40001';end if;
  -- Until a separate retirement process is implemented, activation and rollback
  -- both require the intact original to be available.
  select * into o from storage.objects where bucket_id='contribuciones' and name=c.path for update;
  if not found or o.id<>c.original_object_id or o.version is distinct from c.original_object_version or
    o.updated_at is distinct from c.original_updated_at or o.metadata->>'eTag' is distinct from c.original_etag or
    (o.metadata->>'size')::bigint is distinct from c.bytes then raise exception 'Restore or review the original first' using errcode='40001';end if;
  if p_active and (g.aprobada is distinct from true or g.moderation_status is distinct from 'approved' or g.moderation_version<>c.registered_source_version or
    c.read_verified_at is null or c.read_verified_at<clock_timestamp()-interval '1 hour') then
    raise exception 'Recheck approval and private server read before activation' using errcode='40001';end if;
  update deafapp_private.recording_objects set state=case when p_active then 'active' else 'copied' end,
    activated_at=case when p_active then clock_timestamp() else null end where path=p_path;
  return jsonb_build_object('ok',true,'provider',case when p_active then 'r2' else 'supabase' end);
end $$;

revoke all on function deafapp_private.recording_location(text,boolean) from public,anon,authenticated;
revoke all on function public.deafapp_storage_route(text),public.deafapp_admin_storage_location(text,text,boolean),
  public.deafapp_storage_server_location(text,boolean),public.deafapp_storage_register_copy(jsonb),
  public.deafapp_storage_verify_copy(text,text),public.deafapp_storage_set_active(text,text,boolean) from public,anon,authenticated;
grant execute on function public.deafapp_storage_route(text),public.deafapp_admin_storage_location(text,text,boolean) to anon,authenticated,service_role;
grant execute on function public.deafapp_storage_server_location(text,boolean),public.deafapp_storage_register_copy(jsonb),
  public.deafapp_storage_verify_copy(text,text),public.deafapp_storage_set_active(text,text,boolean) to service_role;
notify pgrst,'reload schema';
