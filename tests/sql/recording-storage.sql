-- Run after the migration. No recordings, variants or model data are changed.
begin;
do $$ begin
  if has_function_privilege('anon','public.deafapp_storage_service_authorized()','EXECUTE') or
     has_function_privilege('authenticated','public.deafapp_storage_integrity_snapshot()','EXECUTE') then
    raise exception 'Service authorization or integrity data exposed';
  end if;
end $$;
do $$
begin
  if has_table_privilege('anon','deafapp_private.recording_objects','select') or
     has_table_privilege('authenticated','deafapp_private.recording_objects','select') then
    raise exception 'Private copy registry exposed';end if;
  if has_function_privilege('anon','public.deafapp_storage_register_copy(jsonb)','execute') or
     has_function_privilege('anon','public.deafapp_storage_server_location(text,boolean)','execute') or
     has_function_privilege('anon','public.deafapp_storage_verify_copy(text,text)','execute') or
     has_function_privilege('anon','public.deafapp_storage_set_active(text,text,boolean)','execute') then
    raise exception 'Anonymous storage administration exposed';end if;
  if not has_function_privilege('service_role','public.deafapp_storage_server_location(text,boolean)','execute') then
    raise exception 'Runtime cannot resolve originals';end if;
end $$;
set local role anon;
do $$
begin
  if (public.deafapp_storage_route('missing/recording/test.json')->>'provider')<>'supabase' then
    raise exception 'Unexpected routing';end if;
  begin
    perform public.deafapp_admin_storage_location(repeat('0',64),'familia/mama/test.json',true);
    raise exception 'Invalid administrator session accepted';
  exception when sqlstate '28000' then null;
  end;
  begin
    perform public.deafapp_storage_server_location('familia/mama/test.json',true);
    raise exception 'Anonymous server read accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
