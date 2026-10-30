import {useCallback,useEffect,useRef,useState} from 'react';
import {createContinuousUtterance} from './continuousUtterance.js';
import {spokenSignLabel} from './liveSignSpeech.js';

export function useLiveConversation({voice,catalogue,onReset,initialMode='phrases'}){
  const [mode,setMode]=useState(initialMode==='signs'?'signs':'phrases'),[person,setPerson]=useState('signed'),[draft,setDraft]=useState({tokens:[],text:'',issue:null,canFinish:false}),[history,setHistory]=useState([]);
  const composer=useRef(null),alive=useRef(false),options=useRef({mode,person,catalogue}),previous=useRef(null),absent=useRef(null);
  options.current={mode,person,catalogue,onReset};
  useEffect(()=>{
    alive.current=true;
    composer.current=createContinuousUtterance({person:options.current.person,catalogue:options.current.catalogue,
      onUpdate:value=>{if(alive.current)setDraft(value);},onCommit:result=>{if(!alive.current)return;
        setHistory(rows=>[...rows,{id:Date.now()+Math.random(),label:result.text,requiresReview:result.requiresReview,kind:'phrase'}].slice(-10));
        if(!result.requiresReview)voice.current?.sayText(result.text);
      }});
    return()=>{alive.current=false;composer.current?.close();composer.current=null;};
  },[]);
  useEffect(()=>{composer.current?.setContext({person,catalogue});},[person,catalogue]);
  const reset=useCallback(()=>{composer.current?.clear();previous.current=absent.current=null;voice.current?.reset();options.current.onReset?.();},[voice]);
  const update=useCallback(result=>{
    if(!alive.current)return;
    if(options.current.mode==='phrases'){
      if(['off','paused','model','error'].includes(result?.phase))voice.current?.reset();
      composer.current?.update(result);return;
    }
    voice.current?.update(result);
    if(['off','paused','model','error'].includes(result?.phase)){previous.current=absent.current=null;return;}
    if(result.phase!=='matched'||result.prediction?.accepted!==true){absent.current??=performance.now();return;}
    const id=result.prediction.classId;
    if(previous.current!==id||absent.current!==null&&performance.now()-absent.current>=1000){
      setHistory(rows=>[...rows,{id:Date.now()+Math.random(),label:options.current.catalogue.find(row=>row.classId===id)?.displayLabel||spokenSignLabel(id),requiresReview:false,kind:'sign'}].slice(-10));
    }
    previous.current=id;absent.current=null;
  },[voice]);
  function changeMode(value){if(!['phrases','signs'].includes(value)||mode===value)return;reset();setMode(value);}
  return {mode,setMode:changeMode,person,setPerson,draft,history,update,reset,finish:()=>composer.current?.finish(),undo:()=>composer.current?.undo(),
    clearDraft:reset,clearHistory:()=>{reset();setHistory([]);}};
}
