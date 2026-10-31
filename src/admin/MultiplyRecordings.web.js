import {useCallback,useEffect,useRef,useState} from 'react';
import CameraLandmarks from '../camera/CameraLandmarks';
import {PrivacyConsent} from '../privacy/PrivacyScreens';
import {createConsentReceipt,assertRecordingConsent} from '../privacy/privacyConsent';
import {captureTrackingSample,createTrainingCapture,makeParticipantId} from '../recording/trainingCapture';
import {createRecordingDraft,submitRecordingDraft,withRecordingSendLock} from '../recording/recordingSubmission';
import {handsReadyForRecording,cameraFrameReady,prepareTrackedRecording,captureTrackedFrames,createRecordingHandContinuity} from '../recording/recordingHandGuard';
import {isMobileCameraDevice} from '../camera/cameraLayout';
import {approvedRecordingFeatures} from '../training/approvedVocabulary';
import VariantPlayer,{loadVariantRecording} from './VariantPlayer.web';
import {recordingPreview} from './adminClient';
import {recordingTimeline} from '../training/recordingVariants';
import './RecordingVariants.css';

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export default function MultiplyRecordings({api,session,client,initialSource,initialClassId,onBack,onSent,onAccessError,onBusyChange}){
  const [catalogue,setCatalogue]=useState([]),[classId,setClassId]=useState(initialClassId||''),[quantity,setQuantity]=useState(50);
  const [takes,setTakes]=useState([]),[clip,setClip]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [consentScreen,setConsentScreen]=useState(false),[camera,setCamera]=useState(false),[trackingStatus,setTrackingStatus]=useState('');
  const alive=useRef(true),lock=useRef(false),stream=useRef(null),video=useRef(null),container=useRef(null),tracking=useRef(null),consent=useRef(null),cancelled=useRef(false),cameraRequest=useRef(0);
  const drafts=useRef([]),uploadedRows=useRef([]),requestId=useRef(crypto.randomUUID()),participant=useRef(makeParticipantId());
  const updateTracking=useCallback(value=>{tracking.current=value;},[]);
  function fail(e){if(!alive.current)return;setError(e.message||'No se pudo completar la operación.');if(e.code==='session_expired')onAccessError?.(e);}
  function stop(){cameraRequest.current++;cancelled.current=true;stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;tracking.current=null;if(alive.current)setCamera(false);}
  useEffect(()=>{
    alive.current=true;
    if(initialSource)loadVariantRecording(client,initialSource,session).then(value=>{if(alive.current)setClip(value);}).catch(fail);
    else api.vocabulary(session).then(value=>{if(alive.current){const entries=value.catalogue.filter(row=>!row.aliasOf);setCatalogue(entries);if(!initialClassId)setClassId(entries[0]?.classId||'');}}).catch(fail);
    const hide=()=>{if(document.hidden)stop();};document.addEventListener('visibilitychange',hide);window.addEventListener('pagehide',stop);
    return()=>{alive.current=false;stop();onBusyChange?.(false);document.removeEventListener('visibilitychange',hide);window.removeEventListener('pagehide',stop);};
  },[api,session,client]);
  useEffect(()=>{onBusyChange?.(busy);},[busy]);
  useEffect(()=>{document.querySelector('.mv-workbench')?.scrollTo(0,0);},[consentScreen]);
  useEffect(()=>{if(camera&&video.current&&stream.current){video.current.srcObject=stream.current;video.current.play().catch(fail);}},[camera]);
  async function task(action){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await action();}catch(e){fail(e);}finally{lock.current=false;if(alive.current){setBusy(false);setMessage('');}}}
  async function startCamera(){await task(async()=>{
    if(!consent.current){setConsentScreen(true);return;}
    if(!navigator.mediaDevices?.getUserMedia)throw Error('Este navegador no permite abrir la cámara.');
    const request=++cameraRequest.current;
    const next=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:640},height:{ideal:480}},audio:false});
    if(!alive.current||request!==cameraRequest.current||document.hidden){next.getTracks().forEach(track=>track.stop());return;}
    stream.current=next;cancelled.current=false;setCamera(true);
  });}
  async function record(){await task(async()=>{
    if(!classId||drafts.current.length>=3||!stream.current)throw Error('Elige una seña y activa la cámara.');
    cancelled.current=false;
    const check=()=>{if(cancelled.current||!alive.current||document.hidden)throw Error('Grabación detenida. Puedes repetirla.');assertRecordingConsent({consent:consent.current,createdAt:Date.now()},consent.current);};
    const ready=n=>cameraFrameReady(video.current)&&handsReadyForRecording(tracking.current,performance.now(),n);
    const continuity=createRecordingHandContinuity(),minimum=isMobileCameraDevice({mobile:navigator.userAgentData?.mobile,userAgent:navigator.userAgent,touchPoints:navigator.maxTouchPoints,coarsePointer:window.matchMedia('(pointer:coarse)').matches,screenWidth:screen.width,screenHeight:screen.height})?1:2;
    await prepareTrackedRecording({isReady:()=>ready(minimum),isCountdownReady:()=>cameraFrameReady(video.current)&&continuity.update(tracking.current,performance.now()),isCancelled:()=>cancelled.current||!alive.current,assertAllowed:check,now:()=>performance.now(),delay,
      onWaiting:()=>setMessage(minimum===1?'Muestra una mano con trazado…':'Muestra ambas manos con trazado…'),onCountdown:n=>setMessage(`Comenzamos en ${n}`)});
    const canvas=document.createElement('canvas');canvas.width=320;canvas.height=Math.round(320*video.current.videoHeight/video.current.videoWidth);const ctx=canvas.getContext('2d');
    const samples=[],startedAt=performance.now();
    const frames=await captureTrackedFrames({count:30,isReady:()=>ready(1),assertAllowed:check,delay:()=>delay(113),onFrame:n=>setMessage(`Grabando ${n}/30`),capture:async()=>{
      const sample=captureTrackingSample(tracking.current,performance.now(),startedAt);ctx.drawImage(video.current,0,0,canvas.width,canvas.height);const image=canvas.toDataURL('image/jpeg',.15);sample.completedAtMs=performance.now()-startedAt;samples.push(sample);return image;
    }});
    check();const entry=catalogue.find(row=>row.classId===classId);
    const training=createTrainingCapture({participantId:participant.current,participantIdentity:'anonymous-local-source',sessionId:requestId.current,samples,platform:'web',frameSize:{width:canvas.width,height:canvas.height},jpegQuality:.15});
    const draft=createRecordingDraft({label:entry.label,category:entry.category,frames,intervalMs:Math.max(30,Math.min(1000,Math.round((performance.now()-startedAt)/30))),frameAspectRatio:canvas.width/canvas.height,training,consent:consent.current});
    try{approvedRecordingFeatures({id:draft.id,label:draft.label,category:draft.category,status:'approved',version:0}, {...draft,categoria:draft.category},[{classId:entry.classId}]);}
    catch{throw Error('Faltaron puntos de manos o rostro, o movimiento suficiente. Repite la toma con buena luz y el rostro visible.');}
    drafts.current.push(draft);setTakes([...drafts.current]);setClip({...recordingPreview(draft),...recordingTimeline(draft)});
  });}
  async function send(){await task(async()=>{
    stop();const rows=initialSource?[initialSource]:uploadedRows.current;
    if(!initialSource){
      if(!drafts.current.length)throw Error('Graba una toma antes de enviar.');
      for(let index=0;index<drafts.current.length;index++){
        if(rows[index])continue;setMessage(`Enviando original ${index+1}…`);
        const draft=drafts.current[index];await withRecordingSendLock(draft.id,()=>submitRecordingDraft({draft,client,getCurrentConsent:()=>consent.current,onUploaded:value=>{drafts.current[index]=value;}}));
        const result=await client.from('grabaciones').select('id,moderation_version').eq('archivo_path',draft.storagePath).limit(1);
        if(result.error||!result.data?.[0])throw Error('El original se envió. Reintenta para terminar el lote.');
        rows[index]={id:String(result.data[0].id),version:result.data[0].moderation_version};
      }
    }
    setMessage(`Creando ${quantity} variantes…`);const result=await api.createVariants(session,{requestId:requestId.current,rows,quantity});
    if(alive.current)onSent(result.batch);
  });}
  if(consentScreen)return <PrivacyConsent onBack={()=>setConsentScreen(false)} onAccept={choices=>{consent.current=createConsentReceipt(choices);setConsentScreen(false);}}/>;
  const entry=catalogue.find(row=>row.classId===classId),canSend=!!initialSource||takes.length>0;
  return <div className="mv-workbench"><header><p className="mv-eyebrow">ADMINISTRACIÓN · APORTES</p><h1>{initialSource?'Multiplicar esta seña':'Grabar y multiplicar'}</h1><p>Una toma real es suficiente. Crea 50 o 100 variantes con el estado de su original.</p><button disabled={busy} onClick={onBack}>Volver a grabaciones</button></header>
    {error&&<p className="mv-error" role="alert">{error}</p>}{message&&<p className="mv-notice" role="status">{message}</p>}
    <section className="mv-card"><h2>1. Tu original</h2>{initialSource?<p><strong>{initialSource.label}</strong> · #{initialSource.id} · {initialSource.status==='approved'?'Aprobada':'Pendiente de revisión'}</p>:<>
      <label>Seña<select value={classId} disabled={busy||takes.length>0||camera} onChange={e=>setClassId(e.target.value)}>{catalogue.map(row=><option key={row.classId} value={row.classId}>{row.categoryTitle} · {row.displayLabel}</option>)}</select></label>
      <p>{takes.length} {takes.length===1?'toma real lista':'tomas reales listas'}. Puedes añadir hasta tres; las adicionales son opcionales.</p>
      {camera&&<div ref={container} className="mv-camera"><video ref={video} muted playsInline autoPlay/><CameraLandmarks cameraContainerRef={container} enabled={camera} onTracking={updateTracking} onStatus={setTrackingStatus}/></div>}
      {camera&&<p role="status">{trackingStatus}</p>}
      <div className="mv-actions"><button disabled={busy||takes.length>=3||uploadedRows.current.length>0||!entry} onClick={camera?record:startCamera}>{camera?(takes.length?'Grabar otra toma (opcional)':'Preparar grabación'):(consent.current?'Activar cámara':'Autorizar y preparar cámara')}</button>
      {camera&&<button onClick={stop}>Detener cámara</button>}
      {takes.length>0&&!uploadedRows.current.length&&<button disabled={busy} onClick={()=>{drafts.current=[];setTakes([]);setClip(null);}}>Repetir tomas</button>}</div>
      </>}
      {clip&&<VariantPlayer clip={clip}/>}</section>
    <section className="mv-card"><h2>2. Elige la cantidad</h2><div className="mv-quantities">{[50,100].map(value=><button key={value} disabled={busy} aria-pressed={quantity===value} onClick={()=>{requestId.current=crypto.randomUUID();setQuantity(value);}}><strong>{value}</strong><span>variantes</span></button>)}</div>
      <p>{initialSource?1:takes.length} {(!initialSource&&takes.length!==1)?'originales':'original'} + {quantity} variantes. Se conservan la secuencia y los tiempos de cada original.</p>
      <small>Las variantes ayudan a ampliar el aprendizaje; siguen siendo aportes de la misma persona y no sustituyen las tomas de otras personas.</small>
      <button className="mv-primary" disabled={busy||!canSend} onClick={send}>{busy?'Procesando…':`Crear ${quantity} variantes${initialSource?.status==='approved'?' y añadir a Aprobadas':''}`}</button>
      <small>{initialSource?.status==='approved'?'Se añadirán automáticamente al catálogo de Aprobadas.':'Las variantes esperarán hasta que apruebes sus originales; después aparecerán automáticamente en Aprobadas.'}</small>
    </section></div>;
}
