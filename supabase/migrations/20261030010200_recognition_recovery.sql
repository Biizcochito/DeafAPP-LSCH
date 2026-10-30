-- Recover an interrupted Edge job even when nobody has the website open.
-- The scheduled query only wakes pending work; it never accepts model inputs.
create extension if not exists pg_cron;
create or replace function deafapp_private.recognition_recover()
returns void language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from deafapp_private.recognition_runtime where singleton
   and (dirty or model_expires_at<=clock_timestamp() or jsonb_array_length(evaluation_pending)>0)
   and (lease_until is null or lease_until<=clock_timestamp())
   and (retry_after is null or retry_after<=clock_timestamp())) then
   perform deafapp_private.recognition_wake();
 end if;
end $$;
revoke all on function deafapp_private.recognition_recover() from public,anon,authenticated;
select cron.schedule('deafapp-recognition-recovery','*/5 * * * *','select deafapp_private.recognition_recover()');

create or replace function public.deafapp_admin_vocabulary_preview(p_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r deafapp_private.recognition_runtime;
begin
 perform deafapp_private.require_admin(p_token);select * into r from deafapp_private.recognition_runtime where singleton;
 if r.dirty or r.preview_packet is null or r.model_expires_at<=clock_timestamp() then raise exception 'Prepare the candidate first' using errcode='22023';end if;
 return jsonb_build_object('ok',true,'packet',r.packet,'enabledClasses',r.preview_packet->'enabledClasses','modelId',r.preview_packet->>'id',
   'revision',r.catalog_revision||':'||r.source_revision||':'||r.model_revision,
   'catalogue',(select jsonb_agg(deafapp_private.recognition_entry(c)) from deafapp_private.recognition_catalog c));
end $$;
notify pgrst,'reload schema';
