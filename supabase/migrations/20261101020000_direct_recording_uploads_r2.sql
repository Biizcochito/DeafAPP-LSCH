-- Public capture keeps the same consent and moderation flow. Only this private
-- service transaction can connect a verified R2 upload to its recording row.
alter table deafapp_private.recording_objects alter column original_object_id drop not null;
alter table deafapp_private.recording_objects alter column original_etag drop not null;
alter table deafapp_private.recording_objects alter column original_updated_at drop not null;
create table if not exists deafapp_private.recording_uploads (
 path text primary key, content_hash text not null check(content_hash ~ '^[a-f0-9]{64}$'),
 recording_id text not null, category text not null, label text not null, consent_id text not null,
 token text not null default encode(extensions.gen_random_bytes(32),'hex'),
 submitted_at timestamptz not null default clock_timestamp(), sha256 text,
 bytes bigint check(bytes between 1 and 40000000), verified_at timestamptz, source_id bigint references public.grabaciones(id) on delete cascade
);
alter table deafapp_private.recording_uploads enable row level security;
revoke all on deafapp_private.recording_uploads from public,anon,authenticated;

create or replace function public.deafapp_recording_upload_reserve(p_path text,p_hash text,p_category text,p_label text,p_recording_id text,p_consent_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u deafapp_private.recording_uploads;
begin
 if p_path is null or length(p_path)>512 or p_recording_id !~ '^[A-Za-z0-9_-]{1,120}$' or p_category !~ '^[a-z_]+$' or
   p_path<>p_category||'/'||p_label||'/'||p_label||'_'||p_recording_id||'.json' or p_path ~ '[%?#\\[:cntrl:]]' or
   p_label ~ '[/\\]' or p_label in ('.','..') or p_hash !~ '^[a-f0-9]{64}$' or p_consent_id !~ '^[A-Za-z0-9_-]{1,120}$' then
   raise exception 'Invalid upload' using errcode='22023';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_path,1101));
 select * into u from deafapp_private.recording_uploads where path=p_path for update;
 if found then
   if u.content_hash<>p_hash or u.consent_id<>p_consent_id then raise exception 'Upload changed' using errcode='40001';end if;
 else
   if exists(select 1 from public.grabaciones where archivo_path=p_path) then raise exception 'Path already registered' using errcode='40001';end if;
   if not exists(select 1 from deafapp_private.recognition_catalog where category=p_category and label=p_label and collection_enabled) then
     raise exception 'Collection disabled' using errcode='22023';end if;
   insert into deafapp_private.recording_uploads(path,content_hash,recording_id,category,label,consent_id)
   values(p_path,p_hash,p_recording_id,p_category,p_label,p_consent_id) returning * into u;
 end if;
 return jsonb_build_object('ok',true,'token',u.token,'submittedAt',u.submitted_at,'committed',u.source_id is not null);
end $$;

create or replace function public.deafapp_recording_upload_ready(p_path text,p_token text,p_sha256 text,p_bytes bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u deafapp_private.recording_uploads;
begin
 select * into u from deafapp_private.recording_uploads where path=p_path and token=p_token for update;
 if not found or p_sha256 !~ '^[a-f0-9]{64}$' or p_bytes not between 1 and 40000000 then raise exception 'Invalid upload' using errcode='22023';end if;
 if u.sha256 is not null and (u.sha256<>p_sha256 or u.bytes<>p_bytes) then raise exception 'Upload changed' using errcode='40001';end if;
 update deafapp_private.recording_uploads set sha256=p_sha256,bytes=p_bytes,verified_at=clock_timestamp() where path=p_path;
 return jsonb_build_object('ok',true);
end $$;

create or replace function public.deafapp_recording_upload_complete(p_path text,p_token text,p_notice_version text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u deafapp_private.recording_uploads;g public.grabaciones;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_path,1101));
 select * into u from deafapp_private.recording_uploads where path=p_path and token=p_token for update;
 if not found or u.verified_at is null or p_notice_version is distinct from '2026-10-31-v2' then raise exception 'Invalid upload' using errcode='22023';end if;
 if u.source_id is not null then return jsonb_build_object('ok',true,'alreadySubmitted',true);end if;
 if exists(select 1 from public.grabaciones where archivo_path=p_path) then raise exception 'Path already registered' using errcode='40001';end if;
 insert into public.grabaciones(label,categoria,archivo_path) values(u.label,u.category,u.path) returning * into g;
 insert into deafapp_private.recording_objects(path,source_id,bucket,object_key,sha256,bytes,registered_source_version,state,read_verified_at,activated_at)
 values(u.path,g.id,'deafapp-grabaciones-privadas','contribuciones/'||u.path,u.sha256,u.bytes,g.moderation_version,'active',u.verified_at,clock_timestamp());
 update deafapp_private.recording_uploads set source_id=g.id where path=p_path;
 return jsonb_build_object('ok',true,'alreadySubmitted',false);
end $$;
create or replace function public.deafapp_recording_upload_location(p_path text,p_token text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u deafapp_private.recording_uploads;
begin
 select * into u from deafapp_private.recording_uploads where path=p_path and token=p_token;
 if not found or u.verified_at is null then raise exception 'Upload unavailable' using errcode='22023';end if;
 return jsonb_build_object('ok',true,'provider','r2','path',u.path,'bucket','deafapp-grabaciones-privadas','key','contribuciones/'||u.path,'sha256',u.sha256,'bytes',u.bytes);
end $$;
revoke all on function public.deafapp_recording_upload_reserve(text,text,text,text,text,text),public.deafapp_recording_upload_ready(text,text,text,bigint),public.deafapp_recording_upload_complete(text,text,text),public.deafapp_recording_upload_location(text,text) from public,anon,authenticated;
grant execute on function public.deafapp_recording_upload_reserve(text,text,text,text,text,text),public.deafapp_recording_upload_ready(text,text,text,bigint),public.deafapp_recording_upload_complete(text,text,text),public.deafapp_recording_upload_location(text,text) to service_role;
notify pgrst,'reload schema';
