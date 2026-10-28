import {loadApprovedVocabulary} from '../training/approvedVocabulary';
import {buildVocabularyCandidate} from '../training/vocabularyCandidate';
import {canonicalPhraseLabel,ESTOY_BIEN_CLASS} from '../training/phraseLabels';
import {useEffect,useMemo,useRef,useState} from 'react';
import {createSignTracker,drawSignLandmarks} from '../camera/landmarkTracking';
import {freshLandmarks,withTrackingTimeout} from '../camera/trackingOverlay';
import {createLiveSignRecognizer} from '../training/liveSignRecognition';
import {createSignInferenceClient} from '../training/signInferenceWorker';
import {PHRASES,trackingVector,captureFeatures,decodeCandidate} from '../training/visibleTraining';
import {phraseStore,phraseCounts,trainPersonalPhrases,predictPersonalPhrase} from '../training/personalPhrases';
import {loadTrainingTensorflow} from '../training/tensorflowBrowser';
import {sequenceKey} from '../training/assistantData';
import {captureQuality,compareCandidates,VISIBLE_TARGETS} from '../training/trainingAssistant';
import TrainingAssistant from './TrainingAssistant.web';
import './VisibleTrainingPanel.css';

const label=id=>canonicalPhraseLabel(id.split('/').at(-1));
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const recordingReason=reason=>({'approval-changed':'aprobación modificada durante la actualización; actualiza otra vez','requires-source-review':'fuente externa pendiente de revisar','not-lsch':'el archivo declara otra lengua','missing-tracking':'sin puntos de manos y cara; vuelve a grabar con el seguimiento activo','expired-recording':'plazo de conservación vencido','download-failed':'no se pudo descargar','label-mismatch':'la etiqueta no coincide con la revisión','oversized-recording':'archivo demasiado grande'}[reason]||'seguimiento o movimiento insuficiente; revisa la toma');
export default function VisibleTrainingPanel({api,session,client,onAccessError,onReviewRecordings}) {
  const [progress,setProgress]=useState(null),[error,setError]=useState(''),[message,setMessage]=useState('Activa la cámara para grabar una oración completa.');
  const [localRows,setRows]=useState([]),[selected,setSelected]=useState(PHRASES[0]),[candidateId,setCandidateId]=useState('');
  const [library,setLibrary]=useState({rows:[],pending:[],excluded:[],loading:true}),[coverage,setCoverage]=useState([]),[baseModel,setBaseModel]=useState(null);
  const rows=useMemo(()=>[...localRows,...library.rows],[localRows,library.rows]);
  const [active,setActive]=useState(false),[busy,setBusy]=useState(false),[personal,setPersonal]=useState(null),[loaded,setLoaded]=useState('');
  const [quality,setQuality]=useState([]),[comparison,setComparison]=useState(null),[participant,setParticipant]=useState('P1');
  const [pendingTest,setPendingTest]=useState(null),[expected,setExpected]=useState(''),[signResult,setSignResult]=useState(null),[personalSigns,setPersonalSigns]=useState(null);
  const [liveOn,setLiveOn]=useState(true),[liveResult,setLiveResult]=useState({phase:'off'});
  const livePreference=useRef(true),accessEpoch=useRef(0),cameraEpoch=useRef(0);
  const libraryRequest=useRef(null),candidateRequest=useRef(0);
  const committeeCache=useRef(new Map()),captureSection=useRef(null),localSignCandidate=useRef(null);
  const video=useRef(null),canvas=useRef(null),live=useRef(null),alive=useRef(true),capture=useRef(null),model=useRef(null),candidate=useRef(null),working=useRef(false);
  function stop(){cameraEpoch.current++;const state=live.current;live.current=null;capture.current=null;if(state){clearTimeout(state.timer);clearInterval(state.expiry);state.recognizer?.close();state.inference?.close();state.stream.getTracks().forEach(track=>track.stop());void state.tracker?.close();}if(video.current)video.current.srcObject=null;if(alive.current){setActive(false);setLiveResult({phase:'off'});setSignResult(value=>value?.live?null:value);}}
  function configureRecognition(value,name){
    const state=live.current;if(!state)return;
    if(value&&state.recognitionId===value.id&&state.recognizer&&state.recognitionPhase!=='error')return;
    state.recognizer?.close();state.inference?.close();state.recognizer=null;state.inference=null;
    state.recognitionId=value?.id;
    if(!value){setLiveResult({phase:'model'});return;}
    try{
      const inference=createSignInferenceClient(value);state.inference=inference;
      state.recognizer=createLiveSignRecognizer({wholePhrases:(value.enabledClasses||value.classes).some(id=>id.startsWith('oraciones/')),predict:windows=>inference.predict(windows),onUpdate:result=>{
        if(live.current!==state||!alive.current)return;
        state.recognitionPhase=result.phase;
        setLiveResult(result);
        if(result.phase==='matched')setSignResult({...result.prediction,modelName:name,live:true});
        else setSignResult(previous=>previous?.live?null:previous);
      }});
      state.recognizer.reset(livePreference.current?'position':'paused');
    }catch(error){setLiveResult({phase:'error',message:error.message});}
  }
  function toggleRecognition(){
    livePreference.current=!livePreference.current;setLiveOn(livePreference.current);
    live.current?.recognizer?.reset(livePreference.current?'position':'paused');
  }
  async function refreshLibrary(){
    libraryRequest.current?.abort();const controller=new AbortController();libraryRequest.current=controller;
    model.current?.dispose();model.current=null;setPersonal(null);setPendingTest(null);
    setLibrary({rows:[],pending:[],excluded:[],loading:true});
    try{
      const data=await loadApprovedVocabulary({api,session,client,targets:VISIBLE_TARGETS,signal:controller.signal,onProgress:text=>{if(alive.current&&!controller.signal.aborted)setMessage(text);}});
      if(alive.current&&!controller.signal.aborted){setLibrary({...data,loading:false});setMessage('Grabaciones comprobadas. Las palabras y oraciones con tres tomas distintas se incorporan a la cámara.');}
    }catch(error){if(alive.current&&!controller.signal.aborted){setLibrary({rows:[],pending:[],excluded:[],loading:false,error:error.message});onAccessError?.(error);}}
  }
  useEffect(()=>{
    alive.current=true;const epoch=++accessEpoch.current;
    api.trainingProgress(session).then(data=>{if(alive.current&&accessEpoch.current===epoch){setProgress(data.progress);setCandidateId(data.progress?.primaryModelId||data.progress?.models?.[0]?.modelId||'');}}).catch(e=>{if(alive.current&&accessEpoch.current===epoch){setError(e.message);onAccessError?.(e);}});
    phraseStore('list').then(data=>{if(alive.current)setRows(data);}).catch(e=>{if(alive.current)setError(e.message);});
    void refreshLibrary();
    const hidden=()=>{if(document.hidden)stop();};document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',stop);
    return()=>{alive.current=false;accessEpoch.current++;libraryRequest.current?.abort();candidateRequest.current++;stop();model.current?.dispose();model.current=null;candidate.current=null;committeeCache.current.clear();document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',stop);};
  },[api,session]);
  useEffect(()=>{
    if(progress&&candidateId)void readCandidate(candidateId).catch(error=>{if(alive.current){setError(error.message);onAccessError?.(error);}});
  },[progress,candidateId]);
  useEffect(()=>{
    let cancelled=false;
    buildVocabularyCandidate(rows,VISIBLE_TARGETS,{baseModel,cancelled:()=>cancelled}).then(result=>{
      if(cancelled||!alive.current||!result)return;
      localSignCandidate.current=result.candidate;setCoverage(result.coverage);setPersonalSigns(result.report);
      configureRecognition(result.candidate,result.report?'Grabaciones aprobadas y tomas personales':progress?.models.find(row=>row.modelId===baseModel?.id)?.name);
    }).catch(error=>{if(!cancelled&&alive.current)setError(error.message);});
    return()=>{cancelled=true;};
  },[rows,baseModel]);
  async function task(fn){if(working.current)return;working.current=true;live.current?.recognizer?.reset('paused');setBusy(true);setError('');try{await fn();}catch(e){if(alive.current){setError(e.message);if(e.code==='session_expired')onAccessError?.(e);}}finally{working.current=false;if(alive.current)setBusy(false);}}
  async function start(){await task(async()=>{
    const epoch=cameraEpoch.current;
    setMessage('Preparando el seguimiento de manos y cara…');
    let candidateError;
    if(candidateId&&candidate.current?.id!==candidateId){try{await readCandidate();}catch(error){if(error.code==='session_expired')throw error;candidateError=error.message;}}
    if(!alive.current||cameraEpoch.current!==epoch)return;
    const stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480},facingMode:'user'},audio:false});
    if(!alive.current||cameraEpoch.current!==epoch){stream.getTracks().forEach(track=>track.stop());return;}
    const state={stream,tracker:null,timer:null};live.current=state;
    try{
      video.current.srcObject=stream;setActive(true);setLiveResult({phase:'loading'});await video.current.play();
      if(live.current!==state)return;
      state.tracker=await createSignTracker();
      if(live.current!==state){await state.tracker.close();return;}
      configureRecognition(localSignCandidate.current||candidate.current,personalSigns?'Grabaciones aprobadas y tomas personales':progress?.models.find(row=>row.modelId===candidateId)?.name);
      state.tracker.onResults(result=>{
        if(live.current!==state)return;
        const v=video.current,c=canvas.current;c.width=v.videoWidth;c.height=v.videoHeight;
        const time=performance.now(),fresh=freshLandmarks(result,time);
        const ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);drawSignLandmarks(ctx,fresh);
        state.recognizer?.expire(time);
        if(result.handTime===state.lastHandTime)return;
        state.lastHandTime=result.handTime;
        const vector=time-result.handTime<=350?trackingVector(fresh,v.videoWidth,v.videoHeight):null;
        if(capture.current)capture.current.push({timeMs:time-state.started,vector});
        if(livePreference.current)state.recognizer?.push({timeMs:time,vector});
      });
      const tick=async()=>{if(live.current!==state)return;const started=performance.now();try{if(video.current.readyState>=2&&video.current.currentTime!==state.videoTime){state.videoTime=video.current.currentTime;await withTrackingTimeout(Promise.all([state.tracker.sendHands({image:video.current}),state.tracker.sendFace({image:video.current})]),state.warm?10000:45000);state.warm=true;}if(live.current===state)state.timer=setTimeout(tick,Math.max(0,50-(performance.now()-started)));}catch(e){if(live.current===state){stop();if(alive.current)setError(e.message);}}};
      state.expiry=setInterval(()=>state.recognizer?.expire(performance.now()),100);
      if(candidateError)setError(candidateError);
      setMessage('Cámara preparada. Haz una seña del vocabulario activo para verla sobre la imagen.');void tick();
    }catch(e){if(live.current===state)stop();throw e;}
  });}
  async function collect(mode){await task(async()=>{
    if(!/^[A-Za-z0-9_-]{1,20}$/.test(participant))throw Error('Usa un código de perfil de 1 a 20 letras o números, sin nombres personales.');
    if(mode==='record'&&!VISIBLE_TARGETS.some(row=>row.classId===selected))throw Error('Selecciona una seña u oración visible.');
    const wholePhrase=mode==='record'?PHRASES.includes(selected):mode==='phrase';
    const state=live.current;if(!state?.tracker)throw Error('Primero activa la cámara.');
    for(let n=3;n;n--){setMessage(`Prepárate… ${n}`);await wait(1000);if(live.current!==state)throw Error('La cámara se apagó.');}
    state.started=performance.now();capture.current=[];
    for(let n=4;n;n--){setMessage(`Haz ${wholePhrase?'la oración completa':'la seña'}. Capturando… ${n}`);await wait(1000);if(live.current!==state)throw Error('La toma se interrumpió.');}
    const frames=capture.current;capture.current=null;
    let features;const assessment=captureQuality(frames);
    try{features=captureFeatures(frames,{wholePhrase});setQuality(value=>[...value.slice(-7),{...assessment,accepted:true,classId:mode==='record'?selected:null,reason:'La toma mantiene cara, al menos una mano y movimiento suficiente. La calidad técnica no confirma su significado en LSCh.'}]);}
    catch(e){setQuality(value=>[...value.slice(-7),{...assessment,accepted:false,classId:mode==='record'?selected:null,reason:e.message}]);throw e;}
    if(mode==='record'){
      const fingerprint=sequenceKey(features);
      if(rows.some(row=>sequenceKey(row.features)===fingerprint)){const reason='Esta captura ya está guardada o reservada; graba una toma nueva.';setQuality(value=>[...value.slice(0,-1),{...assessment,accepted:false,classId:selected,reason}]);throw Error(reason);}
      const row={id:crypto.randomUUID(),classId:selected,wholePhrase,split:'train',participantCode:participant,participantVerified:false,features,createdAt:new Date().toISOString()};
      await phraseStore('put',row);const next=await phraseStore('list');
      if(alive.current){setRows(next);if(wholePhrase){model.current?.dispose();model.current=null;setPersonal(null);}setMessage(`Toma de «${label(selected)}» guardada. El vocabulario en vivo se actualiza automáticamente.`);}
    }else{
      const result=predictPersonalPhrase(await loadTrainingTensorflow(),model.current,features);
      if(alive.current){setMessage(result.accepted?`Propuesta experimental: «${label(result.classId)}». Comprueba si coincide con tu movimiento.`:'El candidato no encontró una coincidencia suficiente. Revisa la toma completa.');
        setExpected('');setPendingTest({features,prediction:result,modelId:personal.modelId,participantCode:participant});}
    }
  });}
  async function train(){await task(async()=>{
    stop();setMessage('Preparando el entrenamiento de tus oraciones completas…');
    const trained=await trainPersonalPhrases(await loadTrainingTensorflow(),rows,(epoch,loss)=>{if(alive.current)setMessage(`Entrenando: época ${epoch}/30 · pérdida ${loss.toFixed(4)}. Esto no mide precisión.`);},()=>!alive.current);
    if(!alive.current){trained.model.dispose();return;}
    model.current?.dispose();model.current=trained.model;setPersonal({...trained.report,modelId:crypto.randomUUID()});setPendingTest(null);setMessage('Candidato personal entrenado. Activa la cámara y prueba una toma nueva sin seleccionar su etiqueta.');
  });}
  const lastSign=useMemo(()=>[...localRows].reverse().find(row=>row.wholePhrase===false&&row.split==='train'&&VISIBLE_TARGETS.some(target=>target.classId===row.classId)),[localRows]);
  async function compare(){await task(async()=>{
    if(!lastSign)throw Error('Primero guarda una toma nueva de una seña visible.');
    setMessage('Comparando la última seña con los candidatos privados…');
    const groups=await compareCandidates({api,session,progress,features:lastSign.features,cache:committeeCache.current,cancelled:()=>!alive.current});
    if(!alive.current)return;
    const updated={...lastSign,committee:groups,committeeReviewed:false};await phraseStore('put',updated);
    if(alive.current){setRows(await phraseStore('list'));setComparison({id:lastSign.id,classId:lastSign.classId,groups,reviewed:false});setMessage('Comparación terminada. Revisa acuerdos y abstenciones en el asistente.');}
  });}
  async function reviewComparison(id){await task(async()=>{
    const row=rows.find(item=>item.id===id);if(!row?.committee)throw Error('Esta comparación ya no está disponible.');
    await phraseStore('put',{...row,committeeReviewed:true});if(alive.current){setRows(await phraseStore('list'));setComparison(value=>value?.id===id?{...value,reviewed:true}:value);}
  });}
  async function confirmTest(){await task(async()=>{
    if(!pendingTest||![...PHRASES,'unknown'].includes(expected))throw Error('Confirma qué hiciste después de revisar la predicción.');
    if(rows.some(row=>sequenceKey(row.features)===sequenceKey(pendingTest.features)))throw Error('Esta toma coincide con material ya guardado. Usa una toma nueva para evaluar.');
    const row={id:crypto.randomUUID(),...pendingTest,classId:expected,wholePhrase:expected!=='unknown',split:'evaluation',confirmed:true,participantVerified:false,createdAt:new Date().toISOString()};
    await phraseStore('put',row);if(alive.current){setRows(await phraseStore('list'));setPendingTest(null);setExpected('');setMessage('Prueba reservada guardada. No se utilizará para entrenar.');}
  });}
  function assistantAction(action){
    if(action.type==='train'){void train();return;}
    if(action.type==='review'){const row=rows.find(item=>item.id===action.recordingId);if(row?.committee){setComparison({id:row.id,classId:row.classId,groups:row.committee,reviewed:row.committeeReviewed===true});requestAnimationFrame(()=>document.getElementById('vt-committee')?.scrollIntoView({behavior:'smooth',block:'start'}));}return;}
    if(action.type==='capture'&&VISIBLE_TARGETS.some(row=>row.classId===action.classId)){setSelected(action.classId);setMessage(`Siguiente toma: «${label(action.classId)}». Activa la cámara y pulsa Grabar ${PHRASES.includes(action.classId)?'oración completa':'seña seleccionada'}.`);}
    else if(action.type==='evaluate'){setMessage('Activa la cámara y realiza cualquier oración con «Interpretar mi oración con cámara». Confirma la respuesta después de ver el resultado.');}
    captureSection.current?.scrollIntoView({behavior:'smooth',block:'start'});
  }
  async function readCandidate(id=candidateId){
    const epoch=accessEpoch.current,request=++candidateRequest.current;
    const current=()=>alive.current&&accessEpoch.current===epoch&&candidateRequest.current===request;
    let decoded;
    try{const data=await api.trainingCandidate(session,id);if(!current())return;decoded=await decodeCandidate(data.candidate);}
    catch(error){if(current())throw error;return;}
    if(!current())return;
    if(decoded.id!==id||decoded.classes.some(id=>!progress.targets.some(row=>row.classId===id)))throw Error('El candidato no coincide con el catálogo visible.');
    if(alive.current&&accessEpoch.current===epoch&&candidateRequest.current===request){candidate.current=decoded;setBaseModel(decoded);setLoaded(id);setSignResult(null);}
  }
  async function load(){await task(async()=>{await readCandidate();setMessage('Candidato cargado. El reconocimiento en vivo usa sus señas habilitadas.');});}
  async function recognizeLive(){await task(async()=>{if(!live.current)throw Error('Primero activa la cámara.');if(!localSignCandidate.current&&candidate.current?.id!==candidateId)await readCandidate();livePreference.current=true;setLiveOn(true);live.current.recognizer?.reset('position');captureSection.current?.scrollIntoView({behavior:'smooth',block:'start'});setMessage('Haz una palabra u oración activa: aparecerá sobre la cámara al encontrar una coincidencia suficiente.');});}
  function selectCandidate(id){candidateRequest.current++;setCandidateId(id);candidate.current=null;setBaseModel(null);setLoaded('');setSignResult(null);}
  const counts=useMemo(()=>phraseCounts(rows),[rows]),ready=counts.every(row=>row.count>=3);
  const liveModel=localSignCandidate.current||baseModel;
  const vocabulary=liveModel?.enabledClasses||liveModel?.classes||[];
  const liveText=!active?'Cámara apagada':!liveOn?'Reconocimiento pausado':liveResult.phase==='matched'?label(liveResult.prediction.classId):liveResult.phase==='model'?'Carga un candidato':liveResult.phase==='loading'?'Preparando detectores…':liveResult.phase==='position'?'Muestra la cara y una mano':liveResult.phase==='error'?'Vuelve a cargar el candidato':liveResult.phase==='uncertain'?'Sin coincidencia suficiente':liveResult.phase==='recognizing'?'Confirmando la seña…':busy?'Captura en curso…':'Haz una seña';
  return <section className="visible-training" aria-label="Avance de entrenamiento del catálogo visible">
    <TrainingAssistant progress={progress} rows={rows} quality={quality} personal={personal} comparison={comparison} busy={busy} onAction={assistantAction} onCompare={compare} onReview={reviewComparison} lastSign={lastSign}/>
    <div className="vt-card"><p className="vt-kicker">CATÁLOGO VISIBLE · AVANCE REAL</p><h2>De tus movimientos a una oración.</h2><p>Los candidatos siguen en evaluación. Las oraciones se aprenden como tomas completas; no se construyen pegando señas sueltas.</p>
      {progress?<><div className="vt-stats"><div><b>{progress.models.length}</b><span>Candidatos entrenados</span></div><div><b>{progress.trainedCount} / {progress.targetCount}</b><span>Clases con datos de aprendizaje</span></div><div><b>{progress.availableOriginals??progress.originals}</b><span>Secuencias originales disponibles</span></div></div><p>Actualizado: {new Date(progress.updatedAt).toLocaleString('es-CL')}. {progress.originals} originales de aprendizaje{progress.reservedOriginals?` y ${progress.reservedOriginals} secuencias reservadas de la última tanda`:''}. Los aumentos artificiales no cuentan como personas ni grabaciones nuevas.</p>
      {progress.context&&<div><h3>Última tanda · vídeos en contexto</h3><p>{progress.context.newReviewedSequences} recortes nuevos de agua y comer: {progress.context.newTrainingOriginals} añadido al aprendizaje y {progress.context.newReservedOriginals} reservados para evaluar. La revisión de los límites fue visual y asistida; falta validación lingüística experta. En esa tanda no se incluyeron grabaciones de oraciones completas.</p></div>}
      <div className="vt-table"><table><caption>Resultados de los candidatos privados</caption><thead><tr><th>Modelo</th><th>Clases</th><th>Originales</th><th>Prueba reservada</th></tr></thead><tbody>{progress.models.map(row=><tr key={row.modelId}><td>{row.name}</td><td>{row.classes.length}</td><td>{row.originals}</td><td>{row.evaluationSamples?`${row.correct} / ${row.evaluationSamples} aceptadas correctas`:'Sin evaluación independiente'}</td></tr>)}</tbody></table></div>
      <p className="vt-note">{progress.mock?'Vista simulada para comprobar la interfaz local.':'Las pruebas reservadas usan pocos vídeos y vocabularios distintos; sus porcentajes no se comparan directamente. No tienen precisión validada para interpretar a personas nuevas. Los vídeos separados no garantizan personas distintas.'}</p>
      <details><summary>Cobertura de las {progress.targetCount} clases y fuentes</summary><div className="vt-coverage">{progress.targets.map(row=><span key={row.classId}>{row.label} · {row.originals||0} originales de aprendizaje{row.reservedOriginals?` · ${row.reservedOriginals} reservados`:''}</span>)}</div><p>Vídeos revisados, capturas aprobadas recuperadas y el diccionario de JuegoEduca, enlazado en recursos del Mineduc. Los vídeos de este diccionario no fueron producidos por Mineduc.</p>{progress.sources.map(source=><p key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></p>)}</details></>:<p role="status">Cargando el avance privado…</p>}
    </div>
    <div className="vt-card" aria-label="Grabaciones conectadas al reconocimiento"><h2>Tus palabras y oraciones</h2><p>Las tomas aprobadas de «Grabar señas» se incorporan automáticamente junto con las capturas de este navegador. Cada palabra u oración nueva necesita tres tomas distintas con cara, manos y movimiento suficiente.</p>
      <div className="vt-actions"><button onClick={()=>task(refreshLibrary)} disabled={busy||library.loading}>Actualizar palabras y oraciones</button>{onReviewRecordings&&<button className="vt-secondary" onClick={onReviewRecordings} disabled={busy}>Revisar grabaciones</button>}</div>
      <p role="status">{library.loading?'Comprobando las grabaciones de la biblioteca…':`${library.rows.length} tomas aprobadas aptas · ${vocabulary.length} de ${VISIBLE_TARGETS.length} palabras y oraciones activas.`}</p>
      {library.error&&<p role="alert" className="vt-error">No se pudo actualizar la biblioteca: {library.error}. Pulsa Actualizar para volver a comprobar las grabaciones.</p>}
      {library.pending.length>0&&<p className="vt-note">Pendientes de revisión: {library.pending.length}. Revisa y aprueba las tomas válidas en el administrador; después pulsa Actualizar.</p>}
      {library.cacheSaved===false&&<p className="vt-note">No se pudo guardar la caché de puntos. Las tomas se descargarán otra vez al abrir el entrenamiento.</p>}
      <details><summary>Ver disponibilidad de las {VISIBLE_TARGETS.length} palabras y oraciones</summary><div className="vt-table"><table><caption>Disponibilidad para probar cada palabra y oración con la cámara</caption><thead><tr><th>Palabra u oración</th><th>Tomas nuevas aptas</th><th>Prueba en vivo</th></tr></thead><tbody>{coverage.map(row=><tr key={row.classId}><td>{row.label}</td><td>{row.count} / {row.minimum}{library.pending.some(item=>item.classId===row.classId)?' · pendientes de revisión':''}</td><td>{row.active?'Activa':row.ready?'Falta otra clase para comparar':`Tomas que faltan: ${Math.max(0,row.minimum-row.count)}`}</td></tr>)}</tbody></table></div></details>
      {library.excluded.length>0&&<details><summary>{library.excluded.length} grabaciones que necesitan atención</summary>{library.excluded.map(row=><p key={row.id}>{label(row.classId)}: {recordingReason(row.reason)}.</p>)}</details>}
      <p className="vt-small">Las tomas de evaluación, copias y etiquetas contradictorias no cuentan para entrenar. La disponibilidad indica datos preparados; la precisión aún requiere pruebas con movimientos nuevos.</p>
    </div>
    <div className="vt-card" ref={captureSection}><h2>Entrenamiento con cámara en vivo</h2><p>Haz cualquier palabra u oración del vocabulario activo para verla sobre la cámara. Para añadir más ejemplos aquí, guarda una toma completa. Estas capturas conservan solamente puntos del movimiento en este navegador.</p>
      <div className="vt-grid"><div><div className="vt-camera"><video ref={video} muted playsInline aria-label="Vista previa de la cámara"/><canvas ref={canvas} aria-label="Puntos de manos y cara"/><div className="vt-live-result" data-state={active&&liveOn?liveResult.phase:'off'} role="status" aria-live="polite" aria-atomic="true"><small>{active&&liveOn?'Reconocimiento en vivo':'Tu cámara'}</small><strong>{liveText}</strong></div></div><div className="vt-actions"><button onClick={start} disabled={busy||active}>Activar cámara</button><button onClick={stop} disabled={!active}>Apagar cámara</button><button className="vt-secondary" onClick={toggleRecognition} disabled={!active||busy||!vocabulary.length} aria-pressed={liveOn}>{liveOn?'Pausar reconocimiento':'Reanudar reconocimiento'}</button></div>{vocabulary.length>0&&<p className="vt-small vt-live-vocabulary">Vocabulario activo: {vocabulary.map(label).join(' · ')}.</p>}</div>
      <div><label htmlFor="vt-phrase">Etiqueta para guardar la toma de entrenamiento</label><select id="vt-phrase" value={selected} onChange={e=>setSelected(e.target.value)} disabled={busy}><optgroup label="Oraciones completas">{PHRASES.map(id=><option key={id} value={id}>{label(id)}</option>)}</optgroup><optgroup label="Señas visibles">{VISIBLE_TARGETS.filter(row=>row.category!=='oraciones').map(row=><option key={row.classId} value={row.classId}>{row.label}</option>)}</optgroup></select>
      {selected===ESTOY_BIEN_CLASS&&<p className="vt-small">Referencia del entrenamiento: «yo bien» corresponde a «estoy bien». Graba la oración completa en una sola toma.</p>}
      <label htmlFor="vt-participant">Perfil declarado para esta toma</label><input id="vt-participant" value={participant} maxLength={20} disabled={busy} onChange={event=>setParticipant(event.target.value)} placeholder="P1"/><p className="vt-small">Usa códigos como P1 o P2 para personas distintas, sin nombres. El código no verifica su identidad.</p>
      {counts.map(row=><p key={row.classId} className="vt-count"><span>{label(row.classId)}</span><b>{row.count} / 3 tomas</b></p>)}
      <div className="vt-actions"><button onClick={()=>collect('record')} disabled={busy||!active}>{PHRASES.includes(selected)?'Grabar oración completa':'Grabar seña seleccionada'}</button><button onClick={train} disabled={busy||!ready}>Entrenar las {PHRASES.length} oraciones</button></div>
      <h3>Prueba con un movimiento nuevo</h3><p>Haz cualquier palabra u oración activa sin seleccionar su etiqueta. La respuesta aparece sobre la cámara. Las oraciones necesitan el movimiento completo.</p><button onClick={recognizeLive} disabled={busy||!active||!vocabulary.length}>Probar palabras y oraciones en vivo</button>
      {personal&&<p><button className="vt-secondary" onClick={()=>collect('phrase')} disabled={busy||!active}>Evaluar una oración y reservar la prueba</button></p>}
      <p className="vt-note">Prototipo personal sin prueba independiente. Sus umbrales son experimentales y puede equivocarse incluso con una puntuación alta.</p></div></div>
      <p className="vt-message" role="status">{message}</p>
      {pendingTest&&<div className="vt-feedback"><h3>Confirma qué hiciste en esta prueba</h3><p>Predicción registrada: {pendingTest.prediction.accepted?`«${label(pendingTest.prediction.classId)}»`:'el candidato se abstuvo'}. Esta confirmación se usa para evaluar.</p><label htmlFor="vt-expected">Oración realmente realizada</label><select id="vt-expected" value={expected} disabled={busy} onChange={event=>setExpected(event.target.value)}><option value="">Elige la respuesta después de ver la predicción</option>{PHRASES.map(id=><option key={id} value={id}>{label(id)}</option>)}<option value="unknown">Otro movimiento o ninguna de estas oraciones</option></select><div className="vt-actions"><button disabled={busy||!expected} onClick={confirmTest}>Guardar prueba reservada</button><button className="vt-secondary" disabled={busy} onClick={()=>setPendingTest(null)}>Descartar esta prueba</button></div></div>}
      <button className="vt-secondary" disabled={busy||localRows.length===0} onClick={()=>task(async()=>{stop();await phraseStore('clear');model.current?.dispose();model.current=null;setRows([]);setPersonal(null);setPendingTest(null);setComparison(null);setQuality([]);setMessage('Tomas personales eliminadas de este navegador.');})}>Eliminar mis tomas personales</button>
    </div>
    {progress&&<div className="vt-card"><h2>Prueba de reconocimiento con cámara</h2><p>El candidato privado aporta referencias iniciales. Tus grabaciones aptas amplían la prueba a las demás palabras y a las oraciones completas.</p><label htmlFor="vt-model">Candidato privado</label><select id="vt-model" value={candidateId} disabled={busy} onChange={e=>selectCandidate(e.target.value)}>{progress.models.map(row=><option key={row.modelId} value={row.modelId}>{row.name}</option>)}</select><div className="vt-actions"><button disabled={busy||!candidateId} onClick={load}>Cargar candidato privado</button><button disabled={busy||!active||!candidateId} onClick={recognizeLive}>Probar una seña con cámara</button></div>{signResult&&<div className="vt-recognition-result" role="status" aria-live="polite"><h3>{signResult.accepted?`Resultado del modelo: ${label(signResult.classId)}`:'Sin coincidencia suficiente'}</h3><p>{signResult.modelName}. {signResult.reason==='no-active-hands'?'No se encontró un tramo suficiente con las manos activas.':signResult.reason==='unsupported-sign'?'La coincidencia más cercana pertenece a una clase todavía no habilitada en este candidato.':signResult.reason==='ambiguous'?'Los primeros resultados son demasiado parecidos para elegir uno.':signResult.accepted?'Comprueba que el resultado coincide con el gesto que realizaste.':'El movimiento queda demasiado lejos de las referencias aprendidas.'}</p>{signResult.candidates?.length>0&&<><p>Resultados más cercanos{signResult.accepted?'':', sin reconocimiento confirmado'}:</p><ol>{signResult.candidates.map(row=><li key={row.classId}>{label(row.classId)} · {Math.round((row.similarity??row.score)*100)} % {signResult.scoreKind==='similarity'?'de similitud':'de votos de árboles'}</li>)}</ol><p className="vt-small">Estas puntuaciones comparan el movimiento con el candidato; no son porcentajes de acierto.</p></>}</div>}{(personalSigns||loaded)&&<p>Señas habilitadas para esta prueba: {vocabulary.map(label).join(' · ')}</p>}<h3>Vocabulario ampliado</h3><p>Las tomas nuevas se incorporan automáticamente al cumplir los requisitos de la tabla. Si grabaste desde la app, aprueba esas tomas y actualiza la biblioteca.</p>{personalSigns&&<p>Vocabulario ampliado activo: {personalSigns.originals} tomas y {personalSigns.classes.length} palabras y oraciones. Sin evaluación independiente; la prueba no recibe la etiqueta seleccionada para grabar.</p>}</div>}
    {error&&<p role="alert" className="vt-error">{error}</p>}
  </section>;
}
