import {createClient} from 'npm:@supabase/supabase-js@2.110.7';
import {AwsClient} from 'npm:aws4fetch@1.0.20';
import {createRecordingUploadHandler} from '../../../src/storage/recordingUploadServer.js';
import {digestBytes,readLimitedBytes} from '../../../src/storage/privateRecordingServer.js';
import {loadRecordingObject} from '../_shared/recordingObjects.ts';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const account=Deno.env.get('R2_ACCOUNT_ID'),bucket=Deno.env.get('R2_MIGRATION_BUCKET');
const signed=new AwsClient({accessKeyId:Deno.env.get('R2_ACCESS_KEY_ID')!,secretAccessKey:Deno.env.get('R2_SECRET_ACCESS_KEY')!,service:'s3',region:'auto',retries:1});
async function rpc(name:string,args:Record<string,unknown>){const {data,error}=await db.rpc(name,args);if(error||data?.ok!==true)throw Object.assign(Error('Upload unavailable'),{code:error?.code});return data;}
Deno.serve(createRecordingUploadHandler({
  reserve:({path,hash,category,label,recordingId,consentId}:any)=>rpc('deafapp_recording_upload_reserve',{p_path:path,p_hash:hash,p_category:category,p_label:label,p_recording_id:recordingId,p_consent_id:consentId}),
  async writeVerified(path:string,bytes:Uint8Array,hash:string){
    if(!/^[a-f0-9]{32}$/.test(account||'')||bucket!=='deafapp-grabaciones-privadas')throw Error('R2 unavailable');
    const url=`https://${account}.r2.cloudflarestorage.com/${bucket}/contribuciones/${path.split('/').map(encodeURIComponent).join('/')}`;
    const put=await signed.fetch(url,{method:'PUT',headers:{'content-type':'application/json','if-none-match':'*','x-amz-meta-sha256':hash},body:bytes,signal:AbortSignal.timeout(60000)});
    if(!put.ok&&put.status!==412)throw Error('Private upload failed');
    const read=await signed.fetch(url,{method:'GET',signal:AbortSignal.timeout(60000)});
    if(!read.ok)throw Error('Private verification failed');
    const verified=await readLimitedBytes(read,bytes.length);
    if(verified.length!==bytes.length||await digestBytes(verified)!==hash)throw Object.assign(Error('Immutable object mismatch'),{code:'40001'});
  },
  markReady:({path,token,hash,bytes}:any)=>rpc('deafapp_recording_upload_ready',{p_path:path,p_token:token,p_sha256:hash,p_bytes:bytes}),
  async complete({path,token,noticeVersion}:any){
    const location=await rpc('deafapp_recording_upload_location',{p_path:path,p_token:token});
    await loadRecordingObject(db,location);
    return rpc('deafapp_recording_upload_complete',{p_path:path,p_token:token,p_notice_version:noticeVersion});
  },
}));
