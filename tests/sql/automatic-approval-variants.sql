-- Real public moderation RPC, isolated fixtures, no file uploads. Everything rolls back.
begin;
do $test$
declare token text:=encode(extensions.gen_random_bytes(32),'hex'); result jsonb; batch jsonb; pending_id uuid; rejected_id uuid; before_count integer;
begin
 insert into deafapp_private.admin_sessions(token_hash,expires_at)
 values(extensions.digest(token,'sha256'),clock_timestamp()+interval '5 minutes');
 insert into public.grabaciones(id,label,categoria,archivo_path) values
 (900000000101,'new','qa_auto_variants','qa/auto-101.json'),
 (900000000102,'new','qa_auto_variants','qa/auto-102.json'),
 (900000000103,'second','qa_auto_variants','qa/auto-103.json'),
 (900000000104,'with pending','qa_auto_variants','qa/auto-104.json'),
 (900000000105,'with pending','qa_auto_variants','qa/auto-105.json'),
 (900000000106,'with rejected','qa_auto_variants','qa/auto-106.json'),
 (900000000107,'no approval','qa_auto_variants','qa/auto-107.json'),
 (900000000108,'new','qa_other_variants','qa/auto-108.json');
 assert not exists(select 1 from deafapp_private.recording_variant_batches where class_id like 'qa_auto_variants/%'),'pending upload does not create variants';
 begin perform public.deafapp_admin_review('invalid','[{"id":"900000000101","version":0}]','approved');raise exception 'authentication bypass';exception when invalid_authorization_specification then null;end;
 -- Exercise the same anonymous-role, authenticated-token RPC used by the web.
 execute 'set local role anon';
 result:=public.deafapp_admin_review(token,'[{"id":"900000000101","version":0},{"id":"900000000102","version":0},{"id":"900000000103","version":0}]','approved');
 execute 'reset role';
 assert (result->>'automaticBatches')::integer=2 and (result->>'automaticVariants')::integer=100,'one batch per sign in bulk approval';
 assert (select count(*) from deafapp_private.recording_variant_batches where class_id='qa_auto_variants/new')=1;
 assert (select count(*) from deafapp_private.recording_variants v join deafapp_private.recording_variant_batches b on b.id=v.batch_id where b.class_id='qa_auto_variants/new')=50;
 assert (select bool_and(b.status='approved' and b.inherit_approval and b.parent_ids=array[900000000101::bigint]) from deafapp_private.recording_variant_batches b where b.class_id='qa_auto_variants/new');
 assert (select bool_and(v.source_version=g.moderation_version and v.source_path=g.archivo_path) from deafapp_private.recording_variants v join public.grabaciones g on g.id=v.parent_id where g.id=900000000101),'variants use the approved source version';
 result:=public.deafapp_admin_review(token,'[{"id":"900000000101","version":1}]','approved');
 assert (result->>'automaticVariants')::integer=0,'reapproval does not duplicate a batch';
 begin perform public.deafapp_admin_review(token,'[{"id":"900000000102","version":0}]','approved');raise exception 'stale version accepted';exception when serialization_failure then null;end;
 batch:=deafapp_private.create_recording_variants(extensions.gen_random_uuid(),'[{"id":"900000000104","version":0}]',50);pending_id:=(batch->'batch'->>'id')::uuid;
 result:=public.deafapp_admin_review(token,'[{"id":"900000000105","version":0}]','approved');
 assert (result->>'automaticVariants')::integer=0,'existing pending batch prevents another batch';
 assert (select status='pending' from deafapp_private.recording_variant_batches where id=pending_id),'a different approved source does not approve the pending original';
 result:=public.deafapp_admin_review(token,'[{"id":"900000000104","version":0}]','approved');
 assert (result->>'automaticVariants')::integer=0;
 assert (select status='approved' from deafapp_private.recording_variant_batches where id=pending_id),'existing batch inherits its actual original approval';
 batch:=deafapp_private.create_recording_variants(extensions.gen_random_uuid(),'[{"id":"900000000106","version":0}]',100);rejected_id:=(batch->'batch'->>'id')::uuid;
 perform deafapp_private.review_recording_variants(rejected_id,0,'rejected','[]');
 result:=public.deafapp_admin_review(token,'[{"id":"900000000106","version":0}]','approved');
 assert (result->>'automaticVariants')::integer=0;
 assert (select status='rejected' and not inherit_approval from deafapp_private.recording_variant_batches where id=rejected_id),'manual rejection is retained';
 result:=public.deafapp_admin_review(token,'[{"id":"900000000107","version":0}]','rejected');
 assert (result->>'automaticVariants')::integer=0;
 assert not exists(select 1 from deafapp_private.recording_variant_batches where class_id='qa_auto_variants/no approval');
 begin perform public.deafapp_admin_review(token,'[{"id":"900000000107","version":1},{"id":"900000000101","version":0}]','approved');raise exception 'partial batch committed';exception when serialization_failure then null;end;
 assert (select moderation_status='rejected' and moderation_version=1 from public.grabaciones where id=900000000107),'bulk conflicts are atomic';
 result:=public.deafapp_admin_review(token,'[{"id":"900000000108","version":0}]','approved');
 assert (result->>'automaticVariants')::integer=50,'homonyms in another category have independent batches';
 result:=public.deafapp_admin_review(token,'[{"id":"900000000101","version":2}]','rejected');
 assert (select b.status='pending' from deafapp_private.recording_variant_batches b where b.class_id='qa_auto_variants/new'),'withdrawing the original withdraws the inherited variants';
 assert (select count(*) from public.grabaciones where id between 900000000101 and 900000000108)=8,'variants do not create extra originals';
 assert not has_function_privilege('anon','deafapp_private.create_recording_variants(uuid,jsonb,integer)','execute');
 assert not has_table_privilege('anon','deafapp_private.recording_variants','insert');
end $test$;
rollback;
select 'passed: approval creates 50, authenticated web RPC, bulk deduplication, existing decisions, source versions, withdrawal, conflicts and permissions; all rolled back' as result;
