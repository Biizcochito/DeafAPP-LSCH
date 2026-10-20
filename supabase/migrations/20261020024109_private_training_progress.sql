-- Models stay in the private table; only validated administrator sessions may read them.
create or replace function deafapp_private.training_progress(p_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_data jsonb;
begin
  perform deafapp_private.require_admin(p_token);
  select value into v_data from deafapp_private.admin_data where name='visible-training-progress';
  return jsonb_build_object('ok',true,'progress',v_data);
end $$;

create or replace function deafapp_private.training_candidate(p_token text,p_model_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_data jsonb;
begin
  perform deafapp_private.require_admin(p_token);
  if p_model_id is null or p_model_id !~ '^[a-f0-9]{32}$' then
    raise exception 'Invalid candidate' using errcode='22023';
  end if;
  select value into v_data from deafapp_private.admin_data where name='training-candidate:'||p_model_id;
  if v_data is null then raise exception 'Candidate unavailable' using errcode='22023'; end if;
  return jsonb_build_object('ok',true,'candidate',v_data);
end $$;

create or replace function public.deafapp_admin_training_progress(p_token text)
returns jsonb language sql security invoker set search_path='' as $$
  select deafapp_private.training_progress(p_token);
$$;
create or replace function public.deafapp_admin_training_candidate(p_token text,p_model_id text)
returns jsonb language sql security invoker set search_path='' as $$
  select deafapp_private.training_candidate(p_token,p_model_id);
$$;
revoke all on function deafapp_private.training_progress(text),deafapp_private.training_candidate(text,text),public.deafapp_admin_training_progress(text),public.deafapp_admin_training_candidate(text,text) from public,anon,authenticated;
grant execute on function deafapp_private.training_progress(text),deafapp_private.training_candidate(text,text),public.deafapp_admin_training_progress(text),public.deafapp_admin_training_candidate(text,text) to anon,authenticated;
notify pgrst,'reload schema';
