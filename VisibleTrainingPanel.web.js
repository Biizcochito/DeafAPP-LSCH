import {useEffect,useRef,useState} from 'react';
import {createSignTracker,drawSignLandmarks} from './landmarkTracking';
import {PHRASES,trackingVector,captureFeatures,decodeCandidate,predictForest} from './training/visibleTraining';
import {phraseStore,phraseCounts,trainPersonalPhrases,predictPersonalPhrase} from './training/personalPhrases';
import {loadTrainingTensorflow} from './training/tensorflowBrowser';
import './VisibleTrainingPanel.css';

const label=id=>id.split('/').at(-1);
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export default function VisibleTrainingPanel({api,session,onAccessError}) {
  const [progress,setProgress]=useState(null),[error,setError]=useState(''),[message,setMessage]=useState('Activa la cámara para grabar una oración completa.');
  const [rows,setRows]=useState([]),[selected,setSelected]=useState(PHRASES[0]),[candidateId,setCandidateId]=useState('');
  const [active,setActive]=useState(false),[busy,setBusy]=useState(false),[personal,setPersonal]=useState(null),[loaded,setLoaded]=useState('');
  const video=useRef(null),canvas=useRef(null),live=useRef(null),alive=useRef(true),capture=useRef(null),model=useRef(null),candidate=useRef(null),working=useRef(false);
  function stop(){const state=live.current;live.current=null;capture.current=null;if(state){clearTimeout(state.timer);state.stream.getTracks().forEach(track=>track.stop());void state.tracker?.close();}if(video.current)video.current.srcObject=null;if(alive.current)setActive(false);}
  useEffect(()=>{
    alive.current=true;
    api.trainingProgress(session).then(data=>{if(alive.current){setProgress(data.progress);setCandidateId(data.progress?.models?.[0]?.modelId||'');}}).catch(e=>{if(alive.current){setError(e.message);onAccessError?.(e);}});
    phraseStore('list').then(data=>{if(alive.current)setRows(data);}).catch(e=>{if(alive.current)setError(e.message);});
    const hidden=()=>{if(document.hidden)stop();};document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',stop);
    return()=>{alive.current=false;stop();model.current?.dispose();model.current=null;candidate.current=null;document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',stop);};
  },[api,session]);
  async function task(fn){if(working.current)return;working.current=true;setBusy(true);setError('');try{await fn();}catch(e){if(alive.current){setError(e.message);onAccessError?.(e);}}finally{working.current=false;if(alive.current)setBusy(false);}}
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
    const state=live.current;if(!state?.tracker)throw Error('Primero activa la cámara.');
    for(let n=3;n;n--){setMessage(`Prepárate… ${n}`);await wait(1000);if(live.current!==state)throw Error('La cámara se apagó.');}
    state.started=performance.now();capture.current=[];
    for(let n=4;n;n--){setMessage(`Haz ${mode==='sign'?'la seña':'la oración completa'}. Capturando… ${n}`);await wait(1000);if(live.current!==state)throw Error('La toma se interrumpió.');}
    const frames=capture.current;capture.current=null;
    const features=captureFeatures(frames,{wholePhrase:mode!=='sign'});
    if(mode==='record'){
      const fingerprint=JSON.stringify(features);
      if(rows.some(row=>JSON.stringify(row.features)===fingerprint))throw Error('Esta toma ya está guardada. Graba otra nueva.');
      const row={id:crypto.randomUUID(),classId:selected,wholePhrase:true,features,createdAt:new Date().toISOString()};
      await phraseStore('put',row);const next=await phraseStore('list');
      if(alive.current){setRows(next);model.current?.dispose();model.current=null;setPersonal(null);setMessage(`Toma de «${label(selected)}» guardada en este navegador. Graba otra toma nueva.`);}
    }else{
      const result=mode==='sign'?predictForest(candidate.current,features):predictPersonalPhrase(await loadTrainingTensorflow(),model.current,features);
      if(alive.current)setMessage(result.accepted?`Propuesta experimental: «${label(result.classId)}». Comprueba si coincide con tu movimiento.`:'El candidato no encontró una coincidencia suficiente. Repite la toma completa.');
    }
  });}
  async function train(){await task(async()=>{
    stop();setMessage('Preparando el entrenamiento de tus oraciones completas…');
    const trained=await trainPersonalPhrases(await loadTrainingTensorflow(),rows,(epoch,loss)=>{if(alive.current)setMessage(`Entrenando: época ${epoch}/30 · pérdida ${loss.toFixed(4)}. Esto no mide precisión.`);},()=>!alive.current);
    if(!alive.current){trained.model.dispose();return;}
    model.current?.dispose();model.current=trained.model;setPersonal(trained.report);setMessage('Candidato personal entrenado. Activa la cámara y prueba una toma nueva sin seleccionar su etiqueta.');
  });}
  async function load(){await task(async()=>{
    const data=await api.trainingCandidate(session,candidateId),decoded=await decodeCandidate(data.candidate);
    if(decoded.id!==candidateId||decoded.classes.some(id=>!progress.targets.some(row=>row.classId===id)))throw Error('El candidato no coincide con el catálogo visible.');
    if(alive.current){candidate.current=decoded;setLoaded(candidateId);setMessage('Candidato cargado para una prueba privada de una seña aislada.');}
  });}
  const counts=phraseCounts(rows),ready=counts.every(row=>row.count>=3);
  return <section className="visible-training" aria-label="Avance de entrenamiento del catálogo visible">
    <div className="vt-card"><p className="vt-kicker">CATÁLOGO VISIBLE · AVANCE REAL</p><h2>De tus movimientos a una oración.</h2><p>Los candidatos siguen en evaluación. Las oraciones se aprenden como tomas completas; no se construyen pegando señas sueltas.</p>
      {progress?<><div className="vt-stats"><div><b>{progress.models.length}</b><span>Candidatos entrenados</span></div><div><b>{progress.trainedCount} / {progress.targetCount}</b><span>Clases con datos de aprendizaje</span></div><div><b>{progress.originals}</b><span>Grabaciones originales</span></div></div><p>Actualizado: {new Date(progress.updatedAt).toLocaleString('es-CL')}. Los aumentos artificiales no cuentan como personas ni grabaciones nuevas.</p>
      <div className="vt-table"><table><caption>Resultados de los candidatos privados</caption><thead><tr><th>Modelo</th><th>Clases</th><th>Originales</th><th>Prueba reservada</th></tr></thead><tbody>{progress.models.map(row=><tr key={row.modelId}><td>{row.name}</td><td>{row.classes.length}</td><td>{row.originals}</td><td>{row.evaluationSamples?`${row.correct} / ${row.evaluationSamples} aceptadas correctas`:'Sin evaluación independiente'}</td></tr>)}</tbody></table></div>
      <p className="vt-note">{progress.mock?'Vista simulada para comprobar la interfaz local.':'Los dos candidatos evaluados no aceptaron correctamente ninguna de las cuatro tomas reservadas. No tienen precisión validada para interpretar a personas nuevas. Los vídeos separados no garantizan personas distintas.'}</p>
      <details><summary>Cobertura de las 32 clases y fuentes</summary><div className="vt-coverage">{progress.targets.map(row=><span key={row.classId}>{row.label} · {row.originals||0} originales</span>)}</div><p>Vídeos revisados, capturas aprobadas recuperadas y el diccionario de JuegoEduca, enlazado en recursos del Mineduc. Los vídeos de este diccionario no fueron producidos por Mineduc.</p>{progress.sources.map(source=><p key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></p>)}</details></>:<p role="status">Cargando el avance privado…</p>}
    </div>
    <div className="vt-card"><h2>Tus tres oraciones completas</h2><p>Graba al menos tres tomas nuevas de cada oración. Se guardan solamente puntos del movimiento en este navegador. El candidato personal vive en esta sesión; al salir puedes volver a entrenarlo con las tomas guardadas.</p>
      <div className="vt-grid"><div><div className="vt-camera"><video ref={video} muted playsInline aria-label="Vista previa de la cámara"/><canvas ref={canvas} aria-label="Puntos de manos y cara"/>{!active&&<span>Cámara apagada</span>}</div><div className="vt-actions"><button onClick={start} disabled={busy||active}>Activar cámara</button><button onClick={stop} disabled={!active}>Apagar cámara</button></div></div>
      <div><label htmlFor="vt-phrase">Etiqueta para guardar la toma de entrenamiento</label><select id="vt-phrase" value={selected} onChange={e=>setSelected(e.target.value)} disabled={busy}>{PHRASES.map(id=><option key={id} value={id}>{label(id)}</option>)}</select>
      {counts.map(row=><p key={row.classId} className="vt-count"><span>{label(row.classId)}</span><b>{row.count} / 3 tomas</b></p>)}
      <div className="vt-actions"><button onClick={()=>collect('record')} disabled={busy||!active}>Grabar oración completa</button><button onClick={train} disabled={busy||!ready}>Entrenar las 3 oraciones</button></div>
      <h3>Prueba con un movimiento nuevo</h3><p>Haz cualquiera de las tres oraciones. La prueba recibe tus puntos y no utiliza la etiqueta seleccionada para grabar.</p><button onClick={()=>collect('phrase')} disabled={busy||!active||!personal}>Interpretar mi oración con cámara</button>
      <p className="vt-note">Prototipo personal sin prueba independiente. Sus umbrales son experimentales y puede equivocarse incluso con una puntuación alta.</p></div></div>
      <p className="vt-message" role="status">{message}</p>
      <button className="vt-secondary" disabled={busy||rows.length===0} onClick={()=>task(async()=>{await phraseStore('clear');model.current?.dispose();model.current=null;setRows([]);setPersonal(null);setMessage('Tomas personales eliminadas de este navegador.');})}>Eliminar mis tomas personales</button>
    </div>
    {progress&&<div className="vt-card"><h2>Probar los candidatos de señas</h2><p>Prueba una seña aislada de las clases del candidato. Estos modelos no reconocen oraciones completas.</p><label htmlFor="vt-model">Candidato privado</label><select id="vt-model" value={candidateId} disabled={busy} onChange={e=>{setCandidateId(e.target.value);candidate.current=null;setLoaded('');}}>{progress.models.map(row=><option key={row.modelId} value={row.modelId}>{row.name}</option>)}</select><div className="vt-actions"><button disabled={busy||!candidateId} onClick={load}>Cargar candidato privado</button><button disabled={busy||!active||loaded!==candidateId} onClick={()=>collect('sign')}>Probar una seña con cámara</button></div>{loaded&&<p>Clases disponibles: {candidate.current?.classes.map(label).join(' · ')}</p>}</div>}
    {error&&<p role="alert" className="vt-error">{error}</p>}
  </section>;
}
