import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveSignSpeech,spokenSignLabel} from '../src/training/liveSignSpeech.js';
import {CATEGORIAS} from '../src/catalog/signCatalog.js';

const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const match=classId=>({phase:'matched',prediction:{accepted:true,classId}});
function harness(options={}){
  let time=0;const spoken=[],stops=[],errors=[];
  const speech={stop:()=>{stops.push(time);return Promise.resolve();},speak:(text,options)=>spoken.push({text,options})};
  const voice=createLiveSignSpeech({speech,now:()=>time,onError:error=>errors.push(error),...options});
  return {voice,speech,spoken,stops,errors,time:value=>{time=value;},async update(result){voice.update(result);await flush();}};
}

test('speaks only confirmed accepted predictions, including complete phrases, in Spanish',async()=>{
  const h=harness();
  for(const result of [{phase:'tracking'},{phase:'recognizing',prediction:{accepted:true,classId:'saludos/hola'}},{phase:'uncertain',prediction:{suggestedClassId:'saludos/hola'}},{phase:'matched',prediction:{accepted:false,classId:'saludos/hola'}}])await h.update(result);
  assert.equal(h.spoken.length,0);
  await h.update(match('saludos/hola'));await h.update(match('oraciones/quiero agua'));
  assert.deepEqual(h.spoken.map(row=>row.text),['hola','quiero agua']);
  assert.ok(h.spoken.every(row=>row.options.language==='es-CL'));h.voice.close();
});

test('a sustained match and short tracking fluctuations do not repeat the same word',async()=>{
  const h=harness();await h.update(match('saludos/hola'));
  for(const time of [100,500,3000,15000]){h.time(time);await h.update(match('saludos/hola'));}
  h.time(15100);await h.update({phase:'uncertain'});h.time(15500);await h.update(match('saludos/hola'));
  assert.deepEqual(h.spoken.map(row=>row.text),['hola']);h.voice.close();
});

test('a new gesture can repeat the same word after a real gap without waiting to speak a different sign',async()=>{
  const h=harness();await h.update(match('saludos/hola'));
  h.time(300);await h.update({phase:'position'});h.time(1800);await h.update(match('saludos/hola'));
  assert.equal(h.spoken.length,1);
  h.time(2000);await h.update({phase:'position'});h.time(3300);await h.update(match('saludos/hola'));
  await h.update(match('necesidades/agua'));
  assert.deepEqual(h.spoken.map(row=>row.text),['hola','hola','agua']);h.voice.close();
});

test('new predictions replace pending speech rather than building an audio backlog',async()=>{
  const releases=[],spoken=[];const h=harness({speech:{stop:()=>new Promise(resolve=>releases.push(resolve)),speak:text=>spoken.push(text)}});
  h.voice.update(match('saludos/hola'));h.voice.update(match('necesidades/agua'));
  releases[1]();await flush();releases[0]();await flush();
  assert.deepEqual(spoken,['agua']);h.voice.close();
});

test('mute, camera stop and disposal cancel pending or active speech and ignore late callbacks',async()=>{
  for(const action of [voice=>voice.setEnabled(false),voice=>voice.reset(),voice=>voice.close()]){
    let release,spoken=0;const h=harness({speech:{stop:()=>new Promise(resolve=>{release=resolve;}),speak:()=>{spoken++;}}});
    h.voice.update(match('saludos/hola'));const pending=release;action(h.voice);pending();await flush();assert.equal(spoken,0);h.voice.close();
  }
  const h=harness();await h.update(match('saludos/hola'));const previous=h.spoken[0].options;
  h.voice.setEnabled(false);previous.onError();assert.equal(h.errors.length,0);
  await h.update(match('necesidades/agua'));assert.equal(h.spoken.length,1);
  h.voice.setEnabled(true);await h.update(match('necesidades/agua'));assert.equal(h.spoken.at(-1).text,'agua');h.voice.close();
});

test('pausing recognition or changing model cancels speech; losing tracking lets the word finish',async()=>{
  for(const phase of ['paused','off','model','error']){
    const h=harness();await h.update(match('saludos/hola'));const stops=h.stops.length;
    await h.update({phase});assert.equal(h.stops.length,stops+1);h.voice.close();
  }
  const h=harness();await h.update(match('oraciones/necesito ayuda'));const stops=h.stops.length;
  await h.update({phase:'position'});assert.equal(h.stops.length,stops);h.voice.close();
});

test('speaker errors are reported without interrupting visual recognition and the test button can retry',async()=>{
  const h=harness();await h.update(match('saludos/hola'));h.spoken[0].options.onError();assert.match(h.errors[0],/Probar voz/);
  h.voice.preview();await flush();assert.equal(h.spoken.at(-1).text,'Voz activada');h.voice.close();
  const broken=harness({speech:{stop:()=>Promise.reject(Error('unavailable')),speak:()=>assert.fail('must not speak')}});
  await broken.update(match('saludos/hola'));assert.equal(broken.errors.length,1);broken.voice.close();
});

test('spoken labels retain Spanish pronunciation and the canonical complete-phrase label',()=>{
  assert.equal(spokenSignLabel('tiempo/manana'),'mañana');assert.equal(spokenSignLabel('conversacion/si'),'sí');
  assert.equal(spokenSignLabel('oraciones/yo bien'),'estoy bien');assert.equal(spokenSignLabel('oraciones/quiero comer'),'quiero comer');
});

test('voice covers the entire catalog and new approved labels without a spoken-word whitelist',async()=>{
  const classes=[...CATEGORIAS.flatMap(category=>category.señas.map(word=>`${category.id}/${word}`)),
    'abecedario/a','conversacion/mi apellido','verbos/informar','biblioteca/seña recién aprobada'];
  const h=harness();
  for(const classId of classes)await h.update(match(classId));
  assert.equal(h.spoken.length,classes.length);assert.equal(h.spoken.at(-1).text,'seña recién aprobada');
  assert.ok(h.spoken.some(row=>row.text==='quiero agua'));assert.ok(h.spoken.some(row=>row.text==='mamá'||row.text==='mama'));
  h.voice.close();
});
