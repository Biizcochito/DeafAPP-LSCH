-- One narrowly scoped service-only cleanup. Web recordings cannot match it.
-- A dry run validates/locks the same rows without deleting anything.
create or replace function public.deafapp_remove_drive_imports(p_items jsonb,p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path='' as $$
declare item jsonb;g public.grabaciones;o storage.objects;ids bigint[];n integer;
begin
 if p_dry_run is null or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 150 or
    octet_length(p_items::text)>150000 then raise exception 'Invalid Drive scope' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements(p_items) i where coalesce(i->>'sourceId','')!~ '^\d+$' or
    coalesce(i->>'path','')!~ '^drive/[^/]+/[^/]+\.json$' or i->>'path' ~ '[%?#\\[:cntrl:]]' or
    i->>'path' ~ '(^|/)\.\.?(/|$)') then raise exception 'Only exact Drive imports are accepted' using errcode='22023';end if;
 select array_agg((i->>'sourceId')::bigint order by (i->>'sourceId')::bigint) into ids from jsonb_array_elements(p_items) i;
 if cardinality(ids)<>(select count(distinct id) from unnest(ids) id) then raise exception 'Duplicate Drive IDs' using errcode='22023';end if;
 perform 1 from public.grabaciones where id=any(ids) order by id for update;
 for item in select value from jsonb_array_elements(p_items) order by (value->>'sourceId')::bigint loop
   select * into g from public.grabaciones where id=(item->>'sourceId')::bigint;
   if not found or g.archivo_path is distinct from item->>'path' or g.label is distinct from item->>'label' or
     g.categoria is distinct from item->>'category' or g.moderation_version is distinct from (item->>'sourceVersion')::integer or
     g.moderation_status is distinct from item->>'status' or g.aprobada is distinct from (item->>'approved')::boolean then
     raise exception 'Drive source changed' using errcode='40001';end if;
   select * into o from storage.objects where bucket_id='contribuciones' and name=g.archivo_path for update;
   if not found or o.id is distinct from (item->>'objectId')::uuid or o.version is distinct from item->>'objectVersion' or
      date_trunc('milliseconds',o.updated_at) is distinct from (item->>'updatedAt')::timestamptz or
      o.metadata->>'eTag' is distinct from item->>'etag' or (o.metadata->>'size')::bigint is distinct from (item->>'bytes')::bigint then
     raise exception 'Drive file changed' using errcode='40001';end if;
 end loop;
 if exists(select 1 from deafapp_private.recording_variant_batches where parent_ids&&ids) or
    exists(select 1 from deafapp_private.recording_variants where parent_id=any(ids)) then
   raise exception 'Review variant dependencies before deleting imports' using errcode='40001';end if;
 if exists(select 1 from deafapp_private.recording_objects where source_id=any(ids)) then
   raise exception 'Review migrated imports before deletion' using errcode='40001';end if;
 if p_dry_run then return jsonb_build_object('ok',true,'dryRun',true,'sources',cardinality(ids));end if;
 delete from public.grabaciones where id=any(ids) and archivo_path like 'drive/%';
 get diagnostics n=row_count;
 if n<>cardinality(ids) then raise exception 'Incomplete Drive cleanup' using errcode='40001';end if;
 return jsonb_build_object('ok',true,'dryRun',false,'removed',n);
end $$;
revoke all on function public.deafapp_remove_drive_imports(jsonb,boolean) from public,anon,authenticated;
grant execute on function public.deafapp_remove_drive_imports(jsonb,boolean) to service_role;
notify pgrst,'reload schema';
