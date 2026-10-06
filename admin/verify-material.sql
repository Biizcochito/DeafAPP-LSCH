-- Read-only checks for the protected catalog. No password or recording is used.
begin;
do $$ begin
  assert (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='deafapp_private' and c.relkind='r' and c.relrowsecurity)=4,
    'Private tables must have RLS enabled';
  assert not has_table_privilege('anon','deafapp_private.admin_data','SELECT'), 'Private catalog exposed';
  assert not has_table_privilege('authenticated','deafapp_private.admin_config','SELECT'), 'Private configuration exposed';
  assert not (select prosecdef from pg_proc where oid='public.deafapp_admin_material(text)'::regprocedure),
    'Public wrapper must use invoker rights';
  assert not has_function_privilege('anon','deafapp_private.require_admin(text)','EXECUTE'), 'Internal session helper exposed';
  assert (select jsonb_array_length(value->'videos') from deafapp_private.admin_data where name='catalog')=379,
    'Catalog import incomplete';
end $$;
set local role anon;
do $$ declare v_denied boolean:=false; begin
  begin perform public.deafapp_admin_material(repeat('0',64));
    exception when sqlstate '28000' then v_denied:=true; end;
  assert v_denied, 'Catalog accepted an invalid session';
end $$;
rollback;
select true as checks_passed, 'private RLS, denied direct access, invoker wrapper, protected helper, catalog completeness, invalid session denied' as verification;
