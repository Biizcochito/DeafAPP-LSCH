-- Run only in the DeafApp project's SQL editor. No password or service key is shipped to the browser.
begin;
create schema if not exists deafapp_private;
revoke all on schema deafapp_private from public;
grant usage on schema deafapp_private to anon, authenticated;
create extension if not exists pgcrypto with schema extensions;

create table if not exists deafapp_private.admin_config (
  singleton boolean primary key default true check (singleton),
  password_hash text,
  failed_attempts integer not null default 0,
  failure_window timestamptz,
  locked_until timestamptz
);
insert into deafapp_private.admin_config(singleton) values (true) on conflict do nothing;
create table if not exists deafapp_private.admin_sessions (
  token_hash bytea primary key,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create table if not exists deafapp_private.moderation_audit (
  id bigint generated always as identity primary key,
  recording_id text not null,
  previous_status text not null,
  new_status text not null,
  actor_hash bytea not null,
  reviewed_at timestamptz not null default now()
);
create table if not exists deafapp_private.admin_data (
  name text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table deafapp_private.admin_config enable row level security;
alter table deafapp_private.admin_sessions enable row level security;
alter table deafapp_private.moderation_audit enable row level security;
alter table deafapp_private.admin_data enable row level security;
revoke all on all tables in schema deafapp_private from public, anon, authenticated;
revoke all on all sequences in schema deafapp_private from public, anon, authenticated;
alter default privileges in schema deafapp_private revoke all on tables from public, anon, authenticated;
alter default privileges in schema deafapp_private revoke all on functions from public, anon, authenticated;

alter table public.grabaciones add column if not exists moderation_status text;
alter table public.grabaciones add column if not exists moderation_version integer not null default 0;
alter table public.grabaciones add column if not exists moderated_at timestamptz;
update public.grabaciones set moderation_status = case when aprobada is true then 'approved'
  when coalesce(votos_negativos,0) - coalesce(votos_positivos,0) >= 2 then 'rejected' else 'pending' end
  where moderation_status is null;
alter table public.grabaciones alter column moderation_status set default 'pending';
alter table public.grabaciones alter column moderation_status set not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.grabaciones'::regclass and conname='deafapp_moderation_state') then
    alter table public.grabaciones add constraint deafapp_moderation_state check (
      moderation_status in ('pending','approved','rejected') and coalesce(aprobada,false) = (moderation_status='approved')
    );
  end if;
end $$;

-- Supabase's public client may contribute, but may never set a review decision or votes.
revoke insert, update, delete on public.grabaciones from public, anon, authenticated;
do $$ declare c record; begin
  for c in select column_name from information_schema.columns where table_schema='public' and table_name='grabaciones' loop
    execute format('revoke insert (%I), update (%I) on public.grabaciones from public, anon, authenticated', c.column_name, c.column_name);
  end loop;
end $$;
grant insert (label,categoria,archivo_path) on public.grabaciones to anon, authenticated;
grant select on public.grabaciones to anon, authenticated;
grant usage on sequence public.grabaciones_id_seq to anon, authenticated;
alter table public.grabaciones enable row level security;
drop policy if exists "Permitir actualizar votos anonimos" on public.grabaciones;

create or replace function deafapp_private.initialize_recording()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  new.aprobada := false; new.validada := false; new.visible := false;
  new.votos_positivos := 0; new.votos_negativos := 0;
  new.moderation_status := 'pending'; new.moderation_version := 0; new.moderated_at := null;
  return new;
end $$;
drop trigger if exists deafapp_initial_review on public.grabaciones;
create trigger deafapp_initial_review before insert on public.grabaciones for each row execute function deafapp_private.initialize_recording();

create or replace function deafapp_private.require_admin(p_token text)
returns bytea language plpgsql security invoker set search_path='' as $$
declare v_hash bytea;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception using errcode='28000', message='ADMIN_SESSION_EXPIRED'; end if;
  v_hash := extensions.digest(p_token,'sha256');
  if not exists (select 1 from deafapp_private.admin_sessions where token_hash=v_hash and expires_at>clock_timestamp()) then
    raise exception using errcode='28000', message='ADMIN_SESSION_EXPIRED';
  end if;
  return v_hash;
end $$;

-- Only these narrow private handlers have owner privileges. Every operation checks the issued session.
create or replace function deafapp_private.login(p_password text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_config deafapp_private.admin_config%rowtype; v_token text; v_expiry timestamptz;
begin
  select * into v_config from deafapp_private.admin_config where singleton for update;
  if v_config.password_hash is null then return jsonb_build_object('ok',false,'code','not_configured'); end if;
  if v_config.locked_until>clock_timestamp() then return jsonb_build_object('ok',false,'code','rate_limited'); end if;
  if v_config.failure_window is null or v_config.failure_window<clock_timestamp()-interval '10 minutes' then
    update deafapp_private.admin_config set failed_attempts=0,failure_window=clock_timestamp(),locked_until=null where singleton;
    v_config.failed_attempts := 0;
  end if;
  if p_password is null or octet_length(p_password)>72 or octet_length(p_password)=0 or extensions.crypt(p_password,v_config.password_hash)<>v_config.password_hash then
    update deafapp_private.admin_config set failed_attempts=failed_attempts+1,
      locked_until=case when failed_attempts+1>=5 then clock_timestamp()+interval '2 minutes' else null end where singleton;
    -- Returning an error value commits the failure counter; raising would roll it back.
    return jsonb_build_object('ok',false,'code','invalid_password');
  end if;
  update deafapp_private.admin_config set failed_attempts=0,failure_window=null,locked_until=null where singleton;
  delete from deafapp_private.admin_sessions where expires_at<=clock_timestamp();
  v_token := encode(extensions.gen_random_bytes(32),'hex'); v_expiry := clock_timestamp()+interval '2 hours';
  insert into deafapp_private.admin_sessions(token_hash,expires_at) values (extensions.digest(v_token,'sha256'),v_expiry);
  return jsonb_build_object('ok',true,'token',v_token,'expiresAt',v_expiry);
end $$;

create or replace function deafapp_private.list_recordings(p_token text,p_status text,p_query text,p_offset integer,p_limit integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_rows jsonb; v_counts jsonb; v_total bigint;
begin
  perform deafapp_private.require_admin(p_token);
  if p_status is null or p_status not in ('pending','approved','rejected','all') or p_offset is null or p_offset<0 or p_offset>1000000
    or p_limit is null or p_limit<1 or p_limit>50 or length(coalesce(p_query,''))>120 then
    raise exception using errcode='22023',message='INVALID_FILTER';
  end if;
  select jsonb_build_object('pending',count(*) filter(where moderation_status='pending'),
    'approved',count(*) filter(where moderation_status='approved'),'rejected',count(*) filter(where moderation_status='rejected'))
    into v_counts from public.grabaciones;
  select count(*) into v_total from public.grabaciones where (p_status='all' or moderation_status=p_status)
    and (coalesce(p_query,'')='' or strpos(lower(coalesce(label,'')||' '||coalesce(categoria,'')),lower(p_query))>0);
  select coalesce(jsonb_agg(jsonb_build_object('id',id::text,'label',label,'category',categoria,'path',archivo_path,
    'status',moderation_status,'version',moderation_version,'createdAt',timestamp) order by id desc),'[]'::jsonb) into v_rows
    from (select * from public.grabaciones where (p_status='all' or moderation_status=p_status)
      and (coalesce(p_query,'')='' or strpos(lower(coalesce(label,'')||' '||coalesce(categoria,'')),lower(p_query))>0)
      order by id desc offset p_offset limit p_limit) r;
  return jsonb_build_object('ok',true,'rows',v_rows,'counts',v_counts,'total',v_total);
end $$;

create or replace function deafapp_private.review_recordings(p_token text,p_items jsonb,p_status text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor bytea; v_count integer; v_expected integer; v_old record;
begin
  v_actor := deafapp_private.require_admin(p_token);
  if p_status is null or p_status not in ('pending','approved','rejected') or jsonb_typeof(p_items) is distinct from 'array' then
    raise exception using errcode='22023',message='INVALID_REVIEW';
  end if;
  v_expected := jsonb_array_length(p_items);
  if v_expected<1 or v_expected>50 or exists (select 1 from jsonb_array_elements(p_items) x where
    jsonb_typeof(x) is distinct from 'object' or (x->>'id') is null or (x->>'id') !~ '^[0-9]{1,20}$'
    or jsonb_typeof(x->'version') is distinct from 'number' or (x->>'version') !~ '^[0-9]{1,9}$') then
    raise exception using errcode='22023',message='INVALID_REVIEW';
  end if;
  if (select count(distinct x->>'id') from jsonb_array_elements(p_items) x)<>v_expected then
    raise exception using errcode='22023',message='DUPLICATE_REVIEW';
  end if;
  v_count := 0;
  for v_old in select g.* from public.grabaciones g join jsonb_to_recordset(p_items) as x(id text,version integer) on g.id::text=x.id order by g.id for update of g loop
    if v_old.moderation_version<>(select x.version from jsonb_to_recordset(p_items) as x(id text,version integer) where x.id=v_old.id::text) then
      raise exception using errcode='40001',message='REVIEW_CONFLICT';
    end if;
    v_count := v_count+1;
  end loop;
  if v_count<>v_expected then raise exception using errcode='40001',message='RECORDING_NOT_FOUND'; end if;
  insert into deafapp_private.moderation_audit(recording_id,previous_status,new_status,actor_hash)
    select g.id::text,g.moderation_status,p_status,v_actor from public.grabaciones g
    join jsonb_to_recordset(p_items) as x(id text,version integer) on g.id::text=x.id;
  update public.grabaciones g set moderation_status=p_status,aprobada=(p_status='approved'),
    validada=(p_status='approved'),visible=(p_status='approved'),moderation_version=g.moderation_version+1,moderated_at=clock_timestamp()
    from jsonb_to_recordset(p_items) as x(id text,version integer) where g.id::text=x.id;
  return jsonb_build_object('ok',true,'changed',v_count,'status',p_status);
end $$;

create or replace function deafapp_private.overview(p_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_data jsonb;
begin
  perform deafapp_private.require_admin(p_token);
  select value into v_data from deafapp_private.admin_data where name='preparation';
  return jsonb_build_object('ok',true,'preparation',v_data,'checkedAt',clock_timestamp());
end $$;
create or replace function deafapp_private.logout(p_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if p_token ~ '^[a-f0-9]{64}$' then delete from deafapp_private.admin_sessions where token_hash=extensions.digest(p_token,'sha256'); end if;
  return jsonb_build_object('ok',true);
end $$;

-- Exposed wrappers run as the caller; all table privileges stay inside the private, validated handlers.
create or replace function public.deafapp_admin_login(p_password text) returns jsonb language sql security invoker set search_path='' as $$ select deafapp_private.login(p_password); $$;
create or replace function public.deafapp_admin_list(p_token text,p_status text default 'pending',p_query text default '',p_offset integer default 0,p_limit integer default 25) returns jsonb language sql security invoker set search_path='' as $$ select deafapp_private.list_recordings(p_token,p_status,p_query,p_offset,p_limit); $$;
create or replace function public.deafapp_admin_review(p_token text,p_items jsonb,p_status text) returns jsonb language sql security invoker set search_path='' as $$ select deafapp_private.review_recordings(p_token,p_items,p_status); $$;
create or replace function public.deafapp_admin_overview(p_token text) returns jsonb language sql security invoker set search_path='' as $$ select deafapp_private.overview(p_token); $$;
create or replace function public.deafapp_admin_logout(p_token text) returns jsonb language sql security invoker set search_path='' as $$ select deafapp_private.logout(p_token); $$;
revoke all on all functions in schema deafapp_private from public, anon, authenticated;
revoke all on function public.deafapp_admin_login(text),public.deafapp_admin_list(text,text,text,integer,integer),public.deafapp_admin_review(text,jsonb,text),public.deafapp_admin_overview(text),public.deafapp_admin_logout(text) from public,anon,authenticated;
grant execute on function deafapp_private.login(text),deafapp_private.list_recordings(text,text,text,integer,integer),deafapp_private.review_recordings(text,jsonb,text),deafapp_private.overview(text),deafapp_private.logout(text) to anon,authenticated;
grant execute on function public.deafapp_admin_login(text),public.deafapp_admin_list(text,text,text,integer,integer),public.deafapp_admin_review(text,jsonb,text),public.deafapp_admin_overview(text),public.deafapp_admin_logout(text) to anon,authenticated;
notify pgrst,'reload schema';
commit;
