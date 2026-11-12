import {useEffect, useRef, useState} from 'react';
import * as Speech from 'expo-speech';

export default function useReadAloud(active = true) {
  const supported = typeof window !== 'undefined' && !!window.speechSynthesis && typeof window.SpeechSynthesisUtterance === 'function';
  const owned = useRef(false), mounted = useRef(true), epoch = useRef(0);
  const [speaking, setSpeaking] = useState(false), [error, setError] = useState('');
  function stop() {
    epoch.current++;
    if (owned.current) { owned.current = false; void Speech.stop().catch(() => {}); }
    if (mounted.current) setSpeaking(false);
  }
  useEffect(() => {
    mounted.current = true;
    const hidden = () => { if (document.hidden) stop(); };
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', stop);
    return () => { mounted.current = false; stop(); document.removeEventListener('visibilitychange', hidden); window.removeEventListener('pagehide', stop); };
  }, []);
  useEffect(() => { if (!active) stop(); }, [active]);
  function speak(text) {
    if (!active || !supported || !text?.trim()) return;
    stop(); const request = epoch.current; owned.current = true; setError(''); setSpeaking(true);
    const done = () => { if (request !== epoch.current) return; owned.current = false; if (mounted.current) setSpeaking(false); };
    try {
      Speech.speak(text.trim(), {language:'es-CL', rate:1, onDone:done, onStopped:done,
        onError:() => { if (request !== epoch.current) return; done(); if (mounted.current) setError('No se pudo reproducir la voz. El mensaje sigue disponible en texto.'); }});
    } catch { done(); setError('La voz no está disponible. El mensaje sigue disponible en texto.'); }
  }
  return {supported, speaking, error, speak, stop};
}
