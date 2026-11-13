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
import {spanishVoices,voiceForGender} from '../training/spanishVoices';
import {startPreparedRecognition} from '../training/preparedRecognition';
import {useLiveConversation} from '../training/useLiveConversation';
import ConversationControls from '../training/ConversationControls.web';
import VocabularyQuality from '../training/VocabularyQuality.web';
import {createLiveRecognitionStability,readRecognitionStability,saveRecognitionStability} from '../training/liveRecognitionStability';
import '../ui/theme.css';
import './LiveInterpretation.css';
import {CommunicationHeader} from './CommunicationNav.web';
import ConversationPanel from './ConversationPanel.web';
import BrandHome from '../ui/BrandHome';

const PHASES={off:'Tu espacio para conversar',loading:'Preparando la cámara…',position:'Coloca tu cara y tus manos en el encuadre',
  ready:'Haz otra seña u oración completa, a tu ritmo.',
  tracking:'Haz la seña completa, a tu ritmo',recognizing:'Estoy reconociendo tu seña…',uncertain:'Prueba de nuevo, no encontré una coincidencia clara',
  matched:'Seña reconocida',model:'Estamos preparando las señas',error:'El reconocimiento necesita reiniciarse'};
const cameraError=error=>error.name==='NotAllowedError'?'Permite el acceso a la cámara desde el navegador y vuelve a intentarlo.':
  error.name==='NotFoundError'?'No se encontró una cámara. Conecta una y vuelve a intentarlo.':error.message||'No se pudo iniciar la cámara. Inténtalo de nuevo.';

export function LiveInterpretationSession({active,blocked,client,onBack,onOpen,children,conversationMode=false,navigate}) {
  const [visited,setVisited]=useState(active),[state,setState]=useState('off');
  const controls=useRef(null);
  useEffect(()=>{if(active)setVisited(true);},[active]);
  return <>{children}<div key="interpretation-session" style={{display:active?'contents':'none'}} hidden={!active}>
    {(visited||active)&&<LiveInterpretation client={client} onBack={onBack} active={active} blocked={blocked} controls={controls} onCameraState={setState} conversationMode={conversationMode} navigate={navigate}/>}
  </div>
    {!active&&state!=='off'&&<aside className="deaf-app li-session-status" aria-label="Cámara del intérprete activa">
      <span><i aria-hidden="true"/>Cámara del intérprete activa<small>El reconocimiento se reanuda al volver.</small></span>
      <div><button onClick={onOpen}>Volver al intérprete</button><button onClick={()=>controls.current?.stop()}>Apagar cámara</button></div>
    </aside>}
  </>;
}

export default function LiveInterpretation({client,onBack,preview=null,active=true,blocked=false,controls,onCameraState,conversationMode=false,navigate}) {
  const video=useRef(null),canvas=useRef(null),camera=useRef(null),voice=useRef(null),sync=useRef(null);
  const candidate=useRef(null),live=useRef({phase:'off'});
  const labels=useRef(new Map());
  const stabilityTracker=useRef(null),[stability,setStability]=useState([]);
  const [cameraState,setCameraState]=useState('off'),[result,setResult]=useState({phase:'off'});
  const [showCameraIntro,setShowCameraIntro]=useState(false);
  const [trackingState,setTrackingState]=useState('loading');
  const [library,setLibrary]=useState({loading:true,words:[],catalogue:[],quality:[],message:'Cargando el modelo preparado…'});
  const [error,setError]=useState(''),[voiceError,setVoiceError]=useState(''),[voiceOn,setVoiceOn]=useState(true);
  const [voices,setVoices]=useState([]),[selectedVoice,setSelectedVoice]=useState(''),[voicesLoaded,setVoicesLoaded]=useState(false);
  const voicePreference=useRef(true);
  const [dictating,setDictating]=useState(false);
  const activity=useRef({active,blocked,onCameraState,dictating});activity.current={active,blocked,onCameraState,dictating};
  const conversation=useLiveConversation({voice,catalogue:library.catalogue,onReset:()=>camera.current?.reset(),initialMode:preview?'phrases':'signs'});
  const history=conversation.history;
  const voiceSupported=typeof window!=='undefined'&&!!window.speechSynthesis&&typeof window.SpeechSynthesisUtterance==='function';
  useEffect(()=>{
    let alive=true;
    const update=result=>{
      if(!alive)return;
      live.current=result;stabilityTracker.current?.update(result);setResult(result);conversation.update(result);
      if(['tracking','recognizing','matched','uncertain','ready'].includes(result.phase))setShowCameraIntro(false);
    };
    if(voiceSupported)voice.current=createLiveSignSpeech({speech:Speech,enabled:voicePreference.current,voice:selectedVoice||undefined,
      labelForClass:id=>labels.current.get(id)||spokenSignLabel(id),
      onError:message=>{if(alive)setVoiceError(message);},onSpeak:()=>{if(alive)setVoiceError('');}});
    camera.current=createLiveInterpretationCamera({video:video.current,canvas:canvas.current,
      getMedia:constraints=>{if(!navigator.mediaDevices?.getUserMedia)throw Error('La cámara requiere HTTPS o localhost y un navegador compatible.');return navigator.mediaDevices.getUserMedia(constraints);},
      createTracker:prepareSignTracker,createInference:createSignInferenceClient,createRecognizer:createLiveSignRecognizer,
      freshLandmarks,trackingVector,draw:drawSignLandmarks,withTimeout:withTrackingTimeout,
      onResult:update,onState:state=>{if(alive){setCameraState(state);activity.current.onCameraState?.(state);}},
      onPreparation:state=>{if(alive)setTrackingState(state);},onError:error=>{if(alive)setError(cameraError(error));}});
    if(controls)controls.current=camera.current;
    // Warm both graphs while the vocabulary loads, without requesting a camera.
    void camera.current.prepare().catch(error=>{if(alive)setError(cameraError(error));});
    function prepared(data){if(!alive)return;
      labels.current=new Map((data.catalogue||[]).map(row=>[row.classId,row.displayLabel]));
      if(!data.model){stabilityTracker.current=null;setStability([]);}
      else if(stabilityTracker.current?.modelId!==data.model.id){
        stabilityTracker.current=createLiveRecognitionStability({modelId:data.model.id,classes:data.model.enabledClasses||data.model.classes||[],initial:preview?null:readRecognitionStability(),onChange:value=>{if(alive){setStability(value.rows);if(!preview)saveRecognitionStability(value);}}});
        setStability(stabilityTracker.current.snapshot().rows);
      }
      if(candidate.current?.id!==data.model?.id)conversation.reset();candidate.current=data.model;camera.current?.setModel(data.model);
      setLibrary({loading:!!data.loading,words:data.model?.enabledClasses||data.model?.classes||[],catalogue:data.catalogue||[],quality:data.quality||[],message:data.preparing?'Preparando la actualización aprobada de la biblioteca…':data.loading?'Cargando el modelo preparado…':'',error:data.error,bytes:data.bytes});
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
      voice.current?.setEnabled(voicePreference.current&&activity.current.active&&!activity.current.dictating&&!document.hidden);
    };
    camera.current.setBlocked(activity.current.blocked);hidden();
    const leave=()=>camera.current?.stop();
    document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',leave);
    return()=>{alive=false;stabilityTracker.current=null;clearInterval(previewTimer);sync.current?.close();camera.current?.close();voice.current?.close();if(controls)controls.current=null;camera.current=null;voice.current=null;
      document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',leave);};
  },[client,voiceSupported,preview]);
  useEffect(()=>{
    camera.current?.setBlocked(blocked);
    camera.current?.setSuspended(!active||document.hidden);
    voice.current?.setEnabled(voicePreference.current&&active&&!dictating&&!document.hidden);
  },[active,blocked,dictating]);
  useEffect(()=>{
    setShowCameraIntro(cameraState==='on');
    if(cameraState!=='on')return;
    const timer=setTimeout(()=>setShowCameraIntro(false),3000);
    return()=>clearTimeout(timer);
  },[cameraState]);
  useEffect(()=>{voice.current?.setVoice(selectedVoice||undefined);},[selectedVoice]);
  useEffect(()=>{
    if(!voiceSupported)return;
    let alive=true,revision=0;
    async function loadVoices(){
      const request=++revision;
      try{
        const available=spanishVoices(await Speech.getAvailableVoicesAsync());
        if(!alive||request!==revision)return;
        setVoices(available);setVoicesLoaded(true);
        setSelectedVoice(current=>available.some(row=>row.identifier===current)?current:'');
      }catch{if(alive&&request===revision){setVoices([]);setVoicesLoaded(true);}}
    }
    void loadVoices();window.speechSynthesis.addEventListener?.('voiceschanged',loadVoices);
    return()=>{alive=false;window.speechSynthesis.removeEventListener?.('voiceschanged',loadVoices);};
  },[voiceSupported]);
  function toggleVoice(){
    const next=!voicePreference.current;voicePreference.current=next;setVoiceOn(next);setVoiceError('');voice.current?.setEnabled(next&&active&&!dictating&&!document.hidden);
    if(next&&conversation.mode==='signs')voice.current?.update(live.current);
  }
  function testVoice(){voicePreference.current=true;setVoiceOn(true);setVoiceError('');voice.current?.setEnabled(true);voice.current?.preview();}
  const matched=result.phase==='matched'&&result.prediction?.accepted===true;
  const word=matched?(labels.current.get(result.prediction.classId)||spokenSignLabel(result.prediction.classId)):'';
  const running=cameraState!=='off';
  const preparing=!error&&(trackingState==='loading'||library.loading||cameraState==='starting');
  const statusText=preparing?(trackingState==='loading'?'Preparando el seguimiento de cara y manos…':library.loading?library.message:'Preparando la cámara…'):
    PHASES[result.phase]||'Preparando la interpretación…';
  const lastPhrase=[...history].reverse().find(row=>row.kind==='phrase');
  const currentText=conversation.mode==='phrases'?(conversation.draft.text||lastPhrase?.label||''):(matched?word:'');
  const femaleVoice=voiceForGender(voices,'female'),maleVoice=voiceForGender(voices,'male');
  return <div className={`deaf-app live-interpretation${conversationMode?' li-conversation-mode':''}`}>
    {!preview&&navigate?<CommunicationHeader navigate={navigate} current={conversationMode?'conversar':'interpretar'}/>:<header className="li-nav"><BrandHome size={40}/>
      <button className="li-back" onClick={onBack}>{preview?'← Volver al vocabulario':'← Volver al inicio'}</button></header>}
    <main className="li-main">
      <div className="li-heading"><span className="li-eyebrow">{preview?'EVALUACIÓN PRIVADA · CÁMARA + FRASES':conversationMode?'DOS PERSONAS · UNA CONVERSACIÓN':'LSCh · TEXTO + VOZ'}</span><h1>{preview?'Prueba privada de interpretación':conversationMode?<>Cada persona,<br/><em>su forma de expresarse.</em></>:'Interpretar en vivo'}</h1>
        <p>{conversationMode?'Señas a texto y voz. Respuestas escritas o dictadas, en una misma pantalla.':'Haz una seña frente a la cámara. Nosotros ponemos las palabras.'}</p></div>
      <div className="li-workspace">
        <section className="li-camera-section" aria-label="Cámara de interpretación">
          {conversationMode&&<div className="communication-panel-title"><span className="communication-step">01</span><div><h2>Exprésate con tus manos</h2><p>Usa las señas del vocabulario habilitado.</p></div></div>}
          <div className="li-camera-frame">
          <div className={`li-camera${matched?' li-matched':''}`}>
            <video ref={video} muted playsInline autoPlay aria-label="Tu cámara en vivo"/>
            <canvas ref={canvas} aria-hidden="true"/>
            {!running&&<div className="li-welcome-camera"><div className="li-hand" aria-hidden="true"><HandConstellation poses={['open','relaxed','soft']}/></div><h2>Cuando quieras, empezamos.</h2><p>Busca buena luz y deja espacio para tus manos.</p></div>}
            <span className={`li-camera-badge${cameraState==='on'?' li-is-on':''}`}><i aria-hidden="true"/>{cameraState==='on'?'En vivo':cameraState==='starting'?'Conectando':'Cámara apagada'}</span>
            {running&&(currentText||showCameraIntro)&&<div className="li-result li-camera-result" role="status" aria-live="polite" aria-atomic="true">
              <div className="li-current"><h2 id="li-result-title">{conversation.mode==='phrases'?(conversation.draft.text?'Frase en construcción':currentText?'Última frase':'Aquí se forma tu frase'):(matched?'Esto es lo que reconocí':'Aquí aparece tu seña')}</h2>
                <p className={currentText?'li-word':'li-placeholder'}>{currentText||'Te escuchamos con la mirada.'}</p>
              </div>
            </div>}
          </div>
          </div>
          {(running||preparing)&&<div className="li-camera-status" role="status" aria-live="polite" aria-atomic="true"><span>{statusText}</span>
            {preparing&&<div className="li-loading-bar" role="progressbar" aria-label={statusText}><i/></div>}</div>}
          <div className="li-camera-actions"><button className="li-primary" onClick={()=>{setError('');if(running)camera.current?.stop();else void camera.current?.start();}}>{running?'Detener cámara':'Activar cámara'}</button>
            <span>La cámara se usa en este dispositivo.<br/>{conversationMode?'Las imágenes no se graban ni se envían.':'Esta sesión no se graba ni se envía.'}<br/>Permanece activa al navegar por esta web; puedes apagarla cuando quieras.</span></div>
          {error&&<p className="li-error" role="alert">{error}</p>}
          {conversationMode&&<div className="conversation-camera-tools"><div className="li-voice"><div><strong>Leer señas con voz</strong><span>{dictating?'Voz en pausa mientras dictas':voiceOn?'Lectura activada':'Lectura silenciada'}</span></div><button disabled={!voiceSupported||dictating} aria-pressed={voiceOn} onClick={toggleVoice}>{voiceOn?'Silenciar voz':'Activar voz'}</button></div>
            {voiceError&&<p className="li-error" role="status">{voiceError}</p>}
            <details><summary>{library.loading?'Preparando vocabulario…':`Ver vocabulario habilitado (${library.words.length})`}</summary><div className="li-vocabulary">{library.loading?<p role="status">{library.message}</p>:<VocabularyQuality words={library.words} quality={library.quality} stability={stability} labels={id=>labels.current.get(id)||spokenSignLabel(id)}/>}
              {library.error&&<p className="li-error" role="alert">{library.error} <button onClick={()=>sync.current?.request()}>Reintentar</button></p>}
              {!library.loading&&!library.words.length&&!library.error&&<p>Aún no hay señas habilitadas. Puedes conversar por escrito.</p>}</div></details></div>}
        </section>
        <div hidden={!conversationMode} style={{display:conversationMode?'contents':'none'}}><ConversationPanel signedHistory={history} active={active&&conversationMode} onListeningChange={value=>{voice.current?.setEnabled(voicePreference.current&&active&&!value&&!document.hidden);setDictating(value);}} onClearSigns={conversation.clearHistory}/></div>
        <section hidden={conversationMode} style={{display:conversationMode?'none':undefined}} className="li-conversation" aria-label="Voz, vocabulario e historial de interpretación">
          <div className="li-tools">
          <div className="li-result-heading"><span className="li-eyebrow">DE TUS MANOS A LAS PALABRAS</span><span className="li-text-badge">Texto en vivo</span></div>
          <div className="li-voice"><div><strong>Voz en español</strong><span>{voiceSupported?(voiceOn?(conversation.mode==='phrases'?'Leer al terminar la frase':'Leer cada seña reconocida'):'Voz silenciada'):'Tu navegador no admite voz; puedes usar el texto.'}</span></div>
            <button aria-pressed={voiceOn} disabled={!voiceSupported} onClick={toggleVoice}>{voiceOn?'Silenciar voz':'Activar voz'}</button></div>
          <div className="li-voice-options"><label>Elegir voz<select aria-label="Elegir voz" value={selectedVoice} disabled={!voiceSupported} onChange={event=>{setSelectedVoice(event.target.value);setVoiceError('');}}>
            <option value="">Automática del dispositivo</option>
            <option value={femaleVoice||'unavailable-female'} disabled={!femaleVoice}>Mujer{!femaleVoice?' · no disponible':''}</option>
            <option value={maleVoice||'unavailable-male'} disabled={!maleVoice}>Hombre{!maleVoice?' · no disponible':''}</option>
            {!!voices.length&&<optgroup label="Voces en español">{voices.filter(row=>row.identifier!==femaleVoice&&row.identifier!==maleVoice).map(row=><option key={row.identifier} value={row.identifier}>{row.name} · {row.language}</option>)}</optgroup>}
          </select></label><button className="li-test-voice" disabled={!voiceSupported} onClick={testVoice}>♫ Probar voz</button></div>
          {voiceSupported&&voicesLoaded&&(!femaleVoice||!maleVoice)&&<p className="li-voice-note">Las opciones dependen de las voces en español instaladas en tu dispositivo.{!!voices.length&&' También puedes elegir una voz por su nombre.'}</p>}
          {voiceError&&<p className="li-error" role="status">{voiceError}</p>}
          <section className="li-vocabulary" aria-labelledby="li-vocabulary-title"><h3 id="li-vocabulary-title">{library.loading?'Preparando biblioteca…':`${library.words.length} palabras y oraciones habilitadas`}</h3>
            {library.loading?<p role="status">{library.message}</p>:!!library.words.length&&<VocabularyQuality words={library.words} quality={library.quality} stability={stability} labels={id=>labels.current.get(id)||spokenSignLabel(id)}/>}
            {library.error&&<div className="li-error" role="alert">{library.error} <button onClick={()=>sync.current?.request()}>Reintentar</button></div>}
            {!library.loading&&!library.words.length&&!library.error&&<p>Aún no hay suficientes tomas aptas para interpretar. Puedes seguir aportando señas desde «Grabar».</p>}
          </section>
          </div>
          {preview&&<ConversationControls conversation={conversation} prefix="private-conversation"/>}
          <div className="li-history"><div><h3>En esta conversación</h3><button disabled={!history.length&&!conversation.draft.canFinish} onClick={conversation.clearHistory}>Limpiar</button></div>
            {history.length?<ol aria-label={preview?'Últimas frases y señas reconocidas':'Últimas señas y oraciones reconocidas'}>{history.map(row=><li key={row.id} data-review={row.requiresReview||undefined}>{row.label}{row.requiresReview&&<small> · Revisar</small>}</li>)}</ol>:<p>{preview?'Las últimas frases y señas reconocidas aparecerán aquí.':'Las últimas señas y oraciones reconocidas aparecerán aquí.'}</p>}</div>
          <p className="li-library-note">Reconoce las señas habilitadas de la biblioteca. La cobertura aumenta con aportes revisados y pruebas.</p>
        </section>
      </div>
      <section className="li-bottom" aria-label="Ayuda y señas disponibles"><div className="li-tips"><span>01 <b>Busca buena luz</b></span><span>02 <b>Muestra cara y manos</b></span><span>03 <b>Haz la seña completa</b></span></div>
      </section>
    </main>
  </div>;
}
