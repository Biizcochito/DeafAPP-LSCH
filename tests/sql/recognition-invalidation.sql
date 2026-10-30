-- Integration regression. Every source change is rolled back, including queued
-- pg_net requests. Run after the three recognition migrations on a test database
-- or in an authorized read/rollback verification against the deployed project.
begin;
do $$
declare before_revision text;recording_id bigint;
begin
 before_revision:=public.deafapp_recognition_revision()->>'revision';
 select source_id into recording_id from deafapp_private.recognition_features limit 1;
 if recording_id is null then raise exception 'A prepared recording is required';end if;
 update public.grabaciones set moderation_version=moderation_version+1 where id=recording_id;
 if (public.deafapp_recognition_revision()->>'ready')::boolean then raise exception 'A stale model remained available';end if;
 if exists(select 1 from deafapp_private.recognition_features where source_id=recording_id) then raise exception 'A withdrawn feature remained cached';end if;
 begin
   perform public.deafapp_recognition_model(before_revision);
   raise exception 'A stale packet was returned';
 exception when serialization_failure then null;end;
 if has_function_privilege('anon','deafapp_private.recognition_recover()','execute') then raise exception 'Public recovery write access';end if;
 if has_function_privilege('anon','public.deafapp_runtime_claim()','execute') then raise exception 'Public service job access';end if;
end $$;
rollback;
select jsonb_build_object('rollback',true,'old_packet_blocked',true,'old_features_invalidated',true,'service_permissions_checked',true) as checks;
