import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveRecognitionStability,readRecognitionStability,saveRecognitionStability} from '../src/training/liveRecognitionStability.js';
import {createLiveSignRecognizer} from '../src/training/liveSignRecognition.js';
const classes=['saludos/hola','necesidades/agua'];
const match=(n,classId=classes[0])=>({phase:'matched',prediction:{accepted:true,classId},segmentId:String(n),startTimeMs:n*2000,endTimeMs:n*2000+900});
function episode(tracker,n,classId){tracker.update({phase:'tracking'});tracker.update(match(n,classId));tracker.update({phase:'ready'});}
test('cinco señas separadas producen una racha de cinco, sin seleccionar ni confirmar',()=>{
  const updates=[],t=createLiveRecognitionStability({modelId:'one',classes,onChange:v=>updates.push(v)});
  for(let n=0;n<5;n++)episode(t,n);
  assert.equal(t.snapshot().rows[0].bestStreak,5);assert.equal(updates.length,5);
});
test('el reconocedor real alimenta cinco episodios y no los cientos de fotogramas intermedios',async()=>{
  const tracker=createLiveRecognitionStability({modelId:'one',classes});let time=0,segments=0;
  const vector=t=>[...Array.from({length:84},(_,i)=>i%2?.3+Math.sin(t/180)*.12:(i%42)*.02),...Array(84).fill(0),1,1,1];
  const recognizer=createLiveSignRecognizer({now:()=>time,predict:async windows=>({predictions:windows.map(()=>({accepted:true,classId:classes[0]})),computeMs:1}),onUpdate:result=>{tracker.update(result);if(result.phase==='matched')segments++;}});
  async function feed(duration,make){const until=time+duration;for(;time<=until;time+=40){recognizer.push({timeMs:time,vector:make(time)});for(let i=0;i<8;i++)await Promise.resolve();}}
  for(let n=0;n<5;n++){await feed(1400,vector);const still=vector(time);await feed(1600,()=>still);}
  assert.equal(segments,5);assert.equal(tracker.snapshot().rows[0].bestStreak,5);recognizer.close();
});
test('fotogramas repetidos, ventanas superpuestas y varios resultados del mismo movimiento no cuentan varias veces',()=>{
  const t=createLiveRecognitionStability({modelId:'one',classes});t.update(match(0));
  for(let n=1;n<20;n++)t.update(match(n));assert.equal(t.snapshot().rows[0].bestStreak,1);
  t.update({phase:'ready'});t.update(match(0));t.update({...match(1),startTimeMs:500});assert.equal(t.snapshot().rows[0].bestStreak,1);
});
test('otra seña o un movimiento sin coincidencia interrumpen la racha y conservan la mejor observada',()=>{
  const t=createLiveRecognitionStability({modelId:'one',classes});episode(t,0);episode(t,1);episode(t,2,classes[1]);episode(t,3);
  assert.equal(t.snapshot().rows.find(r=>r.classId===classes[0]).bestStreak,2);
  t.update({phase:'tracking'});t.update({phase:'uncertain'});t.update({phase:'ready'});episode(t,4);assert.equal(t.snapshot().rows[0].bestStreak,2);
  episode(t,5);episode(t,6);assert.equal(t.snapshot().rows[0].bestStreak,3);
});
test('los datos locales solo se recuperan para el mismo modelo y clases vigentes',()=>{
  const t=createLiveRecognitionStability({modelId:'one',classes,initial:{modelId:'one',rows:[{classId:classes[0],bestStreak:5},{classId:'unknown/secret',bestStreak:5},{classId:classes[1],bestStreak:99}]}});
  assert.deepEqual(t.snapshot().rows,[{classId:classes[0],bestStreak:5}]);
  assert.deepEqual(createLiveRecognitionStability({modelId:'two',classes,initial:t.snapshot()}).snapshot().rows,[]);
  const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
  saveRecognitionStability(t.snapshot(),storage);assert.deepEqual(readRecognitionStability(storage),t.snapshot());
  assert.equal(readRecognitionStability({getItem(){throw Error('blocked')}}),null);
});
