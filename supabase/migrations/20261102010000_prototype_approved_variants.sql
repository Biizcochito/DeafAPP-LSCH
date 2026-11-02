-- A reviewed original plus 50 distinct approved variants enables a public prototype.
-- The existing originals-only route and independent evaluation remain available.

create or replace function public.deafapp_runtime_variants(p_job uuid,p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if p_offset<0 or not exists(select 1 from deafapp_private.recognition_runtime where singleton and lease_id=p_job and lease_until>clock_timestamp()) then raise exception 'Job unavailable' using errcode='40001';end if;
 return jsonb_build_object('ok',true,'rows',(select coalesce(jsonb_agg(row_to_json(q)),'[]'::jsonb) from (
 select distinct on(v.parent_id,v.angle_degrees) v.parent_id::text as "parentId",f.feature->>'hash' as "parentHash",b.class_id as "classId",
 v.angle_degrees as "angleDegrees",b.id::text as "batchId",v.variant_index as "index",b.quantity as "batchQuantity"
 from deafapp_private.recording_variants v join deafapp_private.recording_variant_batches b on b.id=v.batch_id and b.status='approved'
 join public.grabaciones g on g.id=v.parent_id and g.aprobada and g.moderation_status='approved' and g.moderation_version=v.source_version and g.archivo_path=v.source_path
 join deafapp_private.recognition_features f on f.source_id=g.id and f.source_version=g.moderation_version and f.source_path=g.archivo_path and f.feature is not null
 where deafapp_private.variant_class(g.categoria,g.label)=b.class_id and (f.expires_at is null or f.expires_at>clock_timestamp())
 order by v.parent_id,v.angle_degrees,b.created_at,b.id,v.variant_index offset p_offset limit 500) q));
end $$;

create or replace function public.deafapp_admin_vocabulary_save(p_token text,p_entry jsonb,p_version integer,p_ack_prototype boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare c deafapp_private.recognition_catalog;old_row deafapp_private.recognition_catalog;
 category text;label text;class_id text;key text;metric jsonb;r deafapp_private.recognition_runtime;target text;seen text[];v_forms jsonb;form record;
begin
 perform deafapp_private.require_admin(p_token);
 category:=p_entry->>'category';label:=normalize(lower(regexp_replace(trim(p_entry->>'label'),'\s+',' ','g')),NFC);
 class_id:=category||'/'||label;key:=category||'/'||translate(label,'áéíóúü','aeiouu');
 if category is null or category !~ '^[a-z][a-z0-9_]{0,39}$' or label is null or length(label) not between 1 and 80 or label ~ '[[:cntrl:]/<>]' or
   p_entry->>'classId' is distinct from class_id or coalesce(p_entry->>'state','') not in ('collecting','testing','enabled','paused') or
   coalesce(p_entry->>'activationScope','') not in ('prototype','evaluated') or
   coalesce(p_entry->>'color','') !~ '^#[A-Fa-f0-9]{6}$' or length(coalesce(p_entry->>'displayLabel','')) not between 1 and 100 or
   length(coalesce(p_entry->>'categoryTitle','')) not between 1 and 80 or length(coalesce(p_entry->>'emoji',''))>20 or
   (p_entry->>'minimum')::integer not between 3 and 100 or (p_entry->>'recordingGoal')::integer not between (p_entry->>'minimum')::integer and 2000 or
   (p_entry->>'peopleGoal')::integer not between 1 and 200 then raise exception 'Invalid catalogue entry' using errcode='22023';end if;
 v_forms:=coalesce(p_entry->'forms','{}'::jsonb);
 if jsonb_typeof(v_forms)<>'object' or octet_length(v_forms::text)>2000 then raise exception 'Invalid forms' using errcode='22023';end if;
 for form in select * from jsonb_each(v_forms) loop
   if form.key not in ('yo','tu','el','ella','usted','nosotros','ellos','ellas','ustedes','regular') or
     (form.key='regular' and jsonb_typeof(form.value)<>'boolean') or
     (form.key<>'regular' and (jsonb_typeof(form.value)<>'string' or length(form.value#>>'{}') not between 1 and 80)) then raise exception 'Invalid forms' using errcode='22023';end if;
 end loop;
 select * into old_row from deafapp_private.recognition_catalog where recognition_catalog.class_id=class_id for update;
 if old_row.class_id is null and p_version<>-1 or old_row.class_id is not null and old_row.version<>p_version then raise exception 'Catalogue changed' using errcode='40001';end if;
 if exists(select 1 from deafapp_private.recognition_catalog where comparison_key=key and recognition_catalog.class_id<>class_id) then raise exception 'Duplicate catalogue entry' using errcode='23505';end if;
 target:=nullif(p_entry->>'aliasOf','');seen:=array[class_id];
 while target is not null loop
   if target=any(seen) then raise exception 'Alias cycle' using errcode='22023';end if;seen:=seen||target;
   select alias_of into target from deafapp_private.recognition_catalog where recognition_catalog.class_id=target;
   if not found then raise exception 'Alias unavailable' using errcode='22023';end if;
 end loop;
 if p_entry->>'state'='enabled' and (old_row.state is distinct from 'enabled' or old_row.activation_scope is distinct from p_entry->>'activationScope') then
   select * into r from deafapp_private.recognition_runtime where singleton;
   select value into metric from jsonb_array_elements(r.coverage) where value->>'classId'=class_id;
   if r.dirty or metric is null or (coalesce((metric->>'originals')::integer,0)<(p_entry->>'minimum')::integer and not
     (p_entry->>'activationScope'='prototype' and coalesce((metric->>'originals')::integer,0)>=1 and coalesce((metric->>'approvedVariants')::integer,0)>=50)) then raise exception 'Prepare enough reviewed recordings before enabling' using errcode='22023';end if;
   if p_entry->>'activationScope'='prototype' and not coalesce(p_ack_prototype,false) then raise exception 'Acknowledge prototype scope' using errcode='22023';end if;
   if p_entry->>'activationScope'='evaluated' and (metric#>>'{evaluation,scope}' is distinct from 'different-confirmed-people' or
     coalesce((metric#>>'{evaluation,samples}')::integer,0)<5 or coalesce((metric#>>'{evaluation,people}')::integer,0)<2 or
     coalesce((metric->>'confirmedPeople')::integer,0)<3 or coalesce((metric#>>'{evaluation,recall}')::numeric,0)<.8 or coalesce((metric#>>'{evaluation,precision}')::numeric,0)<.8)
     then raise exception 'Independent evaluation is still pending' using errcode='22023';end if;
 end if;
 insert into deafapp_private.recognition_catalog(class_id,category,label,comparison_key,display_label,category_title,color,emoji,collection_enabled,state,activation_scope,minimum_originals,recording_goal,people_goal,alias_of,forms,version)
 values(class_id,category,label,key,p_entry->>'displayLabel',p_entry->>'categoryTitle',p_entry->>'color',coalesce(p_entry->>'emoji','🤟'),
   coalesce((p_entry->>'collection')::boolean,false),p_entry->>'state',p_entry->>'activationScope',(p_entry->>'minimum')::integer,
   (p_entry->>'recordingGoal')::integer,(p_entry->>'peopleGoal')::integer,nullif(p_entry->>'aliasOf',''),v_forms,coalesce(old_row.version,-1)+1)
 on conflict on constraint recognition_catalog_pkey do update set display_label=excluded.display_label,category_title=excluded.category_title,color=excluded.color,
   emoji=excluded.emoji,collection_enabled=excluded.collection_enabled,state=excluded.state,activation_scope=excluded.activation_scope,
   minimum_originals=excluded.minimum_originals,recording_goal=excluded.recording_goal,people_goal=excluded.people_goal,alias_of=excluded.alias_of,forms=excluded.forms,
   version=excluded.version,updated_at=clock_timestamp() returning * into c;
 return jsonb_build_object('ok',true,'entry',deafapp_private.recognition_entry(c));
end $$;

create or replace function public.deafapp_runtime_complete(p_job uuid,p_catalog_revision bigint,p_source_revision bigint,p_result jsonb default null,p_error text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r deafapp_private.recognition_runtime;again boolean:=false;activated integer:=0;
begin
 select * into r from deafapp_private.recognition_runtime where singleton for update;
 if r.lease_id is distinct from p_job then raise exception 'Job unavailable' using errcode='40001';end if;
 if p_error is not null then
   update deafapp_private.recognition_runtime set lease_id=null,lease_until=null,retry_after=clock_timestamp()+interval '30 seconds',last_error=left(p_error,300) where singleton;
 elsif p_result is null or r.catalog_revision<>p_catalog_revision or r.source_revision<>p_source_revision then
   update deafapp_private.recognition_runtime set lease_id=null,lease_until=null,dirty=true where singleton;again:=true;
 else
   if octet_length(p_result::text)>50000000 then raise exception 'Prepared model too large' using errcode='22023';end if;
   -- Only server-prepared eligible learning samples count. A reserved/expired
   -- original or a withdrawn batch cannot enter these coverage counts.
   if exists(select 1 from deafapp_private.recognition_catalog c
     join jsonb_array_elements(coalesce(p_result->'coverage','[]'::jsonb)) m on m->>'classId'=c.class_id
     where c.state='collecting' and c.activation_scope='prototype' and c.alias_of is null
       and coalesce((m->>'autoEnable')::boolean,false) and coalesce((m->>'originals')::integer,0)>=1
       and coalesce((m->>'approvedVariants')::integer,0)>=50) then
     update deafapp_private.recognition_catalog c set state='enabled',version=c.version+1,updated_at=clock_timestamp()
     from jsonb_array_elements(p_result->'coverage') m
     where m->>'classId'=c.class_id and c.state='collecting' and c.activation_scope='prototype' and c.alias_of is null
       and coalesce((m->>'autoEnable')::boolean,false) and coalesce((m->>'originals')::integer,0)>=1
       and coalesce((m->>'approvedVariants')::integer,0)>=50;
     get diagnostics activated=row_count;
     -- The catalogue trigger advances the revision. Rebuild against it before
     -- publishing a packet so the public manifest and model always agree.
     update deafapp_private.recognition_runtime set lease_id=null,lease_until=null,dirty=true,retry_after=null where singleton;
     perform deafapp_private.recognition_wake();
     return jsonb_build_object('ok',true,'again',true,'autoEnabled',activated);
   end if;
   update deafapp_private.recognition_runtime set lease_id=null,lease_until=null,dirty=false,retry_after=null,last_error=null,
     packet=nullif(p_result->'packet','null'::jsonb),preview_packet=nullif(p_result->'previewPacket','null'::jsonb),coverage=coalesce(p_result->'coverage','[]'::jsonb),
     evaluation_pending=coalesce(p_result->'evaluationPlan','[]'::jsonb),evaluation_accumulator='{}'::jsonb,
     evaluation_total=jsonb_array_length(coalesce(p_result->'evaluationPlan','[]'::jsonb)),evaluation_done=0,
     model_id=p_result->>'modelId',model_expires_at=(p_result->>'expiresAt')::timestamptz,
     model_catalog_revision=p_catalog_revision,model_source_revision=p_source_revision,model_revision=model_revision+1,updated_at=clock_timestamp() where singleton;
   if jsonb_array_length(coalesce(p_result->'evaluationPlan','[]'::jsonb))>0 then again:=true;end if;
 end if;
 if again then perform deafapp_private.recognition_wake();end if;
 return jsonb_build_object('ok',true,'again',again);
end $$;

-- Rebuild existing approvals using the new rule, including already reviewed batches.
update deafapp_private.recognition_runtime set catalog_revision=catalog_revision+1,dirty=true,retry_after=null,updated_at=clock_timestamp() where singleton;
select deafapp_private.recognition_wake();
notify pgrst,'reload schema';
