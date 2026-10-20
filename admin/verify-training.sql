-- Ephemeral session fixture: all changes are rolled back. No administrator password is used.
begin;
select set_config('deafapp.qa_token',encode(extensions.gen_random_bytes(32),'hex'),true) is not null;
insert into deafapp_private.admin_sessions(token_hash,expires_at)
values(extensions.digest(current_setting('deafapp.qa_token'),'sha256'),clock_timestamp()+interval '1 minute');
set local role anon;
do $$ declare v jsonb; denied boolean:=false;
begin
  begin perform public.deafapp_admin_training_progress(repeat('0',64));
    exception when sqlstate '28000' then denied:=true; end;
  assert denied,'Progress accepted an invalid session';
  denied:=false;
  begin perform public.deafapp_admin_training_candidate(repeat('0',64),repeat('a',32));
    exception when sqlstate '28000' then denied:=true; end;
  assert denied,'Candidate accepted an invalid session';
  assert not has_table_privilege('anon','deafapp_private.admin_data','select'),'Private table exposed';
  v:=public.deafapp_admin_training_progress(current_setting('deafapp.qa_token'));
  assert v->>'ok'='true' and v->'progress' is not null,'Authenticated read failed';
  assert (v->'progress'->>'publicActivation')::boolean=false,'Experimental progress activated publicly';
end $$;
reset role;
rollback;
select true as checks_passed;
