import {useEffect, useRef, useState} from 'react';
import {CommunicationIcon} from './CommunicationNav.web';
import {appendConversation, cleanMessage, MAX_MESSAGE_LENGTH} from './communicationData';
import {createDictation, dictationConstructor} from './dictation';

export default function ConversationPanel({signedHistory, active, onListeningChange, onClearSigns}) {
  const [messages, setMessages] = useState([]), [draft, setDraft] = useState('');
  const [mic, setMic] = useState('off'), [error, setError] = useState('');
  const dictation = useRef(null), base = useRef(''), source = useRef('text');
  const transcript = useRef(null);
  const seen = useRef(new Set(signedHistory.map(row => row.id)));
  const latest = useRef({onListeningChange}); latest.current = {onListeningChange};
  const supported = !!dictationConstructor(typeof window === 'undefined' ? null : window);
  const listening = mic !== 'off';
  useEffect(() => {
    if (active && transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight;
  }, [messages, active]);
  useEffect(() => {
    const fresh = signedHistory.filter(row => !seen.current.has(row.id));
    signedHistory.forEach(row => seen.current.add(row.id));
    if (active && fresh.length) setMessages(rows => appendConversation(rows, fresh.map(row => ({id:`sign-${row.id}`, text:row.label, source:'sign'}))));
  }, [signedHistory, active]);
  useEffect(() => {
    dictation.current = createDictation({Recognition:dictationConstructor(window),
      onState:state => { setMic(state); latest.current.onListeningChange(state !== 'off'); },
      onText:text => setDraft(cleanMessage([base.current, text].filter(Boolean).join(' '))), onError:setError});
    const leave = () => { dictation.current?.cancel(); };
    const hidden = () => { if (document.hidden) leave(); };
    document.addEventListener('visibilitychange', hidden); window.addEventListener('pagehide', leave);
    return () => {
      dictation.current?.close(); dictation.current = null; latest.current.onListeningChange(false);
      document.removeEventListener('visibilitychange', hidden); window.removeEventListener('pagehide', leave);
    };
  }, []);
  useEffect(() => { if (!active) dictation.current?.cancel(); }, [active]);
  function toggleMic() {
    if (listening) dictation.current?.stop();
    else { base.current = draft.trim(); source.current = 'voice'; dictation.current?.start(); }
  }
  function send(event) {
    event.preventDefault(); const text = cleanMessage(draft);
    if (!text || listening) return;
    setMessages(rows => appendConversation(rows, [{id:`reply-${globalThis.crypto.randomUUID()}`, text, source:source.current}]));
    setDraft(''); base.current = ''; source.current = 'text';
  }
  function clear() {
    dictation.current?.cancel(); seen.current = new Set(signedHistory.map(row => row.id));
    setMessages([]); setDraft(''); setError(''); base.current = ''; source.current = 'text'; onClearSigns();
  }
  return <section className="conversation-panel" aria-label="Conversación entre dos personas">
    <div className="communication-panel-title"><span className="communication-step">02</span><div><h2>Tu turno de responder</h2><p>Escribe o dicta. La otra persona podrá leerte.</p></div></div>
    <form className="conversation-compose" onSubmit={send}>
      <label htmlFor="conversation-reply">Tu respuesta</label>
      <textarea id="conversation-reply" value={draft} maxLength={MAX_MESSAGE_LENGTH} disabled={listening} placeholder="Hola, ¿en qué te puedo ayudar?" onChange={event => {setDraft(event.target.value); source.current = 'text';}}/>
      <div className="communication-counter"><span role="status">{mic === 'starting' ? 'Conectando micrófono…' : mic === 'listening' ? 'Micrófono activo · te estamos escuchando' : mic === 'stopping' ? 'Terminando el dictado…' : 'Puedes revisar el texto antes de enviarlo.'}</span><span>{draft.length}/{MAX_MESSAGE_LENGTH}</span></div>
      <div className="communication-actions"><button className={`communication-button communication-secondary${listening ? ' is-listening' : ''}`} type="button" disabled={!supported || mic === 'stopping' || !active} aria-pressed={listening} onClick={toggleMic}><CommunicationIcon name="mic"/>{listening ? 'Terminar dictado' : 'Dictar respuesta'}</button>
        <button className="communication-button" disabled={!draft.trim() || listening || !active}>Mostrar respuesta<CommunicationIcon name="arrow"/></button></div>
      {listening && <button type="button" className="communication-text-button" onClick={() => dictation.current?.cancel()}>Cancelar dictado</button>}
      {!supported ? <p className="communication-note">Este navegador no admite dictado. Puedes responder por escrito.</p> : <p className="communication-note">El dictado convierte voz en texto. Según tu navegador, el audio puede procesarse en su servicio de reconocimiento. Solo escucha cuando lo activas.</p>}
      {error && <p className="communication-error" role="alert">{error}</p>}
    </form>
    <div className="conversation-history-heading"><h3>La conversación</h3><button className="communication-text-button" disabled={!messages.length && !draft} onClick={clear}>Limpiar conversación</button></div>
    <div ref={transcript} className="conversation-transcript" role="log" aria-label="Mensajes de esta conversación" aria-relevant="additions" tabIndex={0}>
      {messages.length ? <ol>{messages.map(message => <li key={message.id} data-source={message.source}><span>{message.source === 'sign' ? 'Seña reconocida' : message.source === 'voice' ? 'Respuesta dictada' : 'Respuesta escrita'}</span><p>{message.text}</p></li>)}</ol> : <div className="conversation-empty"><CommunicationIcon name="message" size={34}/><p>Una conversación empieza<br/>con un primer mensaje.</p><small>Las señas reconocidas y las respuestas aparecerán aquí.</small></div>}
    </div>
    <p className="communication-note">El historial permanece en esta sesión. Puedes limpiarlo cuando quieras.</p>
  </section>;
}
