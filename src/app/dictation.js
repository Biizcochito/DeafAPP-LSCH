const errors = {
  'not-allowed':'No se autorizó el micrófono. Puedes escribir o revisar el permiso en tu navegador.',
  'service-not-allowed':'El navegador no permite el dictado. Puedes responder por escrito.',
  'audio-capture':'No se encontró un micrófono disponible. Puedes escribir tu respuesta.',
  'no-speech':'No se detectó voz. Puedes volver a dictar o escribir.',
  network:'No se pudo conectar con el servicio de dictado. Revisa tu conexión o escribe.',
  'language-not-supported':'El dictado en español no está disponible en este navegador.',
};
export const dictationConstructor = scope => scope?.SpeechRecognition || scope?.webkitSpeechRecognition;

// One explicit listening session. No auto-restarts, recordings or app uploads.
export function createDictation({Recognition, onState, onText, onError}) {
  let current = null, closed = false, state = 'off';
  function publish(next) { state = next; onState(next); }
  function detach(recognition) {
    recognition.onstart = recognition.onresult = recognition.onerror = recognition.onend = null;
  }
  return {
    start() {
      if (closed || current) return;
      if (!Recognition) { onError('Este navegador no admite dictado. Puedes responder por escrito.'); return; }
      let recognition, finalText = '';
      try {
        recognition = new Recognition(); current = recognition;
        recognition.lang = 'es-CL'; recognition.continuous = false; recognition.interimResults = true;
        recognition.onstart = () => { if (current === recognition && state !== 'stopping') publish('listening'); };
        recognition.onresult = event => {
          if (closed || current !== recognition) return;
          let interim = ''; finalText = '';
          for (let i = 0; i < event.results.length; i++) {
            const text = event.results[i][0]?.transcript || '';
            if (event.results[i].isFinal) finalText += text + ' ';
            else interim += text + ' ';
          }
          onText((finalText + interim).trim());
        };
        recognition.onerror = event => {
          if (closed || current !== recognition) return;
          if (event.error !== 'aborted') onError(errors[event.error] || 'No se pudo completar el dictado. Puedes escribir tu respuesta.');
          // A failed provider is not guaranteed to deliver onend.
          current = null; detach(recognition); try { recognition.abort(); } catch {}
          onText(finalText.trim()); publish('off');
        };
        recognition.onend = () => {
          if (closed || current !== recognition) return;
          current = null; detach(recognition); onText(finalText.trim()); publish('off');
        };
        onError(''); publish('starting'); recognition.start();
      } catch {
        current = null; if (recognition) detach(recognition);
        publish('off'); onError('No se pudo iniciar el dictado. Puedes escribir o volver a intentarlo.');
      }
    },
    stop() {
      if (!current || state === 'stopping') return;
      try { publish('stopping'); current.stop(); }
      catch { this.cancel(); onError('El dictado se interrumpió. Revisa el texto antes de enviarlo.'); }
    },
    cancel() {
      const recognition = current; current = null;
      if (recognition) { detach(recognition); try { recognition.abort(); } catch {} }
      if (!closed) publish('off');
    },
    close() { this.cancel(); closed = true; },
  };
}
