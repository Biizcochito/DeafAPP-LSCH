import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const regionsSource=await readFile(new URL('../public/hand-regions.js',import.meta.url),'utf8');
const workerSource=await readFile(new URL('../public/hand-tracking-worker.js',import.meta.url),'utf8');
const points=x=>Array.from({length:21},(_,i)=>({x:x+i*.001,y:.45+i*.002,z:0}));
test('la región predice movimiento limitado, conserva la zona tras varios fallos y caduca',()=>{
  const context=vm.createContext({self:{}});vm.runInContext(regionsSource,context);const r=context.self.HandRegions,slot={};
  r.remember(slot,{xCenter:.3,yCenter:.5,width:.2,height:.2*640/480,rotation:.1},100);r.remember(slot,{xCenter:.35,yCenter:.5,width:.2,height:.2*640/480,rotation:.1},150);
  const predicted=r.trackedRegion(slot,200,640,480),recovery=r.trackedRegion(slot,200,640,480,true);
  assert.ok(predicted.xCenter>.35&&predicted.xCenter<.45);assert.ok(recovery.width>predicted.width);assert.ok(Math.abs(predicted.width*640-predicted.height*480)<1e-6);assert.equal(predicted.rotation,.1);
  slot.misses=3;assert.ok(r.trackedRegion(slot,500,640,480));assert.equal(r.trackedRegion(slot,801,640,480),null);assert.equal(r.trackedRegion(slot,120,640,480),null);r.forget(slot);assert.equal(r.trackedRegion(slot,200,640,480),null);
});
async function harness(){
  let image={},closed=0,disposed=0;const messages=[],regions=[];
  const good=x=>({handScore:.99,handedness:x<.5?'Right':'Left',landmarks:points(x)});
  const detector={async handLandmarks(roi){regions.push({...roi,scene:image.scene});if(!image.scene||image.scene==='hidden')return null;
    if(image.scene==='recover'&&(!(roi.width>=.24)||Math.min(Math.abs(roi.xCenter-.25),Math.abs(roi.xCenter-.75))>.03))return null;
    return good(image.scene==='duplicate'?.25:roi.xCenter<.5?.25:.75);},
    handLandmarksToRoi(p){return {xCenter:p[0].x,yCenter:.5,width:.2,height:.2*640/480,rotation:0};},async detectPalm(){return [];},palmDetectionToRoi(){}};
  const self={location:{href:'http://localhost/hand-tracking-worker.js'},postMessage:row=>messages.push(row)};
  const context=vm.createContext({self,URL,importScripts(){},OffscreenCanvas:class{constructor(w,h){this.width=w;this.height=h;}getContext(){return {fillRect(){},drawImage(frame){image=frame;},getImageData(){return {};}};}},
    tf:{async setBackend(){},async ready(){},tidy(fn){return fn();},browser:{fromPixels(){return {toFloat(){return {dispose(){disposed++;}}}};}},zeros(){return {dispose(){disposed++;}};}},
    handPoseDetection:{SupportedModels:{MediaPipeHands:'mock'},async createDetector(){return detector;}}});
  vm.runInContext(regionsSource,context);context.HandRegions=self.HandRegions;vm.runInContext(workerSource,context);await self.onmessage({data:{type:'init',id:0}});assert.equal(messages.at(-1).type,'ready');
  return {regions,get closed(){return closed;},get disposed(){return disposed;},async frame(scene,time){await self.onmessage({data:{type:'frame',id:time,timestamp:time,image:{scene,width:640,height:480,close(){closed++;}}}});return messages.at(-1).result;}};
}
test('tras dos oclusiones se recupera en el mismo fotograma con inferencia nueva y sin dibujar manos ausentes',async()=>{
  const h=await harness();assert.equal((await h.frame('visible',100)).multiHandLandmarks.length,2);
  for(const time of [150,200])assert.equal((await h.frame('hidden',time)).multiHandLandmarks.length,0);
  const recovered=await h.frame('recover',250);assert.equal(recovered.multiHandLandmarks.length,2);assert.ok(h.regions.some(roi=>roi.scene==='recover'&&roi.width>=.24));assert.equal(h.closed,4);assert.equal(h.disposed,6);
  const expired=await h.frame('recover',1000);assert.equal(expired.multiHandLandmarks.length,0);
});
test('dos búsquedas sobre la misma mano nunca cuentan como dos manos',async()=>{
  const h=await harness();const result=await h.frame('duplicate',100);assert.equal(result.multiHandLandmarks.length,1);assert.equal(result.multiAnatomicalHandedness.length,1);
});
test('un salto artificial en la forma de la palma se rechaza sin penalizar su traslación',()=>{
  const context=vm.createContext({self:{}});vm.runInContext(regionsSource,context);const r=context.self.HandRegions;
  const prior=points(.25),slot={points:prior,seenAt:100};const moved=points(.4);
  assert.equal(r.consistent({landmarks:moved},slot,150,640,480),true);
  const deformed=points(.4);deformed[0].y+=.4;assert.equal(r.consistent({landmarks:deformed},slot,150,640,480),false);
  assert.equal(r.consistent({landmarks:deformed},slot,500,640,480),true);
});
