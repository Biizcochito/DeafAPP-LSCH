begin;
create or replace function deafapp_private.material(p_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_data jsonb;
begin
  perform deafapp_private.require_admin(p_token);
  select value into v_data from deafapp_private.admin_data where name='catalog';
  return jsonb_build_object('ok',true,'catalog',v_data);
end $$;
create or replace function public.deafapp_admin_material(p_token text)
returns jsonb language sql security invoker set search_path='' as $$ select deafapp_private.material(p_token); $$;
revoke all on function deafapp_private.material(text),public.deafapp_admin_material(text) from public,anon,authenticated;
grant execute on function deafapp_private.material(text),public.deafapp_admin_material(text) to anon,authenticated;
notify pgrst,'reload schema';
commit;
