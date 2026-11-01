-- Run as the administrative database role. The transaction always rolls back.
begin;
do $$
declare id text:='sql-r2-check-'||extensions.gen_random_uuid()::text;
 path text; ticket jsonb; again jsonb; result jsonb; sources bigint;
begin
 if has_function_privilege('anon','public.deafapp_recording_upload_ready(text,text,text,bigint)','EXECUTE') or
    has_function_privilege('authenticated','public.deafapp_recording_upload_complete(text,text,text)','EXECUTE') or
    has_function_privilege('anon','public.deafapp_recording_upload_reserve(text,text,text,text,text,text)','EXECUTE') then
   raise exception 'Visitors can mutate private upload state';end if;
 select count(*) into sources from public.grabaciones;
 path:='saludos/hola/hola_'||id||'.json';
 ticket:=public.deafapp_recording_upload_reserve(path,repeat('a',64),'saludos','hola',id,'sql-test-consent');
 again:=public.deafapp_recording_upload_reserve(path,repeat('a',64),'saludos','hola',id,'sql-test-consent');
 if ticket is distinct from again then raise exception 'Retry changed its token or retention start';end if;
 begin
   perform public.deafapp_recording_upload_complete(path,ticket->>'token','2026-10-31-v2');
   raise exception 'Unverified upload accepted';
 exception when invalid_parameter_value then null;end;
 if (select count(*) from public.grabaciones)<>sources then raise exception 'Partial row escaped verification';end if;
 perform public.deafapp_recording_upload_ready(path,ticket->>'token',repeat('b',64),100);
 begin
   perform public.deafapp_recording_upload_ready(path,ticket->>'token',repeat('c',64),100);
   raise exception 'Conflicting hash accepted';
 exception when serialization_failure then null;end;
 begin
   perform public.deafapp_recording_upload_location(path,repeat('f',64));
   raise exception 'Forged token accepted';
 exception when invalid_parameter_value then null;end;
 begin
   perform public.deafapp_recording_upload_complete(path,ticket->>'token','anterior');
   raise exception 'Old notice accepted';
 exception when invalid_parameter_value then null;end;
 result:=public.deafapp_recording_upload_complete(path,ticket->>'token','2026-10-31-v2');
 if result->>'alreadySubmitted'<>'false' or public.deafapp_storage_route(path)->>'provider'<>'r2' then raise exception 'R2 transaction incomplete';end if;
 if not exists(select 1 from public.grabaciones where archivo_path=path and aprobada is distinct from true) then raise exception 'Upload changed moderation';end if;
 result:=public.deafapp_recording_upload_complete(path,ticket->>'token','2026-10-31-v2');
 if result->>'alreadySubmitted'<>'true' or (select count(*) from public.grabaciones)<>sources+1 then raise exception 'Retry created a duplicate';end if;
end $$;
rollback;
select 'recording_upload_sql_passed' as status;
