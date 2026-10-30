-- Run after the migration, in a transaction that always rolls back. Uses isolated fixture IDs only.
begin;
do $test$
declare b jsonb; bid uuid; before_revision bigint; result jsonb; job uuid:=extensions.gen_random_uuid();
begin
 insert into public.grabaciones(id,label,categoria,archivo_path,moderation_status,moderation_version,aprobada) values
 (900000000001,'hola','saludos','qa/variant-one.json','pending',0,false),
 (900000000002,'hola','saludos','qa/variant-two.json','approved',0,true),
 (900000000003,'hola','saludos','qa/variant-three.json','approved',0,true);
 update public.grabaciones set aprobada=true,moderation_status='approved' where id in (900000000002,900000000003);
 b:=deafapp_private.create_recording_variants('af123456-1234-4234-a234-123456789001','[{"id":"900000000001","version":0}]',50);bid:=(b->'batch'->>'id')::uuid;
 assert (select count(*) from deafapp_private.recording_variants where batch_id=bid)=50,'one original creates 50';
 assert b->'batch'->>'status'='pending';
 assert (deafapp_private.create_recording_variants('af123456-1234-4234-a234-123456789001','[{"id":"900000000001","version":0}]',50)->>'alreadyCreated')::boolean;
 begin perform deafapp_private.review_recording_variants(bid,0,'approved','[{"id":"900000000001","version":0}]');raise exception 'unapproved accepted';exception when serialization_failure then null;end;
 begin perform deafapp_private.review_recording_variants(bid,0,'approved',null);raise exception 'null parents accepted';exception when invalid_parameter_value then null;end;
 begin perform deafapp_private.create_recording_variants(extensions.gen_random_uuid(),'[{"id":"900000000001"}]',50);raise exception 'missing version accepted';exception when serialization_failure then null;end;
 update public.grabaciones set aprobada=true,moderation_status='approved',moderation_version=1 where id=900000000001;
 select deafapp_private.variant_batch(row) into b from deafapp_private.recording_variant_batches row where id=bid;
 assert (b->>'version')::integer=1 and (b->>'inheritApproval')::boolean,'approval inherited after original review';
 assert b->>'status'='approved';
 assert (select min(source_version)=1 from deafapp_private.recording_variants where batch_id=bid);
 select catalog_revision into before_revision from deafapp_private.recognition_runtime;
 update public.grabaciones set aprobada=false,moderation_status='pending',moderation_version=2 where id=900000000001;
 assert (select status='pending' and version=2 from deafapp_private.recording_variant_batches where id=bid),'source withdrawal invalidates';
 assert (select catalog_revision>before_revision from deafapp_private.recognition_runtime);
 begin perform deafapp_private.review_recording_variants(bid,1,'approved','[{"id":"900000000001","version":1}]');raise exception 'stale review accepted';exception when serialization_failure then null;end;
 b:=deafapp_private.create_recording_variants(extensions.gen_random_uuid(),'[{"id":"900000000002","version":0}]',100);
 assert (select count(*) from deafapp_private.recording_variants where batch_id=(b->'batch'->>'id')::uuid)=100;
 b:=deafapp_private.create_recording_variants(extensions.gen_random_uuid(),'[{"id":"900000000001","version":2},{"id":"900000000002","version":0},{"id":"900000000003","version":0}]',100);
 assert (select count(distinct parent_id) from deafapp_private.recording_variants where batch_id=(b->'batch'->>'id')::uuid)=3;

 b:=deafapp_private.create_recording_variants(extensions.gen_random_uuid(),'[{"id":"900000000002","version":0}]',50);bid:=(b->'batch'->>'id')::uuid;
 perform deafapp_private.review_recording_variants(bid,0,'approved','[{"id":"900000000002","version":0}]');
 insert into deafapp_private.recognition_features(source_id,source_version,source_path,class_id,feature,expires_at)
 values(900000000002,0,'qa/variant-two.json','saludos/hola','{"hash":"qa-hash","sequenceValid":true}',now()+interval '1 day');
 update deafapp_private.recognition_runtime set lease_id=job,lease_until=now()+interval '1 minute';
 result:=public.deafapp_runtime_variants(job);
 assert (select count(*) from jsonb_array_elements(result->'rows') r where r->>'parentId'='900000000002')=2,'bounded positive and negative variants';
 assert (select bool_and(r->>'parentHash'='qa-hash') from jsonb_array_elements(result->'rows') r where r->>'parentId'='900000000002');
 update deafapp_private.recognition_features set expires_at=now()-interval '1 second' where source_id=900000000002;
 result:=public.deafapp_runtime_variants(job);
 assert not exists(select 1 from jsonb_array_elements(result->'rows') r where r->>'parentId'='900000000002'),'expired parent excluded';
 update public.grabaciones set aprobada=false,moderation_status='pending',moderation_version=1 where id=900000000002;
 result:=public.deafapp_runtime_variants(job);
 assert not exists(select 1 from jsonb_array_elements(result->'rows') r where r->>'parentId'='900000000002'),'withdrawn parent excluded';

 b:=deafapp_private.create_recording_variants(extensions.gen_random_uuid(),'[{"id":"900000000003","version":0}]',100);bid:=(b->'batch'->>'id')::uuid;
 assert b->'batch'->>'status'='approved','approved original creates approved variants immediately';
 perform deafapp_private.review_recording_variants(bid,0,'rejected','[]');
 update public.grabaciones set moderation_version=1 where id=900000000003;
 assert (select status='rejected' and not inherit_approval from deafapp_private.recording_variant_batches where id=bid),'manual rejection respected';
 b:=deafapp_private.create_recording_variants(extensions.gen_random_uuid(),'[{"id":"900000000003","version":1}]',50);bid:=(b->'batch'->>'id')::uuid;
 update public.grabaciones set archivo_path='qa/replaced-original.json',moderation_version=2 where id=900000000003;
 assert (select status='pending' from deafapp_private.recording_variant_batches where id=bid),'replaced video does not inherit approval';

 b:=deafapp_private.create_recording_variants(extensions.gen_random_uuid(),'[{"id":"900000000001","version":2},{"id":"900000000002","version":1},{"id":"900000000003","version":2}]',100);bid:=(b->'batch'->>'id')::uuid;
 assert b->'batch'->>'status'='pending';
 update public.grabaciones set aprobada=true,moderation_status='approved',moderation_version=3 where id=900000000001;
 assert (select status='pending' from deafapp_private.recording_variant_batches where id=bid),'all originals required';
 update public.grabaciones set aprobada=true,moderation_status='approved',moderation_version=2 where id=900000000002;
 assert (select status='approved' from deafapp_private.recording_variant_batches where id=bid),'all originals approved';
 assert not has_function_privilege('anon','deafapp_private.inherit_variant_approval(uuid)','execute');
 assert not has_function_privilege('anon','deafapp_private.create_recording_variants(uuid,jsonb,integer)','execute');
 assert not has_table_privilege('anon','deafapp_private.recording_variants','select');
 assert not has_function_privilege('authenticated','public.deafapp_runtime_variants(uuid,integer)','execute');
 begin perform public.deafapp_admin_variant_list('invalid');raise exception 'auth bypass';exception when invalid_authorization_specification then null;end;
end $test$;
select 'passed: inherited approval, pending originals, explicit decisions, replacement, expiry, versions, idempotency and permissions' as result;
rollback;
