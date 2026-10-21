import {createPersonalSignCandidate} from './training/sequenceCandidate';
import {canonicalPhraseLabel,ESTOY_BIEN_CLASS} from './training/phraseLabels';
import {useEffect,useMemo,useRef,useState} from 'react';
import {createSignTracker,drawSignLandmarks} from './landmarkTracking';
import {PHRASES,trackingVector,captureFeatures,decodeCandidate,predictForest} from './training/visibleTraining';
import {phraseStore,phraseCounts,trainPersonalPhrases,predictPersonalPhrase} from './training/personalPhrases';
import {loadTrainingTensorflow} from './training/tensorflowBrowser';
import {sequenceKey} from './training/assistantData';
import {captureQuality,compareCandidates,VISIBLE_TARGETS} from './training/trainingAssistant';
import TrainingAssistant from './TrainingAssistant.web';
import './VisibleTrainingPanel.css';

const label=id=>canonicalPhraseLabel(id.split('/').at(-1));
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export default function VisibleTrainingPanel({api,session,onAccessError}) {
  const [progress,setProgress]=useState(null),[error,setError]=useState(''),[message,setMessage]=useState('Activa la cámara para grabar una oración completa.');
  const [rows,setRows]=useState([]),[selected,setSelected]=useState(PHRASES[0]),[candidateId,setCandidateId]=useState('');
  const [active,setActive]=useState(false),[busy,setBusy]=useState(false),[personal,setPersonal]=useState(null),[loaded,setLoaded]=useState('');
  const [quality,setQuality]=useState([]),[comparison,setComparison]=useState(null),[participant,setParticipant]=useState('P1');
  const [pendingTest,setPendingTest]=useState(null),[expected,setExpected]=useState(''),[signResult,setSignResult]=useState(null),[personalSigns,setPersonalSigns]=useState(null);
  const committeeCache=useRef(new Map()),captureSection=useRef(null),localSignCandidate=useRef(null);
  const video=useRef(null),canvas=useRef(null),live=useRef(null),alive=useRef(true),capture=useRef(null),model=useRef(null),candidate=useRef(null),working=useRef(false);
  function stop(){const state=live.current;live.current=null;capture.current=null;if(state){clearTimeout(state.timer);state.stream.getTracks().forEach(track=>track.stop());void state.tracker?.close();}if(video.current)video.current.srcObject=null;if(alive.current)setActive(false);}
  useEffect(()=>{
    alive.current=true;
    api.trainingProgress(session).then(data=>{if(alive.current){setProgress(data.progress);setCandidateId(data.progress?.primaryModelId||data.progress?.models?.[0]?.modelId||'');}}).catch(e=>{if(alive.current){setError(e.message);onAccessError?.(e);}});
    phraseStore('list').then(data=>{if(alive.current)setRows(data);}).catch(e=>{if(alive.current)setError(e.message);});
    const hidden=()=>{if(document.hidden)stop();};document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',stop);
    return()=>{alive.current=false;stop();model.current?.dispose();model.current=null;candidate.current=null;committeeCache.current.clear();document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',stop);};
  },[api,session]);
  async function task(fn){if(working.current)return;working.current=true;setBusy(true);setError('');try{await fn();}catch(e){if(alive.current){setError(e.message);if(e.code==='session_expired')onAccessError?.(e);}}finally{working.current=false;if(alive.current)setBusy(false);}}
  async function start(){await task(async()=>{
    setMessage('Preparando el seguimiento de manos y cara…');
    const stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480},facingMode:'user'},audio:false});
    if(!alive.current){stream.getTracks().forEach(track=>track.stop());return;}
    const state={stream,tracker:null,timer:null};live.current=state;
    try{
      video.current.srcObject=stream;await video.current.play();state.tracker=await createSignTracker();
      if(live.current!==state){await state.tracker.close();return;}
      state.tracker.onResults(result=>{
        if(live.current!==state)return;
        const v=video.current,c=canvas.current;c.width=v.videoWidth;c.height=v.videoHeight;
        const ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);drawSignLandmarks(ctx,result);
        if(capture.current){capture.current.push({timeMs:performance.now()-state.started,vector:trackingVector(result,v.videoWidth,v.videoHeight)});}
      });
      const tick=async()=>{if(live.current!==state)return;try{await state.tracker.send({image:video.current});if(live.current===state)state.timer=setTimeout(tick,80);}catch(e){stop();if(alive.current)setError(e.message);}};
      setActive(true);setMessage('Cámara preparada. Mantén la cara y las manos en el encuadre.');void tick();
    }catch(e){stop();throw e;}
  });}
  async function collect(mode){await task(async()=>{
    if(!/^[A-Za-z0-9_-]{1,20}$/.test(participant))throw Error('Usa un código de perfil de 1 a 20 letras o números, sin nombres personales.');
    if(mode==='record'&&!VISIBLE_TARGETS.some(row=>row.classId===selected))throw Error('Selecciona una seña u oración visible.');
    const wholePhrase=mode==='record'?PHRASES.includes(selected):mode==='phrase';
    const state=live.current;if(!state?.tracker)throw Error('Primero activa la cámara.');
    if(mode==='sign'){setSignResult(null);if(!localSignCandidate.current&&(!candidate.current||loaded!==candidateId))await readCandidate();}
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
      if(alive.current){setRows(next);if(wholePhrase){model.current?.dispose();model.current=null;setPersonal(null);}if(!wholePhrase){localSignCandidate.current=null;setPersonalSigns(null);}setMessage(`Toma de «${label(selected)}» guardada en este navegador. Graba otra toma nueva.`);}
    }else{
      const result=mode==='sign'?predictForest(localSignCandidate.current||candidate.current,features):predictPersonalPhrase(await loadTrainingTensorflow(),model.current,features);
      if(alive.current){if(mode==='sign')setSignResult({...result,modelName:localSignCandidate.current?'Personal de este navegador':progress.models.find(row=>row.modelId===candidateId)?.name});setMessage(result.accepted?`Propuesta experimental: «${label(result.classId)}». Comprueba si coincide con tu movimiento.`:'El candidato no encontró una coincidencia suficiente. Revisa la toma completa.');
        if(mode==='phrase'){setExpected('');setPendingTest({features,prediction:result,modelId:personal.modelId,participantCode:participant});}}
    }
  });}
  async function train(){await task(async()=>{
    stop();setMessage('Preparando el entrenamiento de tus oraciones completas…');
    const trained=await trainPersonalPhrases(await loadTrainingTensorflow(),rows,(epoch,loss)=>{if(alive.current)setMessage(`Entrenando: época ${epoch}/30 · pérdida ${loss.toFixed(4)}. Esto no mide precisión.`);},()=>!alive.current);
    if(!alive.current){trained.model.dispose();return;}
    model.current?.dispose();model.current=trained.model;setPersonal({...trained.report,modelId:crypto.randomUUID()});setPendingTest(null);setMessage('Candidato personal entrenado. Activa la cámara y prueba una toma nueva sin seleccionar su etiqueta.');
  });}
  const lastSign=useMemo(()=>[...rows].reverse().find(row=>row.wholePhrase===false&&row.split==='train'&&VISIBLE_TARGETS.some(target=>target.classId===row.classId)),[rows]);
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
  async function readCandidate(){
    const data=await api.trainingCandidate(session,candidateId),decoded=await decodeCandidate(data.candidate);
    if(decoded.id!==candidateId||decoded.classes.some(id=>!progress.targets.some(row=>row.classId===id)))throw Error('El candidato no coincide con el catálogo visible.');
    if(alive.current){candidate.current=decoded;localSignCandidate.current=null;setPersonalSigns(null);setLoaded(candidateId);setSignResult(null);}
  }
  async function load(){await task(async()=>{await readCandidate();setMessage('Candidato cargado para una prueba privada de una seña aislada.');});}
  async function trainSigns(){await task(async()=>{const trained=await createPersonalSignCandidate(rows,VISIBLE_TARGETS.filter(row=>row.category!=='oraciones').map(row=>row.classId));localSignCandidate.current=trained;setPersonalSigns(trained.report);setSignResult(null);setMessage('Modelo personal de señas preparado con tus tomas. Prueba un movimiento nuevo sin indicar su etiqueta.');});}
  const counts=useMemo(()=>phraseCounts(rows),[rows]),ready=counts.every(row=>row.count>=3);
  return <section className="visible-training" aria-label="Avance de entrenamiento del catálogo visible">
    <TrainingAssistant progress={progress} rows={rows} quality={quality} personal={personal} comparison={comparison} busy={busy} onAction={assistantAction} onCompare={compare} onReview={reviewComparison} lastSign={lastSign}/>
    <div className="vt-card"><p className="vt-kicker">CATÁLOGO VISIBLE · AVANCE REAL</p><h2>De tus movimientos a una oración.</h2><p>Los candidatos siguen en evaluación. Las oraciones se aprenden como tomas completas; no se construyen pegando señas sueltas.</p>
      {progress?<><div className="vt-stats"><div><b>{progress.models.length}</b><span>Candidatos entrenados</span></div><div><b>{progress.trainedCount} / {progress.targetCount}</b><span>Clases con datos de aprendizaje</span></div><div><b>{progress.availableOriginals??progress.originals}</b><span>Secuencias originales disponibles</span></div></div><p>Actualizado: {new Date(progress.updatedAt).toLocaleString('es-CL')}. {progress.originals} originales de aprendizaje{progress.reservedOriginals?` y ${progress.reservedOriginals} secuencias reservadas de la última tanda`:''}. Los aumentos artificiales no cuentan como personas ni grabaciones nuevas.</p>
      {progress.context&&<div><h3>Última tanda · vídeos en contexto</h3><p>{progress.context.newReviewedSequences} recortes nuevos de agua y comer: {progress.context.newTrainingOriginals} añadido al aprendizaje y {progress.context.newReservedOriginals} reservados para evaluar. La revisión de los límites fue visual y asistida; falta validación lingüística experta. Las oraciones todavía necesitan grabaciones completas.</p></div>}
      <div className="vt-table"><table><caption>Resultados de los candidatos privados</caption><thead><tr><th>Modelo</th><th>Clases</th><th>Originales</th><th>Prueba reservada</th></tr></thead><tbody>{progress.models.map(row=><tr key={row.modelId}><td>{row.name}</td><td>{row.classes.length}</td><td>{row.originals}</td><td>{row.evaluationSamples?`${row.correct} / ${row.evaluationSamples} aceptadas correctas`:'Sin evaluación independiente'}</td></tr>)}</tbody></table></div>
      <p className="vt-note">{progress.mock?'Vista simulada para comprobar la interfaz local.':'Las pruebas reservadas usan pocos vídeos y vocabularios distintos; sus porcentajes no se comparan directamente. No tienen precisión validada para interpretar a personas nuevas. Los vídeos separados no garantizan personas distintas.'}</p>
      <details><summary>Cobertura de las {progress.targetCount} clases y fuentes</summary><div className="vt-coverage">{progress.targets.map(row=><span key={row.classId}>{row.label} · {row.originals||0} originales de aprendizaje{row.reservedOriginals?` · ${row.reservedOriginals} reservados`:''}</span>)}</div><p>Vídeos revisados, capturas aprobadas recuperadas y el diccionario de JuegoEduca, enlazado en recursos del Mineduc. Los vídeos de este diccionario no fueron producidos por Mineduc.</p>{progress.sources.map(source=><p key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></p>)}</details></>:<p role="status">Cargando el avance privado…</p>}
    </div>
    <div className="vt-card" ref={captureSection}><h2>Tus oraciones completas</h2><p>Graba al menos tres tomas nuevas de cada oración. También puedes aportar señas individuales para que el asistente las compare. Se guardan solamente puntos del movimiento en este navegador. El candidato personal vive en esta sesión; al salir puedes volver a entrenarlo con las tomas guardadas.</p>
      <div className="vt-grid"><div><div className="vt-camera"><video ref={video} muted playsInline aria-label="Vista previa de la cámara"/><canvas ref={canvas} aria-label="Puntos de manos y cara"/>{!active&&<span>Cámara apagada</span>}</div><div className="vt-actions"><button onClick={start} disabled={busy||active}>Activar cámara</button><button onClick={stop} disabled={!active}>Apagar cámara</button></div></div>
      <div><label htmlFor="vt-phrase">Etiqueta para guardar la toma de entrenamiento</label><select id="vt-phrase" value={selected} onChange={e=>setSelected(e.target.value)} disabled={busy}><optgroup label="Oraciones completas">{PHRASES.map(id=><option key={id} value={id}>{label(id)}</option>)}</optgroup><optgroup label="Señas visibles">{VISIBLE_TARGETS.filter(row=>row.category!=='oraciones').map(row=><option key={row.classId} value={row.classId}>{row.label}</option>)}</optgroup></select>
      {selected===ESTOY_BIEN_CLASS&&<p className="vt-small">Referencia del entrenamiento: «yo bien» corresponde a «estoy bien». Graba la oración completa en una sola toma.</p>}
      <label htmlFor="vt-participant">Perfil declarado para esta toma</label><input id="vt-participant" value={participant} maxLength={20} disabled={busy} onChange={event=>setParticipant(event.target.value)} placeholder="P1"/><p className="vt-small">Usa códigos como P1 o P2 para personas distintas, sin nombres. El código no verifica su identidad.</p>
      {counts.map(row=><p key={row.classId} className="vt-count"><span>{label(row.classId)}</span><b>{row.count} / 3 tomas</b></p>)}
      <div className="vt-actions"><button onClick={()=>collect('record')} disabled={busy||!active}>{PHRASES.includes(selected)?'Grabar oración completa':'Grabar seña seleccionada'}</button><button onClick={train} disabled={busy||!ready}>Entrenar las {PHRASES.length} oraciones</button></div>
      <h3>Prueba con un movimiento nuevo</h3><p>Haz cualquiera de las {PHRASES.length} oraciones. La prueba recibe tus puntos y no utiliza la etiqueta seleccionada para grabar.</p><button onClick={()=>collect('phrase')} disabled={busy||!active||!personal}>Interpretar mi oración con cámara</button>
      <p className="vt-note">Prototipo personal sin prueba independiente. Sus umbrales son experimentales y puede equivocarse incluso con una puntuación alta.</p></div></div>
      <p className="vt-message" role="status">{message}</p>
      {pendingTest&&<div className="vt-feedback"><h3>Confirma qué hiciste en esta prueba</h3><p>Predicción registrada: {pendingTest.prediction.accepted?`«${label(pendingTest.prediction.classId)}»`:'el candidato se abstuvo'}. Esta confirmación se usa para evaluar.</p><label htmlFor="vt-expected">Oración realmente realizada</label><select id="vt-expected" value={expected} disabled={busy} onChange={event=>setExpected(event.target.value)}><option value="">Elige la respuesta después de ver la predicción</option>{PHRASES.map(id=><option key={id} value={id}>{label(id)}</option>)}<option value="unknown">Otro movimiento o ninguna de estas oraciones</option></select><div className="vt-actions"><button disabled={busy||!expected} onClick={confirmTest}>Guardar prueba reservada</button><button className="vt-secondary" disabled={busy} onClick={()=>setPendingTest(null)}>Descartar esta prueba</button></div></div>}
      <button className="vt-secondary" disabled={busy||rows.length===0} onClick={()=>task(async()=>{stop();await phraseStore('clear');model.current?.dispose();model.current=null;setRows([]);setPersonal(null);localSignCandidate.current=null;setPersonalSigns(null);setPendingTest(null);setComparison(null);setQuality([]);setMessage('Tomas personales eliminadas de este navegador.');})}>Eliminar mis tomas personales</button>
    </div>
    {progress&&<div className="vt-card"><h2>Prueba de reconocimiento con cámara</h2><p>Prueba una seña aislada de las clases del candidato. Estos modelos no reconocen oraciones completas.</p><label htmlFor="vt-model">Candidato privado</label><select id="vt-model" value={candidateId} disabled={busy} onChange={e=>{setCandidateId(e.target.value);candidate.current=null;localSignCandidate.current=null;setPersonalSigns(null);setLoaded('');setSignResult(null);}}>{progress.models.map(row=><option key={row.modelId} value={row.modelId}>{row.name}</option>)}</select><div className="vt-actions"><button disabled={busy||!candidateId} onClick={load}>Cargar candidato privado</button><button disabled={busy||!active||!candidateId} onClick={()=>collect('sign')}>Probar una seña con cámara</button></div>{signResult&&<div className="vt-recognition-result" role="status" aria-live="polite"><h3>{signResult.accepted?`Resultado del modelo: ${label(signResult.classId)}`:'Sin coincidencia suficiente'}</h3><p>{signResult.modelName}. {signResult.reason==='no-active-hands'?'No se encontró un tramo suficiente con las manos activas.':signResult.reason==='unsupported-sign'?'La coincidencia más cercana pertenece a una clase todavía no habilitada en este candidato.':signResult.reason==='ambiguous'?'Los primeros resultados son demasiado parecidos para elegir uno.':signResult.accepted?'Comprueba que el resultado coincide con el gesto que realizaste.':'El movimiento queda demasiado lejos de las referencias aprendidas.'}</p>{signResult.candidates?.length>0&&<><p>Resultados más cercanos{signResult.accepted?'':', sin reconocimiento confirmado'}:</p><ol>{signResult.candidates.map(row=><li key={row.classId}>{label(row.classId)} · {Math.round((row.similarity??row.score)*100)} % {signResult.scoreKind==='similarity'?'de similitud':'de votos de árboles'}</li>)}</ol><p className="vt-small">Estas puntuaciones comparan el movimiento con el candidato; no son porcentajes de acierto.</p></>}</div>}{(personalSigns||loaded)&&<p>Señas habilitadas para esta prueba: {(localSignCandidate.current?.classes||candidate.current?.enabledClasses||candidate.current?.classes)?.map(label).join(' · ')}</p>}<h3>Adaptar a mis movimientos</h3><p>Guarda tres tomas distintas de al menos dos señas en el apartado de grabación, por ejemplo hola y agua. Después entrena con tus tomas y prueba un gesto nuevo. Se conservan solo puntos en este navegador.</p><button disabled={busy} onClick={trainSigns}>Entrenar con mis señas</button>{personalSigns&&<p>Modelo personal activo: {personalSigns.originals} tomas y {personalSigns.classes.length} señas. Sin evaluación independiente; la prueba no recibe la etiqueta seleccionada para grabar.</p>}</div>}
    {error&&<p role="alert" className="vt-error">{error}</p>}
  </section>;
}
