import React,{useEffect,useState} from 'react';
import {registerRootComponent} from 'expo';
import {catalogueSeed} from '../../src/training/recognitionCatalog';
import {createLiveRecognitionStability} from '../../src/training/liveRecognitionStability';
import VocabularyQuality from '../../src/training/VocabularyQuality.web';
import '../../src/ui/theme.css';
import '../../src/app/LiveInterpretation.css';

const examples=[['saludos/hola',5],['necesidades/agua',3],['necesidades/ayuda',1]];
const entries=catalogueSeed().filter(row=>examples.some(([id])=>id===row.classId)),words=entries.map(row=>row.classId),labels=new Map(entries.map(row=>[row.classId,row.displayLabel]));
function Preview(){
  const [stability,setStability]=useState([]);
  useEffect(()=>{
    const tracker=createLiveRecognitionStability({modelId:'local-demo',classes:words,onChange:state=>setStability(state.rows)});let time=0;
    for(const [classId,count]of examples)for(let i=0;i<count;i++){
      tracker.update({phase:'tracking'});tracker.update({phase:'matched',prediction:{accepted:true,classId},segmentId:String(time),startTimeMs:time,endTimeMs:time+900});tracker.update({phase:'ready'});time+=2000;
    }
  },[]);
  return <div className="deaf-app live-interpretation"><main className="li-main"><div className="li-heading"><span className="li-eyebrow">PRUEBA LOCAL · DETECCIONES SIMULADAS</span><h1>Reconocimiento automático</h1><p>Sin seleccionar señas ni confirmar resultados. Esta demostración usa eventos simulados, no la cámara.</p></div><section className="li-conversation" style={{minHeight:0,maxWidth:700}}><section className="li-vocabulary"><h3>Rachas observadas automáticamente</h3><VocabularyQuality words={words} quality={[]} stability={stability} labels={id=>labels.get(id)}/></section></section></main></div>;
}
document.body.style.margin='0';document.body.style.background='#080c0a';registerRootComponent(Preview);
