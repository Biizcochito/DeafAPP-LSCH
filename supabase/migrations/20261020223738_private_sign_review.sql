-- Los metadatos y decisiones permanecen privados; cada RPC exige una sesión del administrador.
create table deafapp_private.sign_review_candidates (
  key text primary key check (key ~ '^[A-Za-z0-9_-]{11}@[0-9]{1,12}$'),
  video_id text not null check (video_id ~ '^[A-Za-z0-9_-]{11}$' and split_part(key,'@',1)=video_id),
  start_seconds double precision not null check (start_seconds>=0 and start_seconds<86400),
  end_seconds double precision not null check (end_seconds>start_seconds and end_seconds<=86400),
  proposed_label text check (length(proposed_label) between 1 and 80),
  confidence double precision not null check (confidence between 0 and 1),
  metadata jsonb not null check (jsonb_typeof(metadata)='object' and octet_length(metadata::text)<=12000),
  priority boolean not null default false,
  source_commit text not null check (source_commit ~ '^[a-f0-9]{40}$'),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  confirmed_label text,
  version integer not null default 0 check (version>=0),
  reviewed_at timestamptz,
  reviewed_by bytea,
  check ((status='approved' and confirmed_label is not null and length(confirmed_label) between 1 and 80) or (status<>'approved' and confirmed_label is null))
);
create index sign_review_queue on deafapp_private.sign_review_candidates (priority,status,confidence desc,key);
create table deafapp_private.sign_review_decisions (
  candidate_key text not null references deafapp_private.sign_review_candidates(key),
  version integer not null,
  status text not null,
  label text,
  reviewed_at timestamptz not null default clock_timestamp(),
  reviewed_by bytea not null,
  primary key(candidate_key,version)
);
alter table deafapp_private.sign_review_candidates enable row level security;
alter table deafapp_private.sign_review_decisions enable row level security;
revoke all on deafapp_private.sign_review_candidates,deafapp_private.sign_review_decisions from public,anon,authenticated;

create function deafapp_private.sign_review_list(p_token text,p_scope text,p_status text,p_query text,p_offset integer,p_limit integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_rows jsonb;v_total bigint;v_counts jsonb;v_config jsonb;v_query text;
begin
  perform deafapp_private.require_admin(p_token);
  if p_scope is null or p_scope not in ('visible','all') or p_status is null or p_status not in ('all','pending','approved','rejected') or p_offset is null or p_offset<0 or p_offset>10000 or p_limit is null or p_limit<1 or p_limit>25 or p_query is null or length(p_query)>120 then
    raise exception 'Invalid review filters' using errcode='22023';
  end if;
  v_query:=lower(trim(p_query));
  select value into v_config from deafapp_private.admin_data where name='sign-review-config';
  select jsonb_build_object('total',count(*),'visible',count(*) filter(where priority),'pending',count(*) filter(where status='pending'),'approved',count(*) filter(where status='approved'),'rejected',count(*) filter(where status='rejected')) into v_counts from deafapp_private.sign_review_candidates;
  select count(*) into v_total from deafapp_private.sign_review_candidates
  where (p_scope='all' or priority) and (p_status='all' or status=p_status)
    and (v_query='' or position(v_query in lower(concat_ws(' ',coalesce(confirmed_label,proposed_label),metadata->>'title',metadata->>'channel')))>0);
  select coalesce(jsonb_agg(to_jsonb(r) order by r.priority desc,r."hasProposal" desc,r.confidence desc,r.key),'[]'::jsonb) into v_rows from (
    select key,video_id as "videoId",start_seconds as start,end_seconds as "end",proposed_label as "proposedLabel",confirmed_label as "confirmedLabel",confidence,priority,status,version,reviewed_at as "reviewedAt",metadata,proposed_label is not null as "hasProposal"
    from deafapp_private.sign_review_candidates
    where (p_scope='all' or priority) and (p_status='all' or status=p_status)
      and (v_query='' or position(v_query in lower(concat_ws(' ',coalesce(confirmed_label,proposed_label),metadata->>'title',metadata->>'channel')))>0)
    order by priority desc,(proposed_label is not null) desc,confidence desc,key offset p_offset limit p_limit
  ) r;
  return jsonb_build_object('ok',true,'rows',v_rows,'total',v_total,'counts',v_counts,'labels',coalesce(v_config->'labels','[]'::jsonb),'visibleLabels',coalesce(v_config->'visibleLabels','[]'::jsonb));
end $$;

create function deafapp_private.sign_review_decide(p_token text,p_key text,p_version integer,p_status text,p_label text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_hash bytea;v_config jsonb;v_row deafapp_private.sign_review_candidates;
begin
  v_hash:=deafapp_private.require_admin(p_token);
  if p_key is null or p_key !~ '^[A-Za-z0-9_-]{11}@[0-9]{1,12}$' or p_version is null or p_version<0 or p_status is null or p_status not in ('pending','approved','rejected') or (p_status<>'approved' and p_label is not null) then
    raise exception 'Invalid review decision' using errcode='22023';
  end if;
  select value into v_config from deafapp_private.admin_data where name='sign-review-config';
  if p_status='approved' and (p_label is null or length(p_label)>80 or not coalesce((v_config->'labels') ? p_label,false)) then
    raise exception 'Select a catalogue label' using errcode='22023';
  end if;
  update deafapp_private.sign_review_candidates set status=p_status,confirmed_label=case when p_status='approved' then p_label else null end,
    priority=coalesce((v_config->'visibleLabels') ? (case when p_status='approved' then p_label else proposed_label end),false),
    version=version+1,reviewed_at=clock_timestamp(),reviewed_by=v_hash
  where key=p_key and version=p_version returning * into v_row;
  if not found then
    if exists(select 1 from deafapp_private.sign_review_candidates where key=p_key) then raise exception 'Review changed; reload it' using errcode='40001'; end if;
    raise exception 'Candidate unavailable' using errcode='22023';
  end if;
  insert into deafapp_private.sign_review_decisions(candidate_key,version,status,label,reviewed_by) values(v_row.key,v_row.version,v_row.status,v_row.confirmed_label,v_hash);
  return jsonb_build_object('ok',true,'key',v_row.key,'version',v_row.version,'status',v_row.status,'label',v_row.confirmed_label,'reviewedAt',v_row.reviewed_at);
end $$;

create function deafapp_private.sign_review_export(p_token text,p_scope text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_decisions jsonb;
begin
  perform deafapp_private.require_admin(p_token);
  if p_scope is null or p_scope not in ('visible','all') then raise exception 'Invalid review scope' using errcode='22023'; end if;
  select coalesce(jsonb_object_agg(key,case when status='approved' then confirmed_label else 'descartar' end),'{}'::jsonb) into v_decisions
  from deafapp_private.sign_review_candidates where status<>'pending' and (p_scope='all' or priority);
  return jsonb_build_object('ok',true,'decisions',v_decisions,'scope',p_scope,'exportedAt',clock_timestamp());
end $$;

create function public.deafapp_admin_sign_review_list(p_token text,p_scope text,p_status text,p_query text,p_offset integer,p_limit integer)
returns jsonb language sql security invoker set search_path='' as $$ select deafapp_private.sign_review_list(p_token,p_scope,p_status,p_query,p_offset,p_limit); $$;
create function public.deafapp_admin_sign_review_decide(p_token text,p_key text,p_version integer,p_status text,p_label text)
returns jsonb language sql security invoker set search_path='' as $$ select deafapp_private.sign_review_decide(p_token,p_key,p_version,p_status,p_label); $$;
create function public.deafapp_admin_sign_review_export(p_token text,p_scope text)
returns jsonb language sql security invoker set search_path='' as $$ select deafapp_private.sign_review_export(p_token,p_scope); $$;
revoke all on function deafapp_private.sign_review_list(text,text,text,text,integer,integer),deafapp_private.sign_review_decide(text,text,integer,text,text),deafapp_private.sign_review_export(text,text),public.deafapp_admin_sign_review_list(text,text,text,text,integer,integer),public.deafapp_admin_sign_review_decide(text,text,integer,text,text),public.deafapp_admin_sign_review_export(text,text) from public,anon,authenticated;
grant execute on function deafapp_private.sign_review_list(text,text,text,text,integer,integer),deafapp_private.sign_review_decide(text,text,integer,text,text),deafapp_private.sign_review_export(text,text),public.deafapp_admin_sign_review_list(text,text,text,text,integer,integer),public.deafapp_admin_sign_review_decide(text,text,integer,text,text),public.deafapp_admin_sign_review_export(text,text) to anon,authenticated;
notify pgrst,'reload schema';
