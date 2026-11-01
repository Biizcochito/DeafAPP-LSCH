import {isRecordingDraft} from '../recording/recordingSubmission.js';
import {assertRecordingConsent,PRIVACY_NOTICE} from '../privacy/privacyConsent.js';
import {digestBytes,readLimitedBytes} from './privateRecordingServer.js';
import {isRecordingPath} from './recordingPath.js';
import {recordingPayload} from './recordingPayload.js';
export {recordingPayload} from './recordingPayload.js';

const allowedOrigins=new Set(['https://deafapps.com','https://www.deafapps.com','https://deafapp-lsch.deafapp-lsch.workers.dev']);
export function createRecordingUploadHandler({reserve,writeVerified,markReady,complete,now=Date.now}){
  return async request=>{
    const origin=request.headers.get('origin')||'',headers={'Cache-Control':'no-store',Vary:'Origin',
      'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info'};
    if(allowedOrigins.has(origin)||/^http:\/\/(localhost|127\.0\.0\.1):\d{4,5}$/.test(origin))headers['Access-Control-Allow-Origin']=origin;
    const reply=(data,status=200)=>Response.json(data,{status,headers});
    if(origin&&!headers['Access-Control-Allow-Origin'])return reply({error:'Origen no permitido.'},403);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
    if(request.method!=='POST')return reply({error:'Método no permitido.'},405);
    let input;
    const length=request.headers.get('content-length');
    const limit=length&&/^\d+$/.test(length)&&Number(length)>0&&Number(length)<=40_000_000?Number(length):40_000_000;
    try{input=JSON.parse(new TextDecoder().decode(await readLimitedBytes(request,limit)));}
    catch{return reply({error:'La grabación es demasiado grande o no es válida.'},400);}
    try{
      if(input?.action==='stage'){
        const draft=input.draft;
        if(!isRecordingDraft(draft)||!isRecordingPath(draft.storagePath)||draft.createdAt>now()||draft.frames.some(frame=>
          frame.length>2_000_000||!/^(?:data:image\/jpe?g;base64,)?\/9j\/[A-Za-z0-9+/=\r\n]+$/.test(frame)))return reply({error:'La grabación no es válida.'},400);
        assertRecordingConsent(draft);
        if(draft.consent.notice.retentionMonths!==PRIVACY_NOTICE.retentionMonths||draft.consent.notice.controller!==PRIVACY_NOTICE.controller||
          draft.consent.notice.contact!==PRIVACY_NOTICE.contact)return reply({error:'Revisa la autorización vigente antes de enviar.'},400);
        const contentHash=await digestBytes(new TextEncoder().encode(JSON.stringify(recordingPayload(draft))));
        const ticket=await reserve({path:draft.storagePath,hash:contentHash,category:draft.category,label:draft.label,recordingId:draft.id,consentId:draft.consent.id});
        if(ticket.committed)return reply({ok:true,alreadySubmitted:true,provider:'r2',path:draft.storagePath});
        const bytes=new TextEncoder().encode(JSON.stringify(recordingPayload(draft,ticket.submittedAt))),hash=await digestBytes(bytes);
        if(bytes.length>40_000_000)return reply({error:'La grabación supera el tamaño admitido.'},400);
        await writeVerified(draft.storagePath,bytes,hash);
        await markReady({path:draft.storagePath,token:ticket.token,hash,bytes:bytes.length});
        return reply({ok:true,provider:'r2',path:draft.storagePath,token:ticket.token});
      }
      if(input?.action==='complete'&&isRecordingPath(input.path)&&/^[a-f0-9]{64}$/.test(input.token||'')){
        const result=await complete({path:input.path,token:input.token,noticeVersion:PRIVACY_NOTICE.version});
        return reply({ok:true,provider:'r2',path:input.path,alreadySubmitted:!!result.alreadySubmitted});
      }
      return reply({error:'Solicitud no válida.'},400);
    }catch(error){
      const conflict=error?.code==='40001',invalid=error?.code==='22023';
      return reply({error:conflict?'El envío cambió o ya existe con otros datos. Conserva la toma y vuelve a intentarlo.':invalid?
        'La seña ya no está habilitada o el envío no es válido.':'No se pudo guardar la grabación. Conserva la toma y vuelve a intentarlo.'},conflict?409:invalid?400:503);
    }
  };
}
