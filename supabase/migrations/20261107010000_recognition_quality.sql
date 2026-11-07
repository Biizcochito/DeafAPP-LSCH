-- Public quality labels contain aggregate results only. Manual review does not
-- change activation, training samples or the prepared recognition model.
alter table deafapp_private.recognition_runtime add column if not exists quality_revision bigint not null default 0;
create table if not exists deafapp_private.recognition_quality_reviews (
  class_id text primary key references deafapp_private.recognition_catalog(class_id) on delete cascade,
  level text check(level in ('high','medium','low','unrated')),
  version integer not null default 1 check(version>0),updated_at timestamptz not null default now()
);
alter table deafapp_private.recognition_quality_reviews enable row level security;
revoke all on deafapp_private.recognition_quality_reviews from public,anon,authenticated;

create or replace function deafapp_private.recognition_quality(p_all boolean default false)
returns jsonb language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('classId',c.class_id,'manualLevel',q.level,'manualVersion',coalesce(q.version,0),
   'evaluation',case when not r.dirty and r.packet is not null and r.evaluation_total>0 and r.evaluation_done=r.evaluation_total
     and (r.model_expires_at is null or r.model_expires_at>statement_timestamp())
     then jsonb_build_object('samples',e.value#>'{evaluation,samples}','correct',e.value#>'{evaluation,correct}',
       'predicted',e.value#>'{evaluation,predicted}','scope',e.value#>'{evaluation,scope}') else null end) order by c.class_id),'[]'::jsonb)
 from deafapp_private.recognition_runtime r
 cross join deafapp_private.recognition_catalog c
 left join deafapp_private.recognition_quality_reviews q on q.class_id=c.class_id
 left join lateral (select value from jsonb_array_elements(r.coverage) where value->>'classId'=c.class_id limit 1) e on true
 where r.singleton and c.alias_of is null and (p_all or c.state='enabled');
$$;
revoke all on function deafapp_private.recognition_quality(boolean) from public,anon,authenticated;

create or replace function public.deafapp_recognition_revision()
returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('ok',true,'revision',catalog_revision||':'||source_revision||':'||model_revision,
   'ready',not dirty and packet is not null and (model_expires_at is null or model_expires_at>clock_timestamp()),
   'preparing',dirty or coalesce(model_expires_at<=clock_timestamp(),false),'modelId',model_id,'retryAt',retry_after,
   'qualityRevision',quality_revision||':'||coalesce(model_id,'none')||':'||case when evaluation_total>0 and evaluation_done=evaluation_total then 'evaluated' else 'pending' end)
 from deafapp_private.recognition_runtime where singleton;
$$;
create or replace function public.deafapp_recognition_manifest()
returns jsonb language sql security definer set search_path='' as $$
 select public.deafapp_recognition_revision()||jsonb_build_object('catalogue',
   (select coalesce(jsonb_agg(deafapp_private.recognition_entry(c) order by c.category,c.label),'[]'::jsonb)
    from deafapp_private.recognition_catalog c where c.collection_enabled or c.state='enabled'),
   'quality',deafapp_private.recognition_quality(false),'expiresAt',r.model_expires_at,'compressedBytes',r.packet->'compressedBytes')
 from deafapp_private.recognition_runtime r where singleton;
$$;
create or replace function public.deafapp_admin_vocabulary_list(p_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform deafapp_private.require_admin(p_token);
 select jsonb_build_object('ok',true,'catalogue',(select coalesce(jsonb_agg(deafapp_private.recognition_entry(c) order by c.category,c.label),'[]'::jsonb) from deafapp_private.recognition_catalog c),
   'coverage',r.coverage,'quality',deafapp_private.recognition_quality(true),'dirty',r.dirty,'preparing',r.lease_until>clock_timestamp(),'lastError',r.last_error,
   'revision',r.catalog_revision||':'||r.source_revision||':'||r.model_revision,'modelId',r.model_id,
   'compressedBytes',r.packet->'compressedBytes','evaluationPending',r.evaluation_total-r.evaluation_done,'evaluationDone',r.evaluation_done,
   'updatedAt',r.updated_at) into result from deafapp_private.recognition_runtime r where singleton;
 return result;
end $$;
create or replace function public.deafapp_admin_recognition_quality_save(p_token text,p_class_id text,p_level text,p_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare saved deafapp_private.recognition_quality_reviews;
begin
 perform deafapp_private.require_admin(p_token);
 if p_version is null or p_version<0 or p_level is not null and p_level not in ('high','medium','low','unrated') or
   not exists(select 1 from deafapp_private.recognition_catalog where class_id=p_class_id and alias_of is null)
   then raise exception 'Invalid recognition quality' using errcode='22023';end if;
 -- Lock a single revision counter for atomic public invalidation and concurrent writes.
 perform 1 from deafapp_private.recognition_runtime where singleton for update;
 if p_version=0 then
   insert into deafapp_private.recognition_quality_reviews(class_id,level) values(p_class_id,p_level) on conflict do nothing returning * into saved;
 else
   update deafapp_private.recognition_quality_reviews set level=p_level,version=version+1,updated_at=clock_timestamp()
     where class_id=p_class_id and version=p_version returning * into saved;
 end if;
 if saved.class_id is null then raise exception 'Quality review changed' using errcode='40001';end if;
 update deafapp_private.recognition_runtime set quality_revision=quality_revision+1 where singleton;
 return jsonb_build_object('ok',true,'qualityReview',jsonb_build_object('classId',saved.class_id,'manualLevel',saved.level,'manualVersion',saved.version));
end $$;
revoke all on function public.deafapp_admin_recognition_quality_save(text,text,text,integer) from public;
grant execute on function public.deafapp_admin_recognition_quality_save(text,text,text,integer) to anon,authenticated;
revoke all on function public.deafapp_recognition_revision(),public.deafapp_recognition_manifest(),public.deafapp_admin_vocabulary_list(text) from public;
grant execute on function public.deafapp_recognition_revision(),public.deafapp_recognition_manifest(),public.deafapp_admin_vocabulary_list(text) to anon,authenticated;
