-- Service-only comparison of application data before and after file retirement.
-- It returns digests and counts, never recordings, variants or model contents.
create or replace function public.deafapp_storage_service_authorized()
returns boolean language sql stable set search_path='' as $$ select true $$;
revoke all on function public.deafapp_storage_service_authorized() from public,anon,authenticated;
grant execute on function public.deafapp_storage_service_authorized() to service_role;

create or replace function public.deafapp_storage_integrity_snapshot()
returns jsonb language sql stable security definer set search_path='' as $$
select jsonb_build_object('ok',true,
 'recordings',(select jsonb_build_object('count',count(*),'digest',md5(coalesce(jsonb_agg(to_jsonb(g) order by id),'[]'::jsonb)::text)) from public.grabaciones g),
 'variantBatches',(select jsonb_build_object('count',count(*),'quantity',coalesce(sum(quantity),0),'digest',md5(coalesce(jsonb_agg(to_jsonb(b) order by id),'[]'::jsonb)::text)) from deafapp_private.recording_variant_batches b),
 'variants',(select jsonb_build_object('count',count(*),'digest',md5(coalesce(jsonb_agg(to_jsonb(v) order by batch_id,variant_index),'[]'::jsonb)::text)) from deafapp_private.recording_variants v),
 'features',(select jsonb_build_object('count',count(*),'digest',md5(coalesce(jsonb_agg(to_jsonb(f) order by source_id),'[]'::jsonb)::text)) from deafapp_private.recognition_features f),
 'runtime',(select md5(to_jsonb(r)::text) from deafapp_private.recognition_runtime r where singleton),
 'manifest',public.deafapp_recognition_manifest());
$$;
revoke all on function public.deafapp_storage_integrity_snapshot() from public,anon,authenticated;
grant execute on function public.deafapp_storage_integrity_snapshot() to service_role;
notify pgrst,'reload schema';
