import {useEffect,useState} from 'react';
import {recordingPreview} from './adminClient';
import {recordingTimeline,frameAtTime} from '../training/recordingVariants';
import {downloadRecording} from '../storage/recordingStorage.js';

export async function loadVariantRecording(client,row,session){
  if(typeof row.path!=='string'||row.path.startsWith('/')||row.path.includes('..')||!row.path.endsWith('.json'))throw Error('La ruta del original requiere revisión.');
  const {data,error}=await downloadRecording(client,row,session);
  if(error||!data||data.size>25_000_000)throw Error('No se pudo abrir el original. Vuelve a intentarlo.');
  const payload=JSON.parse(await data.text());
  if(payload.label!==row.label||payload.categoria!=null&&payload.categoria!==row.category)throw Error('El archivo no coincide con la seña.');
  return {...recordingPreview(payload),...recordingTimeline(payload)};
}

export default function VariantPlayer({clip,angle=0}){
  const [frame,setFrame]=useState(0),[playing,setPlaying]=useState(true);
  useEffect(()=>{setFrame(0);setPlaying(true);},[clip]);
  useEffect(()=>{
    if(!clip||!playing)return;
    const start=performance.now()-(clip.times[frame]||0);
    const timer=setInterval(()=>setFrame(frameAtTime(clip.times,(performance.now()-start)%clip.durationMs)),20);
    return()=>clearInterval(timer);
  },[clip,playing]);
  if(!clip)return <p role="status">Abriendo original…</p>;
  return <div className="mv-player"><div className="mv-stage" style={{aspectRatio:clip.aspectRatio}}><img src={clip.frames[frame]} alt="Vista previa de la seña" style={{transform:`rotate(${angle}deg)`}}/></div>
    <div className="mv-actions"><button type="button" onClick={()=>setPlaying(!playing)}>{playing?'Pausar':'Reproducir'}</button><small>{(clip.durationMs/1000).toFixed(2)} s · fotograma {frame+1} / {clip.frames.length}</small></div>
    <input aria-label="Fotograma de la vista previa" type="range" min="0" max={clip.frames.length-1} value={frame} onChange={e=>{setPlaying(false);setFrame(Number(e.target.value));}}/>
    <small>Misma secuencia y duración del original. Variación suave del encuadre.</small></div>;
}
