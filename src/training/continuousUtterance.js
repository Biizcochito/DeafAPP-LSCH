import {spokenSignLabel} from './liveSignSpeech.js';

const people={yo:0,tu:1,el:2,ella:2,usted:2,nosotros:3,ellos:4,ellas:4,ustedes:4};
const pronouns={tu:'tú',el:'él'};
const irregular={
  querer:['quiero','quieres','quiere','queremos','quieren'],tener:['tengo','tienes','tiene','tenemos','tienen'],
  ir:['voy','vas','va','vamos','van'],poder:['puedo','puedes','puede','podemos','pueden'],saber:['sé','sabes','sabe','sabemos','saben'],
  ser:['soy','eres','es','somos','son'],estar:['estoy','estás','está','estamos','están'],hacer:['hago','haces','hace','hacemos','hacen'],
  venir:['vengo','vienes','viene','venimos','vienen'],dar:['doy','das','da','damos','dan'],ver:['veo','ves','ve','vemos','ven'],
  pensar:['pienso','piensas','piensa','pensamos','piensan'],dormir:['duermo','duermes','duerme','dormimos','duermen'],
  jugar:['juego','juegas','juega','jugamos','juegan'],reir:['río','ríes','ríe','reímos','ríen'],salir:['salgo','sales','sale','salimos','salen'],
};
const regularVerbs=new Set(['comer','beber','trabajar','estudiar','caminar','correr','hablar','escuchar','leer','escribir','nadar','bailar','cantar','llorar','ayudar','amar','entrar','comprar','vender','vivir','necesitar']);
export function conjugateRecognizedVerb(verb,person,forms){
  if(!Object.hasOwn(people,person))return verb;
  if(typeof forms?.[person]==='string'&&forms[person].trim())return forms[person].trim();
  const equivalent=people[person]===2?'el':people[person]===4?'ellos':null;
  if(equivalent&&typeof forms?.[equivalent]==='string'&&forms[equivalent].trim())return forms[equivalent].trim();
  const index=people[person];if(irregular[verb])return irregular[verb][index];
  if(!regularVerbs.has(verb)&&forms?.regular!==true)return verb;
  const match=verb.match(/^([a-záéíóúñ]+)(ar|er|ir)$/);if(!match)return verb;
  const endings={ar:['o','as','a','amos','an'],er:['o','es','e','emos','en'],ir:['o','es','e','imos','en']};return match[1]+endings[match[2]][index];
}
export function formatRecognizedUtterance(tokens,{person='signed',catalogue=[],finished=false}={}){
  const lexicon=new Map(catalogue.map(entry=>[entry.classId,entry]));let subject=Object.hasOwn(people,person)?person:null,finite=false;
  const words=tokens.map(token=>{
    const id=typeof token==='string'?token:token.classId,entry=lexicon.get(id),label=id.split('/').at(-1);
    const text=entry?.displayLabel||spokenSignLabel(id);
    if(id.startsWith('oraciones/')){finite=true;return text;}
    if(id.startsWith('pronombres/')&&Object.hasOwn(people,label)){subject=label;finite=false;return pronouns[label]||text;}
    if(id.startsWith('verbos/')&&subject&&!finite){finite=true;return conjugateRecognizedVerb(label,subject,entry?.forms);}
    return text;
  });
  let text=words.join(' ').trim();if(text)text=text[0].toLocaleUpperCase('es')+text.slice(1);if(finished&&text&&!/[.!?]$/.test(text))text+='.';return text;
}

// This composes confirmed labels. It is not a learned LSCh-to-Spanish translator.
// No subject, negation, tense or unknown word is inferred from camera movement.
export function createContinuousUtterance({onUpdate=()=>{},onCommit=()=>{},now=()=>performance.now(),setTimer=setTimeout,clearTimer=clearTimeout,
  silenceMs=900,rearmMs=600,maximumTokens=30,person='signed',catalogue=[]}={}){
  let tokens=[],issue=null,closed=false,timer,uncertainTimer,releaseSince=null,lostSince=null,doubtSince=null,lastClass=null,lastSegment=null;
  function snapshot(){return {tokens:tokens.map(t=>({...t})),text:formatRecognizedUtterance(tokens,{person,catalogue}),issue,canFinish:tokens.length>0};}
  function emit(){if(!closed)onUpdate(snapshot());}
  function cancel(){clearTimer(timer);clearTimer(uncertainTimer);timer=uncertainTimer=undefined;}
  function clear(){cancel();tokens=[];issue=null;lastClass=lastSegment=null;releaseSince=lostSince=doubtSince=null;emit();}
  function finish({manual=false}={}){
    clearTimer(timer);timer=undefined;if(closed||!tokens.length||issue&&!manual)return false;
    const result={...snapshot(),text:formatRecognizedUtterance(tokens,{person,catalogue,finished:true}),manual,requiresReview:!!issue};
    cancel();tokens=[];issue=null;lastClass=null;releaseSince=lostSince=doubtSince=null;emit();onCommit(result);return true;
  }
  function interrupt(message){clearTimer(timer);timer=undefined;issue=message;emit();}
  return {
    update(result){
      if(closed)return;
      if(['off','paused','model','error'].includes(result?.phase)){clear();return;}
      const time=now(),prediction=result?.prediction;
      if(result?.phase==='position'){
        clearTimer(timer);timer=undefined;lostSince??=time;
        if(tokens.length&&!uncertainTimer)uncertainTimer=setTimer(()=>{uncertainTimer=undefined;if(!closed&&lostSince!==null)interrupt('tracking-lost');},800);
        return;
      }
      if(result?.phase==='uncertain'){
        clearTimer(timer);timer=undefined;doubtSince??=time;
        if(tokens.length&&!uncertainTimer)uncertainTimer=setTimer(()=>{uncertainTimer=undefined;if(!closed)interrupt('unrecognized-gap');},1000);
        return;
      }
      clearTimer(uncertainTimer);uncertainTimer=undefined;
      if(lostSince!==null){if(time-lostSince>=800&&tokens.length)issue='tracking-lost';lostSince=null;}
      if(result?.phase==='ready'){
        if(doubtSince!==null&&tokens.length&&!issue){issue='unrecognized-gap';emit();}
        releaseSince??=time;
        if(tokens.length&&!issue&&!timer)timer=setTimer(()=>finish(),silenceMs);
        return;
      }
      clearTimer(timer);timer=undefined;
      if(result?.phase!=='matched'||prediction?.accepted!==true||typeof prediction.classId!=='string'||!prediction.classId.includes('/'))return;
      const id=prediction.classId,rearmed=releaseSince!==null&&time-releaseSince>=rearmMs;
      releaseSince=null;
      const start=Number.isFinite(result.startTimeMs)?result.startTimeMs:time,end=Number.isFinite(result.endTimeMs)?result.endTimeMs:time;
      if(end<start||tokens.length&&end<=tokens.at(-1).endTimeMs)return;
      if(doubtSince!==null){if(start<=doubtSince&&end>=doubtSince)doubtSince=null;else if(tokens.length&&!issue)issue='unrecognized-gap';}
      if(result.segmentId&&result.segmentId===lastSegment)return;
      if(id===lastClass&&!rearmed)return;
      const previous=tokens.at(-1);
      if(!id.startsWith('oraciones/')&&previous?.classId.startsWith('oraciones/')&&end>start&&(Math.min(end,previous.endTimeMs)-Math.max(start,previous.startTimeMs))/(end-start)>=.5)return;
      if(id.startsWith('oraciones/')){
        // A learned whole-phrase match replaces overlapping individual labels.
        tokens=tokens.filter(token=>token.endTimeMs<start||token.endTimeMs-token.startTimeMs>0&&(Math.min(end,token.endTimeMs)-Math.max(start,token.startTimeMs))/(token.endTimeMs-token.startTimeMs)<.5);
      }
      if(tokens.length>=maximumTokens){interrupt('too-long');return;}
      tokens.push({classId:id,startTimeMs:start,endTimeMs:end,segmentId:result.segmentId||null});
      lastClass=id;lastSegment=result.segmentId||null;emit();
    },
    finish:()=>finish({manual:true}),
    undo(){if(closed)return;cancel();tokens.pop();lastClass=tokens.at(-1)?.classId||null;lastSegment=tokens.at(-1)?.segmentId||null;if(!tokens.length){issue=null;releaseSince=lostSince=doubtSince=null;}emit();},
    clear,
    setContext(value={}){if(closed)return;person=value.person||'signed';catalogue=value.catalogue||[];emit();},
    snapshot,
    close(){if(closed)return;cancel();tokens=[];closed=true;},
  };
}
