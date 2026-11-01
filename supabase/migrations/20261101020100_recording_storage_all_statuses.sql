-- Service-only movement of files is independent of moderation. Keep row versions intact.
create or replace function public.deafapp_storage_register_copy(p_copy jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare g public.grabaciones;o storage.objects;c deafapp_private.recording_objects;
begin
  if p_copy is null or jsonb_typeof(p_copy)<>'object' or octet_length(p_copy::text)>8000 or
    coalesce(p_copy->>'sourceId','') !~ '^\d+$' or coalesce(p_copy->>'sha256','') !~ '^[a-f0-9]{64}$' or
    coalesce(p_copy->>'bytes','') !~ '^\d+$' then raise exception 'Invalid copy' using errcode='22023';end if;
  select * into g from public.grabaciones where id=(p_copy->>'sourceId')::bigint for update;
  if not found or
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
  if p_active and (g.moderation_version<>c.registered_source_version or
    c.read_verified_at is null or c.read_verified_at<clock_timestamp()-interval '1 hour') then
    raise exception 'Recheck approval and private server read before activation' using errcode='40001';end if;
  update deafapp_private.recording_objects set state=case when p_active then 'active' else 'copied' end,
    activated_at=case when p_active then clock_timestamp() else null end where path=p_path;
  return jsonb_build_object('ok',true,'provider',case when p_active then 'r2' else 'supabase' end);
end $$;


create table if not exists deafapp_private.recording_archives (
 path text primary key, object_key text not null, sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 bytes bigint not null check(bytes between 1 and 40000000), source_object_id uuid not null,
 archived_at timestamptz not null default clock_timestamp()
);
alter table deafapp_private.recording_archives enable row level security;
revoke all on deafapp_private.recording_archives from public,anon,authenticated;
create or replace function public.deafapp_storage_register_archive(p_archive jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o storage.objects;a deafapp_private.recording_archives;
begin
 if p_archive->>'sha256' !~ '^[a-f0-9]{64}$' or p_archive->>'destinationPath' !~ '^__archive__/2026-11-01/[a-f0-9]{64}\.json$' then raise exception 'Invalid archive' using errcode='22023';end if;
 if exists(select 1 from public.grabaciones where archivo_path=p_archive->>'path') then raise exception 'Archive has a recording' using errcode='40001';end if;
 select * into o from storage.objects where bucket_id='contribuciones' and name=p_archive->>'path' for update;
 if not found or o.id<>(p_archive->>'objectId')::uuid or o.version is distinct from p_archive->>'objectVersion' or
 date_trunc('milliseconds',o.updated_at) is distinct from (p_archive->>'updatedAt')::timestamptz or o.metadata->>'eTag' is distinct from p_archive->>'etag' or
 (o.metadata->>'size')::bigint<>(p_archive->>'bytes')::bigint then raise exception 'Source changed' using errcode='40001';end if;
 select * into a from deafapp_private.recording_archives where path=o.name;
 if found and (a.sha256<>p_archive->>'sha256' or a.bytes<>(p_archive->>'bytes')::bigint) then raise exception 'Archive changed' using errcode='40001';end if;
 insert into deafapp_private.recording_archives(path,object_key,sha256,bytes,source_object_id)
 values(o.name,'contribuciones/'||(p_archive->>'destinationPath'),p_archive->>'sha256',(p_archive->>'bytes')::bigint,o.id) on conflict(path) do nothing;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.deafapp_storage_register_archive(jsonb) from public,anon,authenticated;
grant execute on function public.deafapp_storage_register_archive(jsonb) to service_role;
notify pgrst,'reload schema';
