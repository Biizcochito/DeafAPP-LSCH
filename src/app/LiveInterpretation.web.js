import {useEffect,useRef,useState} from 'react';
import * as Speech from 'expo-speech';
import HandConstellation from '../ui/HandConstellation';
import {prepareSignTracker,drawSignLandmarks} from '../camera/landmarkTracking';
import {freshLandmarks,withTrackingTimeout} from '../camera/trackingOverlay';
import {trackingVector} from '../training/visibleTraining';
import {createSignInferenceClient} from '../training/signInferenceWorker';
import {createLiveSignRecognizer} from '../training/liveSignRecognition';
import {createLiveInterpretationCamera} from '../training/liveInterpretationCamera';
import {createLiveSignSpeech,spokenSignLabel} from '../training/liveSignSpeech';
import {startPreparedRecognition} from '../training/preparedRecognition';
import {useLiveConversation} from '../training/useLiveConversation';
import ConversationControls from '../training/ConversationControls.web';
import '../ui/theme.css';
import './LiveInterpretation.css';

const PHASES={off:'Tu espacio para conversar',loading:'Preparando la cámara…',position:'Coloca tu cara y tus manos en el encuadre',
  ready:'Haz otra seña u oración completa, a tu ritmo.',
  tracking:'Haz la seña completa, a tu ritmo',recognizing:'Estoy reconociendo tu seña…',uncertain:'Prueba de nuevo, no encontré una coincidencia clara',
  matched:'Seña reconocida',model:'Estamos preparando las señas',error:'El reconocimiento necesita reiniciarse'};
const cameraError=error=>error.name==='NotAllowedError'?'Permite el acceso a la cámara desde el navegador y vuelve a intentarlo.':
  error.name==='NotFoundError'?'No se encontró una cámara. Conecta una y vuelve a intentarlo.':error.message||'No se pudo iniciar la cámara. Inténtalo de nuevo.';

export function LiveInterpretationSession({active,blocked,client,onBack,onOpen,children}) {
  const [visited,setVisited]=useState(active),[state,setState]=useState('off');
  const controls=useRef(null);
  useEffect(()=>{if(active)setVisited(true);},[active]);
  return <>{children}<div key="interpretation-session" style={{display:active?'contents':'none'}} hidden={!active}>
    {(visited||active)&&<LiveInterpretation client={client} onBack={onBack} active={active} blocked={blocked} controls={controls} onCameraState={setState}/>}
  </div>
    {!active&&state!=='off'&&<aside className="deaf-app li-session-status" aria-label="Cámara del intérprete activa">
      <span><i aria-hidden="true"/>Cámara del intérprete activa<small>El reconocimiento se reanuda al volver.</small></span>
      <div><button onClick={onOpen}>Volver al intérprete</button><button onClick={()=>controls.current?.stop()}>Apagar cámara</button></div>
    </aside>}
  </>;
}

export default function LiveInterpretation({client,onBack,preview=null,active=true,blocked=false,controls,onCameraState}) {
  const video=useRef(null),canvas=useRef(null),camera=useRef(null),voice=useRef(null),sync=useRef(null);
  const candidate=useRef(null),live=useRef({phase:'off'});
  const labels=useRef(new Map());
  const [cameraState,setCameraState]=useState('off'),[result,setResult]=useState({phase:'off'});
  const [library,setLibrary]=useState({loading:true,words:[],catalogue:[],message:'Cargando el modelo preparado…'});
  const [error,setError]=useState(''),[voiceError,setVoiceError]=useState(''),[voiceOn,setVoiceOn]=useState(true);
  const voicePreference=useRef(true);
  const activity=useRef({active,blocked,onCameraState});activity.current={active,blocked,onCameraState};
  const conversation=useLiveConversation({voice,catalogue:library.catalogue,onReset:()=>camera.current?.reset(),initialMode:preview?'phrases':'signs'});
  const history=conversation.history;
  const voiceSupported=typeof window!=='undefined'&&!!window.speechSynthesis&&typeof window.SpeechSynthesisUtterance==='function';
  useEffect(()=>{
    let alive=true;
    const update=result=>{
      if(!alive)return;
      live.current=result;setResult(result);conversation.update(result);
    };
    if(voiceSupported)voice.current=createLiveSignSpeech({speech:Speech,enabled:voicePreference.current,
      labelForClass:id=>labels.current.get(id)||spokenSignLabel(id),
      onError:message=>{if(alive)setVoiceError(message);},onSpeak:()=>{if(alive)setVoiceError('');}});
    camera.current=createLiveInterpretationCamera({video:video.current,canvas:canvas.current,
      getMedia:constraints=>{if(!navigator.mediaDevices?.getUserMedia)throw Error('La cámara requiere HTTPS o localhost y un navegador compatible.');return navigator.mediaDevices.getUserMedia(constraints);},
      createTracker:prepareSignTracker,createInference:createSignInferenceClient,createRecognizer:createLiveSignRecognizer,
      freshLandmarks,trackingVector,draw:drawSignLandmarks,withTimeout:withTrackingTimeout,
      onResult:update,onState:state=>{if(alive){setCameraState(state);activity.current.onCameraState?.(state);}},onError:error=>{if(alive)setError(cameraError(error));}});
    if(controls)controls.current=camera.current;
    // Warm both graphs while the vocabulary loads, without requesting a camera.
    void camera.current.prepare().catch(error=>{if(alive)setError(cameraError(error));});
    function prepared(data){if(!alive)return;
      labels.current=new Map((data.catalogue||[]).map(row=>[row.classId,row.displayLabel]));
      if(candidate.current?.id!==data.model?.id)conversation.reset();candidate.current=data.model;camera.current?.setModel(data.model);
      setLibrary({loading:!!data.loading,words:data.model?.enabledClasses||data.model?.classes||[],catalogue:data.catalogue||[],message:data.preparing?'Preparando la actualización aprobada de la biblioteca…':'',error:data.error,bytes:data.bytes});
    }
    let previewTimer;
    if(preview){
      prepared({model:preview.model,catalogue:preview.catalogue,loading:false});
      const check=async()=>{if(!alive||document.hidden)return;try{
        const response=await client.rpc('deafapp_recognition_revision',{});
        if(response.error||response.data?.revision!==preview.revision||!response.data.ready)throw Error('La biblioteca cambió. Vuelve al vocabulario y abre una prueba actualizada.');
      }catch(e){if(alive){camera.current?.stop();prepared({model:null,catalogue:preview.catalogue,loading:false,error:e.message});}}};
      void check();previewTimer=setInterval(()=>void check(),2000);
    }
    else sync.current=startPreparedRecognition({client,onUpdate:prepared});
    const hidden=()=>{
      camera.current?.setSuspended(!activity.current.active||document.hidden);
      voice.current?.setEnabled(voicePreference.current&&activity.current.active&&!document.hidden);
    };
    camera.current.setBlocked(activity.current.blocked);hidden();
    const leave=()=>camera.current?.stop();
    document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',leave);
    return()=>{alive=false;clearInterval(previewTimer);sync.current?.close();camera.current?.close();voice.current?.close();if(controls)controls.current=null;camera.current=null;voice.current=null;
      document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',leave);};
  },[client,voiceSupported,preview]);
  useEffect(()=>{
    camera.current?.setBlocked(blocked);
    camera.current?.setSuspended(!active||document.hidden);
    voice.current?.setEnabled(voicePreference.current&&active&&!document.hidden);
  },[active,blocked]);
  function toggleVoice(){
    const next=!voicePreference.current;voicePreference.current=next;setVoiceOn(next);setVoiceError('');voice.current?.setEnabled(next);
    if(next&&conversation.mode==='signs')voice.current?.update(live.current);
  }
  function testVoice(){voicePreference.current=true;setVoiceOn(true);setVoiceError('');voice.current?.setEnabled(true);voice.current?.preview();}
  const matched=result.phase==='matched'&&result.prediction?.accepted===true;
  const word=matched?(labels.current.get(result.prediction.classId)||spokenSignLabel(result.prediction.classId)):'';
  const running=cameraState!=='off';
  const lastPhrase=[...history].reverse().find(row=>row.kind==='phrase');
  const currentText=conversation.mode==='phrases'?(conversation.draft.text||lastPhrase?.label||''):(matched?word:'');
  return <div className="deaf-app live-interpretation">
    <header className="li-nav"><a href="/" onClick={event=>{if(event.button||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();onBack();}} aria-label="DeafApp, volver al inicio">
      <img src="/brand/deafapp-mark.svg" alt="" width="34" height="34"/><span>Deaf<span>App</span></span></a>
      <button className="li-back" onClick={onBack}>{preview?'← Volver al vocabulario':'← Volver al inicio'}</button></header>
    <main className="li-main">
      <div className="li-heading"><span className="li-eyebrow">{preview?'EVALUACIÓN PRIVADA · CÁMARA + FRASES':'LSCh · TEXTO + VOZ'}</span><h1>{preview?"Prueba privada de interpretación":"Interpretar en vivo"}</h1>
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
          <div className="li-camera-actions"><button className="li-primary" onClick={()=>{setError('');if(running)camera.current?.stop();else void camera.current?.start();}}>{running?'Detener cámara':'Activar cámara'}</button>
            <span>La cámara se usa en este dispositivo.<br/>Esta sesión no se graba ni se envía.<br/>Permanece activa al navegar por esta web; puedes apagarla cuando quieras.</span></div>
          {error&&<p className="li-error" role="alert">{error}</p>}
        </section>
        <section className="li-conversation" aria-labelledby="li-result-title">
          <div className="li-result-heading"><span className="li-eyebrow">DE TUS MANOS A LAS PALABRAS</span><span className="li-text-badge">Texto en vivo</span></div>
          <div className="li-current" role="status" aria-live="polite" aria-atomic="true"><h2 id="li-result-title">{conversation.mode==='phrases'?(conversation.draft.text?'Frase en construcción':currentText?'Última frase':'Aquí se forma tu frase'):(matched?'Esto es lo que reconocí':'Aquí aparece tu seña')}</h2>
            <p className={currentText?'li-word':'li-placeholder'}>{currentText||'Te escuchamos con la mirada.'}</p>
            <p className="li-result-hint">{currentText?'Comprueba que coincide con lo que quieres decir.':running?PHASES[result.phase]||'Preparando…':'Activa la cámara y exprésate a tu ritmo.'}</p></div>
          <div className="li-voice"><div><strong>Voz en español</strong><span>{voiceSupported?(voiceOn?(conversation.mode==='phrases'?'Leer al terminar la frase':'Leer cada seña reconocida'):'Voz silenciada'):'Tu navegador no admite voz; puedes usar el texto.'}</span></div>
            <button aria-pressed={voiceOn} disabled={!voiceSupported} onClick={toggleVoice}>{voiceOn?'Silenciar voz':'Activar voz'}</button></div>
          <button className="li-test-voice" disabled={!voiceSupported} onClick={testVoice}>♫ Probar voz</button>
          {voiceError&&<p className="li-error" role="status">{voiceError}</p>}
          {preview&&<ConversationControls conversation={conversation} prefix="private-conversation"/>}
          <div className="li-history"><div><h3>En esta conversación</h3><button disabled={!history.length&&!conversation.draft.canFinish} onClick={conversation.clearHistory}>Limpiar</button></div>
            {history.length?<ol aria-label={preview?'Últimas frases y señas reconocidas':'Últimas señas y oraciones reconocidas'}>{history.map(row=><li key={row.id} data-review={row.requiresReview||undefined}>{row.label}{row.requiresReview&&<small> · Revisar</small>}</li>)}</ol>:<p>{preview?'Las últimas frases y señas reconocidas aparecerán aquí.':'Las últimas señas y oraciones reconocidas aparecerán aquí.'}</p>}</div>
          <p className="li-library-note">Reconoce las señas habilitadas de la biblioteca. La cobertura aumenta con aportes revisados y pruebas.</p>
        </section>
      </div>
      <section className="li-bottom" aria-label="Ayuda y señas disponibles"><div className="li-tips"><span>01 <b>Busca buena luz</b></span><span>02 <b>Muestra cara y manos</b></span><span>03 <b>Haz la seña completa</b></span></div>
        <details className="li-vocabulary"><summary>{library.loading?'Preparando biblioteca…':`${library.words.length} palabras y oraciones habilitadas`}<span>Ver señas</span></summary>
          {library.loading?<p role="status">{library.message}</p>:<div className="li-chips">{library.words.map(id=><span key={id}>{labels.current.get(id)||spokenSignLabel(id)}</span>)}</div>}
          {!library.loading&&!library.words.length&&!library.error&&<p>Se necesitan al menos tres tomas aprobadas distintas por seña y datos de seguimiento aptos para preparar la interpretación.</p>}
        </details>
        {library.loading&&<p className="li-sync-status" role="status">{library.message}</p>}
        {library.error&&<div className="li-error" role="alert">{library.error} <button onClick={()=>sync.current?.request()}>Reintentar</button></div>}
        {!library.loading&&!library.words.length&&!library.error&&<p className="li-sync-status">Aún no hay suficientes tomas aptas para interpretar. Puedes seguir aportando señas desde «Grabar».</p>}
      </section>
    </main>
  </div>;
}
