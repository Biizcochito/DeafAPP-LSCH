import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveSignSpeech,spokenSignLabel} from '../src/training/liveSignSpeech.js';
import {CATEGORIAS} from '../src/catalog/signCatalog.js';
import {spanishVoices,voiceForGender} from '../src/training/spanishVoices.js';

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
test('las frases compuestas respetan silencio, reemplazo de audio y cierre sin callbacks tardíos',async()=>{
  const h=harness();h.voice.sayText('Yo quiero trabajar.');await flush();assert.equal(h.spoken[0].text,'Yo quiero trabajar.');
  h.voice.setEnabled(false);h.voice.sayText('Otra frase.');await flush();assert.equal(h.spoken.length,1);
  h.voice.setEnabled(true);h.voice.sayText('   ');h.voice.sayText('a'.repeat(601));await flush();assert.equal(h.spoken.length,1);
  h.voice.close();h.voice.sayText('Después de salir.');await flush();assert.equal(h.spoken.length,1);
  let release;const pending=harness({speech:{stop:()=>new Promise(resolve=>{release=resolve;}),speak:()=>assert.fail('Lectura cancelada')}});pending.voice.sayText('Pendiente.');const old=release;pending.voice.reset();old();await flush();pending.voice.close();
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
  assert.equal(spokenSignLabel('familia/mama'),'mamá');assert.equal(spokenSignLabel('familia/papa'),'papá');
  assert.equal(spokenSignLabel('frutas_verduras/papa'),'papa');assert.equal(spokenSignLabel('pronombres/tu'),'tú');
  assert.equal(spokenSignLabel('saludos/como estas'),'cómo estás');
});

test('voice covers the entire catalog and new approved labels without a spoken-word whitelist',async()=>{
  const classes=[...CATEGORIAS.flatMap(category=>category.señas.map(word=>`${category.id}/${word}`)),
    'abecedario/a','conversacion/mi apellido','verbos/informar','biblioteca/seña recién aprobada'];
  const h=harness();
  for(const classId of classes)await h.update(match(classId));
  assert.equal(h.spoken.length,classes.length);assert.equal(h.spoken.at(-1).text,'seña recién aprobada');
  assert.ok(h.spoken.some(row=>row.text==='quiero agua'));assert.ok(h.spoken.some(row=>row.text==='mamá'));assert.ok(h.spoken.some(row=>row.text==='papá'));assert.ok(h.spoken.some(row=>row.text==='papa'));
  h.voice.close();
});

test('la voz elegida se aplica a pruebas, señas y frases y se puede volver a automática',async()=>{
  const h=harness({voice:'es-mujer'});
  h.voice.preview();await flush();assert.equal(h.spoken.at(-1).options.voice,'es-mujer');
  h.voice.setVoice('es-hombre');await h.update(match('saludos/hola'));
  assert.equal(h.spoken.at(-1).options.voice,'es-hombre');
  h.voice.sayText('Quiero agua.');await flush();assert.equal(h.spoken.at(-1).options.voice,'es-hombre');
  h.voice.setVoice(undefined);h.voice.preview();await flush();
  assert.equal(h.spoken.at(-1).options.voice,undefined);h.voice.close();
});

test('cambiar la voz cancela audio pendiente y no activa una voz silenciada',async()=>{
  const releases=[],spoken=[];
  const h=harness({voice:'anterior',speech:{stop:()=>new Promise(resolve=>releases.push(resolve)),speak:(text,options)=>spoken.push(options.voice)}});
  h.voice.preview();const pending=releases[0];h.voice.setVoice('nueva');pending();await flush();
  assert.deepEqual(spoken,[]);
  h.voice.preview();releases.at(-1)();await flush();assert.deepEqual(spoken,['nueva']);
  h.voice.setEnabled(false);h.voice.setVoice('otra');h.voice.preview();await flush();
  assert.deepEqual(spoken,['nueva']);h.voice.close();
});

test('las opciones usan voces españolas reales y no atribuyen género a voces desconocidas',()=>{
  const voices=spanishVoices([
    {identifier:'en',language:'en-US',name:'Female'},
    {identifier:'es-m',language:'es-ES',name:'Microsoft Pablo'},
    {identifier:'es-f',language:'es-ES',name:'Microsoft Helena'},
    {identifier:'cl-f',language:'es-CL',name:'Catalina'},
    {identifier:'unknown',language:'es-MX',name:'Google español'},
    {identifier:'es-f',language:'es-ES',name:'Microsoft Helena'},
  ]);
  assert.equal(voices.length,4);
  assert.equal(voiceForGender(voices,'female'),'cl-f');
  assert.equal(voiceForGender(voices,'male'),'es-m');
  assert.equal(voices.find(row=>row.identifier==='unknown').gender,null);
  assert.equal(voiceForGender(spanishVoices([{identifier:'unknown',language:'es',name:'Google español'}]),'male'),'');
  assert.deepEqual(spanishVoices(),[]);
});
