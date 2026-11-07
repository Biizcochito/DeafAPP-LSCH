-- Apply the migration in the SAME transaction before this file. Roll back all
-- fixtures and schema changes: this is a verification, not a deployment.
do $test$
declare token text:=encode(extensions.gen_random_bytes(32),'hex');class_id text;before_revision text;before_quality text;before_dirty boolean;result jsonb;entry jsonb;
begin
 insert into deafapp_private.admin_sessions(token_hash,expires_at) values(extensions.digest(token,'sha256'),clock_timestamp()+interval '5 minutes');
 select c.class_id into class_id from deafapp_private.recognition_catalog c where c.state='enabled' and c.alias_of is null order by c.class_id limit 1;
 assert class_id is not null,'an enabled class is required';
 before_revision:=public.deafapp_recognition_revision()->>'revision';before_quality:=public.deafapp_recognition_revision()->>'qualityRevision';
 select dirty into before_dirty from deafapp_private.recognition_runtime where singleton;
 begin perform public.deafapp_admin_recognition_quality_save(repeat('0',64),class_id,'high',0);raise exception 'unauthenticated write accepted';exception when invalid_authorization_specification then null;end;
 result:=public.deafapp_admin_recognition_quality_save(token,class_id,'high',0);
 assert result#>>'{qualityReview,manualLevel}'='high';assert result#>>'{qualityReview,manualVersion}'='1';
 assert public.deafapp_recognition_revision()->>'revision'=before_revision,'quality changes must not invalidate the model';
 assert public.deafapp_recognition_revision()->>'qualityRevision'<>before_quality,'quality changes must invalidate colors';
 assert (select dirty is not distinct from before_dirty from deafapp_private.recognition_runtime where singleton),'quality must not rebuild';
 begin perform public.deafapp_admin_recognition_quality_save(token,class_id,'low',0);raise exception 'stale review accepted';exception when serialization_failure then null;end;
 begin perform public.deafapp_admin_recognition_quality_save(token,class_id,'excellent',1);raise exception 'invalid level accepted';exception when invalid_parameter_value then null;end;
 result:=public.deafapp_admin_recognition_quality_save(token,class_id,null,1);
 assert result#>>'{qualityReview,manualLevel}' is null;assert result#>>'{qualityReview,manualVersion}'='2';
 update deafapp_private.recognition_runtime set dirty=false,model_expires_at=clock_timestamp()+interval '1 hour',evaluation_total=5,evaluation_done=5,
   coverage=jsonb_build_array(jsonb_build_object('classId',class_id,'privateSource','not-public','evaluation',jsonb_build_object('samples',5,'correct',4,'predicted',5,'scope','different-recordings','person','not-public')))
 where singleton;
 select value into entry from jsonb_array_elements(public.deafapp_recognition_manifest()->'quality') where value->>'classId'=class_id;
 assert entry#>>'{evaluation,samples}'='5';assert entry#>>'{evaluation,correct}'='4';
 assert position('not-public' in entry::text)=0,'only aggregate fields may be public';
 update deafapp_private.recognition_runtime set evaluation_done=4 where singleton;
 select value into entry from jsonb_array_elements(public.deafapp_recognition_manifest()->'quality') where value->>'classId'=class_id;
 assert entry->>'evaluation' is null,'partial evaluations must not receive automatic colors';
 assert not has_table_privilege('anon','deafapp_private.recognition_quality_reviews','select');
 assert not has_table_privilege('anon','deafapp_private.recognition_quality_reviews','insert');
 assert not has_function_privilege('anon','deafapp_private.recognition_quality(boolean)','execute');
 assert has_function_privilege('anon','public.deafapp_admin_recognition_quality_save(text,text,text,integer)','execute');
end $test$;
