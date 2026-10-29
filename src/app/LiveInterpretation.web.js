import {useEffect,useRef,useState} from 'react';
import * as Speech from 'expo-speech';
import HandConstellation from '../ui/HandConstellation';
import {createSignTracker,drawSignLandmarks} from '../camera/landmarkTracking';
import {freshLandmarks,withTrackingTimeout} from '../camera/trackingOverlay';
import {trackingVector} from '../training/visibleTraining';
import {createSignInferenceClient} from '../training/signInferenceWorker';
import {createLiveSignRecognizer} from '../training/liveSignRecognition';
import {createLiveInterpretationCamera} from '../training/liveInterpretationCamera';
import {createLiveSignSpeech,spokenSignLabel} from '../training/liveSignSpeech';
import {loadApprovedVocabulary} from '../training/approvedVocabulary';
import {buildVocabularyCandidate} from '../training/vocabularyCandidate';
import {startApprovedLibrarySync} from '../training/recordingLibrarySync';
import {publicApprovedLibrary} from '../training/publicApprovedLibrary';
import {VISIBLE_TARGETS} from '../training/trainingAssistant';
import '../ui/theme.css';
import './LiveInterpretation.css';

const PHASES={off:'Tu espacio para conversar',loading:'Preparando la cámara…',position:'Coloca tu cara y tus manos en el encuadre',
  tracking:'Haz la seña completa, a tu ritmo',recognizing:'Estoy reconociendo tu seña…',uncertain:'Prueba de nuevo, no encontré una coincidencia clara',
  matched:'Seña reconocida',model:'Estamos preparando las señas',error:'El reconocimiento necesita reiniciarse'};
const cameraError=error=>error.name==='NotAllowedError'?'Permite el acceso a la cámara desde el navegador y vuelve a intentarlo.':
  error.name==='NotFoundError'?'No se encontró una cámara. Conecta una y vuelve a intentarlo.':error.message||'No se pudo iniciar la cámara. Inténtalo de nuevo.';

export default function LiveInterpretation({client,onBack}) {
  const video=useRef(null),canvas=useRef(null),camera=useRef(null),voice=useRef(null),sync=useRef(null);
  const candidate=useRef(null),request=useRef(null),last=useRef(null),absent=useRef(null),live=useRef({phase:'off'});
  const [cameraState,setCameraState]=useState('off'),[result,setResult]=useState({phase:'off'});
  const [library,setLibrary]=useState({loading:true,words:[],message:'Preparando las señas de la biblioteca…'});
  const [error,setError]=useState(''),[voiceError,setVoiceError]=useState(''),[voiceOn,setVoiceOn]=useState(true),[history,setHistory]=useState([]);
  const voicePreference=useRef(true);
  const voiceSupported=typeof window!=='undefined'&&!!window.speechSynthesis&&typeof window.SpeechSynthesisUtterance==='function';
  useEffect(()=>{
    let alive=true;
    const update=result=>{
      if(!alive)return;
      live.current=result;setResult(result);voice.current?.update(result);
      const confirmed=result.phase==='matched'&&result.prediction?.accepted===true&&result.prediction.classId;
      if(confirmed){
        if(last.current!==confirmed||absent.current!==null&&performance.now()-absent.current>=1000){
          setHistory(rows=>[...rows,{label:spokenSignLabel(confirmed),id:Date.now()+Math.random()}].slice(-6));
        }
        last.current=confirmed;absent.current=null;
      }else if(absent.current===null)absent.current=performance.now();
    };
    if(voiceSupported)voice.current=createLiveSignSpeech({speech:Speech,enabled:voicePreference.current,
      onError:message=>{if(alive)setVoiceError(message);},onSpeak:()=>{if(alive)setVoiceError('');}});
    camera.current=createLiveInterpretationCamera({video:video.current,canvas:canvas.current,
      getMedia:constraints=>{if(!navigator.mediaDevices?.getUserMedia)throw Error('La cámara requiere HTTPS o localhost y un navegador compatible.');return navigator.mediaDevices.getUserMedia(constraints);},
      createTracker:createSignTracker,createInference:createSignInferenceClient,createRecognizer:createLiveSignRecognizer,
      freshLandmarks,trackingVector,draw:drawSignLandmarks,withTimeout:withTrackingTimeout,
      onResult:update,onState:state=>{if(alive)setCameraState(state);},onError:error=>{if(alive)setError(cameraError(error));}});
    async function refresh(){
      request.current?.abort();const controller=new AbortController();request.current=controller;
      setLibrary(value=>({...value,loading:true,message:'Actualizando las señas de la biblioteca…'}));
      // A withdrawn approval must stop contributing while its replacement loads.
      candidate.current=null;camera.current?.setModel(null);voice.current?.reset();
      try{
        const data=await loadApprovedVocabulary({api:publicApprovedLibrary(client,controller.signal),client,targets:VISIBLE_TARGETS,signal:controller.signal,
          onProgress:message=>{if(alive&&!controller.signal.aborted)setLibrary(value=>({...value,message}));}});
        const built=await buildVocabularyCandidate(data.rows,VISIBLE_TARGETS,{cancelled:()=>!alive||controller.signal.aborted});
        if(!alive||controller.signal.aborted||!built)return;
        candidate.current=built.candidate;camera.current?.setModel(built.candidate);
        setLibrary({loading:false,words:built.candidate?.enabledClasses||built.candidate?.classes||[],message:''});
      }catch(error){if(alive&&!controller.signal.aborted){setLibrary({loading:false,words:[],message:'',error:error.message});throw error;}}
    }
    sync.current=startApprovedLibrarySync({client,refresh,onError:error=>{if(alive){camera.current?.setModel(null);voice.current?.reset();setLibrary(value=>({...value,loading:false,error:error.message}));}},
      onConnected:()=>{if(alive){camera.current?.setModel(candidate.current);setLibrary(value=>value.error?{...value,error:undefined}:value);}}});
    const hidden=()=>{if(document.hidden)camera.current?.stop();};
    const leave=()=>camera.current?.stop();
    document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',leave);
    return()=>{alive=false;sync.current?.close();request.current?.abort();camera.current?.close();voice.current?.close();camera.current=null;voice.current=null;
      document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',leave);};
  },[client,voiceSupported]);
  function toggleVoice(){
    const next=!voicePreference.current;voicePreference.current=next;setVoiceOn(next);setVoiceError('');voice.current?.setEnabled(next);
    if(next)voice.current?.update(live.current);
  }
  function testVoice(){voicePreference.current=true;setVoiceOn(true);setVoiceError('');voice.current?.setEnabled(true);voice.current?.preview();}
  const matched=result.phase==='matched'&&result.prediction?.accepted===true;
  const word=matched?spokenSignLabel(result.prediction.classId):'';
  const running=cameraState!=='off';
  return <div className="deaf-app live-interpretation">
    <header className="li-nav"><a href="/" onClick={event=>{if(event.button||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();onBack();}} aria-label="DeafApp, volver al inicio">
      <img src="/brand/deafapp-mark.svg" alt="" width="34" height="34"/><span>Deaf<span>App</span></span></a>
      <button className="li-back" onClick={onBack}>← Volver al inicio</button></header>
    <main className="li-main">
      <div className="li-heading"><span className="li-eyebrow">LSCh · TEXTO + VOZ</span><h1>Tus manos tienen <em>voz.</em></h1>
        <p>Haz una seña frente a la cámara. Nosotros ponemos las palabras.</p></div>
      <div className="li-workspace">
        <section className="li-camera-section" aria-label="Cámara de interpretación">
          <div className={`li-camera${matched?' li-matched':''}`}>
            <video ref={video} muted playsInline autoPlay aria-label="Tu cámara en vivo"/>
            <canvas ref={canvas} aria-hidden="true"/>
            {!running&&<div className="li-welcome-camera"><div className="li-hand" aria-hidden="true"><HandConstellation poses={['open','relaxed','soft']}/></div><h2>Cuando quieras, empezamos.</h2><p>Busca buena luz y deja espacio para tus manos.</p></div>}
            <span className={`li-camera-badge${cameraState==='on'?' li-is-on':''}`}><i aria-hidden="true"/>{cameraState==='on'?'En vivo':cameraState==='starting'?'Conectando':'Cámara apagada'}</span>
            {running&&<div className="li-overlay" role="status" aria-live="polite"><span>{PHASES[result.phase]||'Preparando la interpretación…'}</span>{matched&&<strong>{word}</strong>}</div>}
          </div>
          <div className="li-camera-actions"><button className="li-primary" disabled={!running&&(library.loading||library.error||!candidate.current)} onClick={()=>{setError('');if(running)camera.current?.stop();else void camera.current?.start();}}>{running?'Detener cámara':'Activar cámara'}</button>
            <span>La cámara se usa en este dispositivo.<br/>Esta sesión no se graba ni se envía.</span></div>
          {error&&<p className="li-error" role="alert">{error}</p>}
        </section>
        <section className="li-conversation" aria-labelledby="li-result-title">
          <div className="li-result-heading"><span className="li-eyebrow">DE TUS MANOS A LAS PALABRAS</span><span className="li-text-badge">Texto en vivo</span></div>
          <div className="li-current" role="status" aria-live="polite" aria-atomic="true"><h2 id="li-result-title">{matched?'Esto es lo que reconocí':'Aquí aparece tu seña'}</h2>
            <p className={matched?'li-word':'li-placeholder'}>{matched?word:'Te escuchamos con la mirada.'}</p>
            <p className="li-result-hint">{matched?'Comprueba que coincide con lo que quieres decir.':running?PHASES[result.phase]||'Preparando…':'Activa la cámara y exprésate a tu ritmo.'}</p></div>
          <div className="li-voice"><div><strong>Voz en español</strong><span>{voiceSupported?(voiceOn?'Leer cada seña reconocida':'Voz silenciada'):'Tu navegador no admite voz; puedes usar el texto.'}</span></div>
            <button aria-pressed={voiceOn} disabled={!voiceSupported} onClick={toggleVoice}>{voiceOn?'Silenciar voz':'Activar voz'}</button></div>
          <button className="li-test-voice" disabled={!voiceSupported} onClick={testVoice}>♫ Probar voz</button>
          {voiceError&&<p className="li-error" role="status">{voiceError}</p>}
          <div className="li-history"><div><h3>En esta conversación</h3><button disabled={!history.length} onClick={()=>setHistory([])}>Limpiar</button></div>
            {history.length?<ol aria-label="Últimas señas reconocidas">{history.map(row=><li key={row.id}>{row.label}</li>)}</ol>:<p>Las últimas señas reconocidas aparecerán aquí.</p>}</div>
          <p className="li-library-note">Reconoce las señas guardadas en la biblioteca que están habilitadas para interpretación. La biblioteca se actualiza al aprobar nuevos aportes con datos suficientes.</p>
        </section>
      </div>
      <section className="li-bottom" aria-label="Ayuda y señas disponibles"><div className="li-tips"><span>01 <b>Busca buena luz</b></span><span>02 <b>Muestra cara y manos</b></span><span>03 <b>Haz la seña completa</b></span></div>
        <details className="li-vocabulary"><summary>{library.loading?'Preparando biblioteca…':`${library.words.length} palabras y oraciones habilitadas`}<span>Ver señas</span></summary>
          {library.loading?<p role="status">{library.message}</p>:<div className="li-chips">{library.words.map(id=><span key={id}>{spokenSignLabel(id)}</span>)}</div>}
          {!library.loading&&!library.words.length&&!library.error&&<p>Se necesitan al menos tres tomas aprobadas distintas por seña y datos de seguimiento aptos para preparar la interpretación.</p>}
        </details>
        {library.loading&&<p className="li-sync-status" role="status">{library.message}</p>}
        {library.error&&<div className="li-error" role="alert">{library.error} <button onClick={()=>sync.current?.request()}>Reintentar</button></div>}
        {!library.loading&&!library.words.length&&!library.error&&<p className="li-sync-status">Aún no hay suficientes tomas aptas para interpretar. Puedes seguir aportando señas desde «Grabar».</p>}
      </section>
    </main>
  </div>;
}
