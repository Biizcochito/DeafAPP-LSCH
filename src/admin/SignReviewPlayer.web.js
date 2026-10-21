import {useEffect,useRef,useState} from 'react';
let apiPromise;
function loadYouTube(){
  if(window.YT?.Player)return Promise.resolve(window.YT);
  if(apiPromise)return apiPromise;
  apiPromise=new Promise((resolve,reject)=>{
    const previous=window.onYouTubeIframeAPIReady;
    const timeout=setTimeout(()=>{apiPromise=null;reject(Error('YouTube tardó en responder. Puedes abrir el vídeo original.'));},15000);
    window.onYouTubeIframeAPIReady=()=>{clearTimeout(timeout);previous?.();resolve(window.YT);};
    const script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';script.async=true;
    script.onerror=()=>{clearTimeout(timeout);script.remove();apiPromise=null;reject(Error('No se pudo conectar con YouTube.'));};document.head.append(script);
  });return apiPromise;
}
export default function SignReviewPlayer({row}){
  const container=useRef(null),player=useRef(null),current=useRef(row),repeat=useRef(false);
  const [ready,setReady]=useState(false),[error,setError]=useState(''),[loop,setLoop]=useState(false),[slow,setSlow]=useState(false);
  current.current=row;repeat.current=loop;
  useEffect(()=>{
    let disposed=false,instance;
    const slot=document.createElement('div');container.current.append(slot);
    loadYouTube().then(YT=>{
      if(disposed)return;
      instance=new YT.Player(slot,{width:'100%',height:'100%',host:'https://www.youtube-nocookie.com',playerVars:{playsinline:1,rel:0,origin:window.location.origin},events:{
        onReady:()=>{if(disposed)return;player.current=instance;setReady(true);const r=current.current;instance.cueVideoById({videoId:r.videoId,startSeconds:r.start,endSeconds:r.end});},
        onStateChange:e=>{if(e.data===0&&repeat.current&&!disposed){const r=current.current;instance.loadVideoById({videoId:r.videoId,startSeconds:r.start,endSeconds:r.end});}},
        onError:()=>{if(!disposed)setError('YouTube no pudo reproducir este tramo. Abre el vídeo original o elige otro candidato.');}
      }});
    }).catch(e=>{if(!disposed)setError(e.message);});
    return()=>{disposed=true;player.current=null;instance?.destroy();slot.remove();};
  },[]);
  useEffect(()=>{setError('');setSlow(false);if(player.current){player.current.setPlaybackRate(1);player.current.cueVideoById({videoId:row.videoId,startSeconds:row.start,endSeconds:row.end});}},[row.key,row.videoId,row.start,row.end]);
  function play(){setError('');player.current?.loadVideoById({videoId:row.videoId,startSeconds:row.start,endSeconds:row.end});}
  function speed(){const next=!slow;try{player.current?.setPlaybackRate(next ? 0.5 : 1);setSlow(next);}catch{setError('Este vídeo no permite cambiar la velocidad.');}}
  return <><div className="sr-player" ref={container} aria-label="Vídeo del segmento seleccionado"/><div className="sr-player-controls"><button type="button" onClick={play} disabled={!ready}>Reproducir tramo</button><button type="button" onClick={speed} disabled={!ready} aria-pressed={slow}>Velocidad 0,5×</button><label><input type="checkbox" checked={loop} onChange={e=>setLoop(e.target.checked)}/> Repetir tramo</label></div>{error&&<p className="sr-error" role="alert">{error}</p>}</>;
}
