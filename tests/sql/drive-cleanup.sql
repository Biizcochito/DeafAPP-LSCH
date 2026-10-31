begin;
do $$ begin
 if has_function_privilege('anon','public.deafapp_remove_drive_imports(jsonb,boolean)','EXECUTE') or
    has_function_privilege('authenticated','public.deafapp_remove_drive_imports(jsonb,boolean)','EXECUTE') then
   raise exception 'Drive cleanup exposed';end if;
 begin
   perform public.deafapp_remove_drive_imports('[{"sourceId":"1","path":"saludos/hola/web.json"}]'::jsonb,false);
   raise exception 'A web recording entered the Drive cleanup';
 exception when sqlstate '22023' then null;
 end;
end $$;
set local role anon;
do $$ begin
 begin
   perform public.deafapp_remove_drive_imports('[]'::jsonb,true);
   raise exception 'Anonymous cleanup accepted';
 exception when insufficient_privilege then null;
 end;
end $$;
rollback;
