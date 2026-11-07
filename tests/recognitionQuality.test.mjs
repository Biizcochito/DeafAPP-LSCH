import test from 'node:test';
import assert from 'node:assert/strict';
import {recognitionQuality,qualityByClass} from '../src/training/recognitionQuality.js';

const row=(samples,correct,predicted=correct)=>({evaluation:{samples,correct,predicted,scope:'different-recordings'}});
test('la racha en vivo usa 5, 3–4 y 1–2 sin presentar las coincidencias como aciertos verificados',()=>{
  for(const [n,level]of [[1,'low'],[2,'low'],[3,'medium'],[4,'medium'],[5,'high']]){
    const value=recognitionQuality({}, {bestStreak:n});assert.equal(value.level,level);assert.equal(value.source,'stability');assert.match(value.detail,/no aciertos comprobados/);
  }
  assert.equal(recognitionQuality({}, {bestStreak:0}).level,'unrated');
  assert.equal(recognitionQuality({manualLevel:'low'}, {bestStreak:5}).source,'manual');
});
test('el nivel automático usa tanto el acierto como las falsas aceptaciones',()=>{
  assert.equal(recognitionQuality(row(20,17,20)).level,'high');
  assert.equal(recognitionQuality(row(20,16,16)).level,'medium');
  assert.equal(recognitionQuality(row(10,6,10)).level,'medium');
  assert.equal(recognitionQuality(row(10,5,5)).level,'low');
  assert.equal(recognitionQuality(row(10,10,20)).level,'low');
  assert.equal(recognitionQuality(row(5,0,0)).level,'low');
});
test('no convierte pocos ensayos, variantes, similitud ni metadatos incompletos en precisión',()=>{
  for(const value of [undefined,{},row(1,1),row(4,4),{originals:50,approvedVariants:100,confidence:1},
    {evaluation:{...row(10,10).evaluation,scope:'pending'}},row(5,6,6),row(10,5,4),row(-1,0),row(5.1,5.1)])assert.equal(recognitionQuality(value).level,'unrated');
});
test('la valoración manual tiene prioridad y automático restituye la evaluación',()=>{
  assert.equal(recognitionQuality({...row(10,10),manualLevel:'low'}).level,'low');
  assert.equal(recognitionQuality({...row(10,10),manualLevel:'unrated'}).source,'manual');
  assert.equal(recognitionQuality({...row(10,10),manualLevel:null}).level,'high');
  assert.match(recognitionQuality({...row(10,10),manualLevel:'high'}).detail,/manualmente/);
  const independent={evaluation:{...row(10,10).evaluation,scope:'different-confirmed-people'}};
  assert.match(recognitionQuality(independent).detail,/personas distintas/);
});
test('los identificadores de categorías se mantienen independientes',()=>{
  const map=qualityByClass([{classId:'familia/papa',manualLevel:'high'},{classId:'frutas_verduras/papa',manualLevel:'low'},null]);
  assert.equal(recognitionQuality(map.get('familia/papa')).level,'high');assert.equal(recognitionQuality(map.get('frutas_verduras/papa')).level,'low');
  assert.equal(qualityByClass(null).size,0);
});
