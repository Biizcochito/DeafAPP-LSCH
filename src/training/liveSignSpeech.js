import {displayWord} from '../ui/signNames.js';

export const spokenSignLabel=classId=>{
  const word=displayWord(classId.split('/').at(-1).replaceAll('_',' '));
  return word==='si'?'sí':word;
};

// Consume confirmed predictions, never the label selected for a training take.
// A sustained match is spoken once; brief tracking fluctuations do not rearm it.
export function createLiveSignSpeech({speech,onError=()=>{},onSpeak=()=>{},labelForClass=spokenSignLabel,now=()=>performance.now(),enabled=true,rearmMs=1000,repeatMs=2500}){
  let closed=false,epoch=0,lastClass=null,lastSpoken=-Infinity,absentSince=null,owned=false;
  function cancel(){
    epoch++;
    if(!owned)return;
    owned=false;
    try{void Promise.resolve(speech.stop()).catch(()=>{});}catch{/* A failed speaker must not stop recognition. */}
  }
  function reset(){cancel();lastClass=null;lastSpoken=-Infinity;absentSince=null;}
  function say(text){
    const request=++epoch;owned=true;
    const fail=()=>{if(!closed&&enabled&&request===epoch){owned=false;onError('No se pudo reproducir la voz. Pulsa «Probar voz» para reintentar.');}};
    try{
      const stopped=speech.stop();
      void Promise.resolve(stopped).then(()=>{
        if(closed||!enabled||request!==epoch)return;
        speech.speak(text,{language:'es-CL',rate:1,onError:fail,onDone:()=>{if(request===epoch)owned=false;}});
        onSpeak(text);
      }).catch(fail);
    }catch{fail();}
  }
  return {
    update(result){
      if(closed||!enabled)return;
      if(['off','paused','model','error'].includes(result?.phase)){reset();return;}
      const prediction=result?.prediction,time=now();
      if(result?.phase!=='matched'||prediction?.accepted!==true||typeof prediction.classId!=='string'||!prediction.classId.includes('/')){absentSince??=time;return;}
      const classId=prediction.classId,rearmed=absentSince!==null&&time-absentSince>=rearmMs;
      absentSince=null;
      if(classId===lastClass&&(!rearmed||time-lastSpoken<repeatMs))return;
      lastClass=classId;lastSpoken=time;say(labelForClass(classId));
    },
    setEnabled(value){enabled=!!value;reset();},
    preview(){if(!closed&&enabled){reset();say('Voz activada');}},
    sayText(text){if(!closed&&enabled&&typeof text==='string'&&text.trim()&&text.length<=600){reset();say(text.trim());}},
    reset,
    close(){if(closed)return;reset();closed=true;},
  };
}
