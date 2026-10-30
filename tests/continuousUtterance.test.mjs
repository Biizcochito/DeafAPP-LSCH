import test from 'node:test';
import assert from 'node:assert/strict';
import {createContinuousUtterance,formatRecognizedUtterance,conjugateRecognizedVerb} from '../src/training/continuousUtterance.js';
import {createLiveSignRecognizer} from '../src/training/liveSignRecognition.js';
import {createLiveSignSpeech} from '../src/training/liveSignSpeech.js';

function harness(){let time=0,serial=0;const timers=new Map(),updates=[],commits=[];
  const controller=createContinuousUtterance({now:()=>time,onUpdate:value=>updates.push(value),onCommit:value=>commits.push(value),
    setTimer:(fn,ms)=>{const id=++serial;timers.set(id,{fn,at:time+ms});return id;},clearTimer:id=>timers.delete(id)});
  return {controller,updates,commits,timers,advance(ms){time+=ms;for(const [id,timer] of [...timers])if(timer.at<=time){timers.delete(id);timer.fn();}},
    word(classId,span=800,extra={}){time+=span;controller.update({phase:'matched',prediction:{accepted:true,classId},startTimeMs:time-span,endTimeMs:time,segmentId:String(time),...extra});}};
}
test('compone vocabulario general y conjuga solo con sujeto explícito o contexto elegido',()=>{
  assert.equal(formatRecognizedUtterance(['verbos/querer','verbos/trabajar']),'Querer trabajar');
  assert.equal(formatRecognizedUtterance(['verbos/querer','verbos/trabajar'],{person:'yo',finished:true}),'Quiero trabajar.');
  assert.equal(formatRecognizedUtterance(['pronombres/tu','conversacion/no','verbos/poder','verbos/comer'],{finished:true}),'Tú no puedes comer.');
  assert.equal(formatRecognizedUtterance(['tiempo/manana','pronombres/nosotros','verbos/estudiar']),'Mañana nosotros estudiamos');
  assert.equal(conjugateRecognizedVerb('pedir','yo'),'pedir');
  assert.equal(conjugateRecognizedVerb('pedir','yo',{yo:'pido'}),'pido');
  assert.equal(formatRecognizedUtterance(['verbos/necesito','necesidades/ayuda']),'Necesito ayuda');
  assert.equal(formatRecognizedUtterance(['pronombres/nosotros','verbos/necesito','necesidades/ayuda']),'Nosotros necesitamos ayuda');
});
test('la misma seña sostenida no se duplica y se lee una frase al terminar una pausa',()=>{
  const h=harness();h.word('pronombres/yo');h.word('verbos/querer');h.word('verbos/querer');h.word('verbos/trabajar');
  assert.equal(h.controller.snapshot().text,'Yo quiero trabajar');assert.equal(h.commits.length,0);
  h.controller.update({phase:'ready'});h.advance(899);assert.equal(h.commits.length,0);h.advance(1);
  assert.equal(h.commits[0].text,'Yo quiero trabajar.');assert.equal(h.commits[0].requiresReview,false);
});
test('una repetición real tras soltar la seña puede conservarse',()=>{
  const h=harness();h.word('conversacion/no');h.controller.update({phase:'ready'});h.advance(700);h.word('conversacion/no',100);
  assert.equal(h.controller.snapshot().tokens.length,2);
});
test('la pérdida de seguimiento y las dudas bloquean la lectura automática',()=>{
  const h=harness();h.word('verbos/querer');h.controller.update({phase:'position'});h.advance(1200);h.controller.update({phase:'ready'});h.advance(3000);
  assert.equal(h.commits.length,0);assert.equal(h.controller.snapshot().issue,'tracking-lost');
  assert.equal(h.controller.finish(),true);assert.equal(h.commits[0].requiresReview,true);
  h.word('necesidades/agua');h.controller.update({phase:'uncertain'});h.advance(1200);h.controller.update({phase:'ready'});h.advance(3000);
  assert.equal(h.commits.length,1);assert.equal(h.controller.snapshot().issue,'unrecognized-gap');
});
test('una oración completa aprendida sustituye sus palabras solapadas',()=>{
  const h=harness();h.word('verbos/querer');h.word('necesidades/agua');h.word('oraciones/quiero agua',400,{startTimeMs:0,endTimeMs:2000});
  assert.equal(h.controller.snapshot().tokens.length,1);assert.equal(h.controller.snapshot().text,'Quiero agua');
});
test('deshacer, borrar, cambiar modelo y cerrar invalidan cualquier lectura pendiente',()=>{
  for(const action of ['clear','undo','model','off','paused','close']){
    const h=harness();h.word('saludos/hola');h.controller.update({phase:'ready'});
    if(['model','off','paused'].includes(action))h.controller.update({phase:action});else h.controller[action]();
    h.advance(10000);assert.equal(h.commits.length,0,action);assert.equal(h.timers.size,0,action);
  }
});
test('una predicción rechazada, un segmento repetido o resultados antiguos no añaden palabras',()=>{
  const h=harness();h.word('saludos/hola');h.word('necesidades/agua',800,{prediction:{accepted:false,classId:'necesidades/agua'}});
  h.word('saludos/gracias',800,{segmentId:'800'});h.word('saludos/gracias',800,{startTimeMs:0,endTimeMs:100});
  assert.equal(h.controller.snapshot().tokens.length,1);
});
test('una duda breve que termina en reposo exige revisión, pero la evidencia nueva que la cubre puede resolverla',()=>{
  const h=harness();h.word('verbos/querer');h.controller.update({phase:'uncertain'});h.advance(200);h.controller.update({phase:'ready'});h.advance(2000);
  assert.equal(h.commits.length,0);assert.equal(h.controller.snapshot().issue,'unrecognized-gap');h.controller.undo();
  h.word('saludos/hola');h.controller.update({phase:'ready'});h.advance(900);assert.equal(h.commits[0].text,'Hola.');
  const resolved=harness();resolved.word('verbos/querer');resolved.controller.update({phase:'uncertain'});resolved.advance(150);resolved.word('verbos/trabajar',200,{startTimeMs:600});
  resolved.controller.update({phase:'ready'});resolved.advance(900);assert.equal(resolved.commits[0].requiresReview,false);
});
test('deshacer una palabra no oculta un problema de seguimiento y una oración no duplica su última palabra',()=>{
  const h=harness();h.word('pronombres/yo');h.word('verbos/querer');h.controller.update({phase:'position'});h.advance(900);h.controller.undo();assert.equal(h.controller.snapshot().issue,'tracking-lost');
  const phrase=harness();phrase.word('oraciones/quiero agua',2000);phrase.word('necesidades/agua',200,{startTimeMs:1400});assert.equal(phrase.controller.snapshot().tokens.length,1);
});
test('la misma palabra puede comenzar una frase nueva después de terminar la anterior',()=>{
  const h=harness();for(let i=0;i<2;i++){h.word('saludos/hola');h.controller.update({phase:'ready'});h.advance(900);}assert.equal(h.commits.length,2);
});
test('cámara, composición y voz cierran una frase una sola vez al quedar quietas las manos',async()=>{
  let time=0,id=0;const timers=new Map(),spoken=[],events=[];
  const voice=createLiveSignSpeech({speech:{stop:async()=>{},speak:text=>spoken.push(text)}});
  const composer=createContinuousUtterance({now:()=>time,setTimer:(fn,ms)=>{timers.set(++id,{fn,at:time+ms});return id;},clearTimer:key=>timers.delete(key),onCommit:row=>voice.sayText(row.text)});
  const recognizer=createLiveSignRecognizer({now:()=>time,predict:async windows=>({predictions:windows.map(()=>({accepted:true,classId:'saludos/hola'}))}),onUpdate:row=>{events.push(row);composer.update(row);}});
  const flush=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
  function vector(t){return [...Array.from({length:84},(_,i)=>i%2?.3+Math.sin(t/180)*.12:(i%42)*.02),...Array(84).fill(0),1,1,1];}
  for(time=0;time<=5000;time+=40){recognizer.push({timeMs:time,vector:vector(Math.min(time,1400))});await flush();for(const [key,timer] of [...timers])if(timer.at<=time){timers.delete(key);timer.fn();await flush();}}
  assert.ok(events.some(row=>row.phase==='matched'));assert.deepEqual(spoken,['Hola.']);assert.equal(events.at(-1).phase,'ready');
  recognizer.close();composer.close();voice.close();
});
