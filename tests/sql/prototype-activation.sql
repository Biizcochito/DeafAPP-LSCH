-- Transactional integration checks: fixtures, model changes and queued jobs roll back.
begin;
do $test$
declare r deafapp_private.recognition_runtime; job uuid:=extensions.gen_random_uuid(); result jsonb; prior_model text; batch jsonb; page_offset integer:=0; variant_count integer:=0;
begin
 insert into deafapp_private.recognition_catalog(class_id,category,label,comparison_key,display_label,category_title,state,activation_scope) values
 ('qa_variants/ready','qa_variants','ready','qa_variants/ready','ready','QA','collecting','prototype'),
 ('qa_variants/short','qa_variants','short','qa_variants/short','short','QA','collecting','prototype'),
 ('qa_variants/paused','qa_variants','paused','qa_variants/paused','paused','QA','paused','prototype'),
 ('qa_variants/testing','qa_variants','testing','qa_variants/testing','testing','QA','testing','prototype'),
 ('qa_variants/evaluated','qa_variants','evaluated','qa_variants/evaluated','evaluated','QA','collecting','evaluated');
 insert into deafapp_private.recognition_catalog(class_id,category,label,comparison_key,display_label,category_title,alias_of)
 values('qa_variants/alias','qa_variants','alias','qa_variants/alias','alias','QA','qa_variants/ready');
 insert into public.grabaciones(id,label,categoria,archivo_path,moderation_status,moderation_version,aprobada)
 values(900000000011,'ready','qa_variants','qa/prototype-original.json','approved',0,true);
 update public.grabaciones set aprobada=true,moderation_status='approved' where id=900000000011;
 batch:=deafapp_private.create_recording_variants(extensions.gen_random_uuid(),'[{"id":"900000000011","version":0}]',50);
 assert batch->'batch'->>'status'='approved';
 insert into deafapp_private.recognition_features(source_id,source_version,source_path,class_id,feature)
 values(900000000011,0,'qa/prototype-original.json','qa_variants/ready','{"hash":"qa-prototype-hash","sequenceValid":true}');
 update deafapp_private.recognition_runtime set lease_id=job,lease_until=clock_timestamp()+interval '1 minute' where singleton;
 loop
   result:=public.deafapp_runtime_variants(job,page_offset);
   variant_count:=variant_count+(select count(*) from jsonb_array_elements(result->'rows') v where v->>'parentId'='900000000011');
   exit when jsonb_array_length(result->'rows')<500;
   page_offset:=page_offset+500;assert page_offset<=200000,'bounded variant pagination';
 end loop;
 assert variant_count=50,'all 50 variants reach preparation';
 select * into r from deafapp_private.recognition_runtime where singleton;
 prior_model:=r.model_id;
 result:=public.deafapp_runtime_complete(job,r.catalog_revision,r.source_revision,jsonb_build_object('coverage',
 '[{"classId":"qa_variants/ready","originals":1,"approvedVariants":50,"autoEnable":true},
 {"classId":"qa_variants/short","originals":1,"approvedVariants":49,"autoEnable":true},
 {"classId":"qa_variants/paused","originals":1,"approvedVariants":50,"autoEnable":true},
 {"classId":"qa_variants/testing","originals":1,"approvedVariants":50,"autoEnable":true},
 {"classId":"qa_variants/evaluated","originals":1,"approvedVariants":50,"autoEnable":true},
 {"classId":"qa_variants/alias","originals":1,"approvedVariants":50,"autoEnable":true}]'::jsonb));
 assert (result->>'autoEnabled')::integer=1,'only the eligible collecting prototype activates';
 assert (select state='enabled' and version=1 from deafapp_private.recognition_catalog where class_id='qa_variants/ready');
 assert (select state='collecting' from deafapp_private.recognition_catalog where class_id='qa_variants/short');
 assert (select state='paused' from deafapp_private.recognition_catalog where class_id='qa_variants/paused');
 assert (select state='testing' from deafapp_private.recognition_catalog where class_id='qa_variants/testing');
 assert (select state='collecting' from deafapp_private.recognition_catalog where class_id='qa_variants/evaluated');
 assert (select state='collecting' from deafapp_private.recognition_catalog where class_id='qa_variants/alias');
 assert (select dirty and lease_id is null and model_id is not distinct from prior_model and catalog_revision>r.catalog_revision from deafapp_private.recognition_runtime where singleton),'new catalogue is rebuilt before its packet is published';
 -- Replaying an old catalogue/source revision must not activate anything.
 update deafapp_private.recognition_runtime set lease_id=job,lease_until=clock_timestamp()+interval '1 minute' where singleton;
 perform public.deafapp_runtime_complete(job,r.catalog_revision,r.source_revision,
 '{"coverage":[{"classId":"qa_variants/short","originals":1,"approvedVariants":50,"autoEnable":true}]}');
 assert (select state='collecting' from deafapp_private.recognition_catalog where class_id='qa_variants/short');
 assert not has_function_privilege('anon','public.deafapp_runtime_complete(uuid,bigint,bigint,jsonb,text)','execute');
 assert not has_function_privilege('authenticated','public.deafapp_runtime_variants(uuid,integer)','execute');
 begin perform public.deafapp_admin_vocabulary_save('invalid','{}',0);raise exception 'admin access bypass';exception when invalid_authorization_specification then null;end;
end $test$;
rollback;
select 'passed: one original, 50 approved variants, automatic prototype activation, protected states, revision consistency and permissions; all rolled back' as result;
