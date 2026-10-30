-- Rename the catalogue class while retaining immutable original labels/files.
-- Existing approvals, variants, feature hashes and capture times are preserved.
insert into deafapp_private.recognition_catalog
 (class_id,category,label,comparison_key,display_label,category_title,color,emoji,collection_enabled,state,
  activation_scope,minimum_originals,recording_goal,people_goal,alias_of,forms,version,updated_at)
select 'verbos/necesito',category,'necesito','verbos/necesito','necesito',category_title,color,emoji,collection_enabled,state,
 activation_scope,minimum_originals,recording_goal,people_goal,alias_of,forms,version+1,clock_timestamp()
from deafapp_private.recognition_catalog where class_id='verbos/necesitar'
on conflict(class_id) do nothing;

update deafapp_private.recognition_catalog set display_label='necesito',version=version+1,updated_at=clock_timestamp()
 where class_id='verbos/necesito' and display_label<>'necesito';
update deafapp_private.recognition_catalog set alias_of=case when class_id='verbos/necesito' then null else 'verbos/necesito' end,
 version=version+1,updated_at=clock_timestamp() where alias_of='verbos/necesitar';
update deafapp_private.recording_variant_batches set class_id='verbos/necesito',version=version+1 where class_id='verbos/necesitar';
update deafapp_private.recognition_features set class_id='verbos/necesito',
 feature=case when feature->>'classId'='verbos/necesitar' then jsonb_set(feature,'{classId}','"verbos/necesito"'::jsonb) else feature end
 where class_id='verbos/necesitar' or feature->>'classId'='verbos/necesitar';
delete from deafapp_private.recognition_catalog where class_id='verbos/necesitar';

create or replace function deafapp_private.canonical_sign_label(p_category text,p_label text)
returns text language sql immutable set search_path='' as $$
 select case when p_category='verbos' and lower(trim(p_label))='necesitar' then 'necesito' else p_label end;
$$;
revoke all on function deafapp_private.canonical_sign_label(text,text) from public,anon,authenticated;

create or replace function deafapp_private.variant_class(p_category text,p_label text)
returns text language sql stable security definer set search_path='' as $$
 with labels as (select normalize(lower(regexp_replace(trim(replace(p_label,'_',' ')),'\s+',' ','g')),NFC) as label),
 normalized as (select p_category||'/'||case when p_category='oraciones' and label='yo bien' then 'estoy bien'
 else deafapp_private.canonical_sign_label(p_category,label) end as id from labels)
 select coalesce((select c.class_id from deafapp_private.recognition_catalog c where c.comparison_key=translate(n.id,'áéíóúü','aeiouu')),n.id) from normalized n;
$$;

-- Search the current label even when the reviewed source keeps its original one.
create or replace function deafapp_private.list_recordings(p_token text,p_status text,p_query text,p_offset integer,p_limit integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_rows jsonb;v_counts jsonb;v_total bigint;query text;
begin
 perform deafapp_private.require_admin(p_token);
 if p_status is null or p_status not in ('pending','approved','rejected','all') or p_offset is null or p_offset<0 or p_offset>1000000
  or p_limit is null or p_limit<1 or p_limit>50 or length(coalesce(p_query,''))>120 then
  raise exception using errcode='22023',message='INVALID_FILTER';end if;
 query:=lower(deafapp_private.canonical_sign_label('verbos',coalesce(p_query,'')));
 select jsonb_build_object('pending',count(*) filter(where moderation_status='pending'),
 'approved',count(*) filter(where moderation_status='approved'),'rejected',count(*) filter(where moderation_status='rejected')) into v_counts from public.grabaciones;
 select count(*) into v_total from public.grabaciones where (p_status='all' or moderation_status=p_status)
  and strpos(lower(coalesce(deafapp_private.canonical_sign_label(categoria,label),'')||' '||coalesce(categoria,'')),query)>0;
 select coalesce(jsonb_agg(jsonb_build_object('id',id::text,'label',label,'category',categoria,'path',archivo_path,
  'status',moderation_status,'version',moderation_version,'createdAt',timestamp) order by id desc),'[]'::jsonb) into v_rows
 from(select * from public.grabaciones where (p_status='all' or moderation_status=p_status)
  and strpos(lower(coalesce(deafapp_private.canonical_sign_label(categoria,label),'')||' '||coalesce(categoria,'')),query)>0
  order by id desc offset p_offset limit p_limit) r;
 return jsonb_build_object('ok',true,'rows',v_rows,'counts',v_counts,'total',v_total,'variantCounts',
  (select jsonb_build_object('pending',coalesce(sum(quantity) filter(where status='pending'),0),
   'approved',coalesce(sum(quantity) filter(where status='approved'),0),'rejected',coalesce(sum(quantity) filter(where status='rejected'),0)) from deafapp_private.recording_variant_batches));
end $$;
notify pgrst,'reload schema';
