import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('regional worker keeps tracking identity and publishes the learned anatomical handedness',async()=>{
  const messages=[];let active=false;let closed=0;
  const learnedHand=index=>({handScore:.99,handedness:index===0?'Right':'Left',
    landmarks:Array.from({length:21},()=>({x:index===0?.2:.8,y:.4,z:0}))});
  const detector={async handLandmarks(region){return active?learnedHand(region.slot):null;},
    handLandmarksToRoi(points){return {slot:points[0].x<.5?0:1};},async detectPalm(){return []},palmDetectionToRoi(){}};
  const self={location:{href:'http://127.0.0.1:8081/hand-tracking-worker.js'},postMessage:value=>messages.push(value)};
  const context=vm.createContext({self,URL,importScripts(){},HandRegions:{seeds(){return [{slot:0},{slot:1}]},valid(h){return !!h},duplicate(){return false}},
    OffscreenCanvas:class{constructor(w,h){this.width=w;this.height=h}getContext(){return {fillRect(){},drawImage(){},getImageData(){return {}}}}},
    tf:{async setBackend(){},async ready(){},tidy(fn){return fn()},browser:{fromPixels(){return {toFloat(){return {dispose(){}}}}}},zeros(){return {dispose(){}}}},
    handPoseDetection:{SupportedModels:{MediaPipeHands:'test'},async createDetector(){return detector}}});
  vm.runInContext(await readFile(new URL('../public/hand-tracking-worker.js',import.meta.url),'utf8'),context);
  await self.onmessage({data:{type:'init',id:1}});
  assert.equal(messages.at(-1).type,'ready');
  active=true;
  await self.onmessage({data:{type:'frame',id:2,timestamp:100,image:{width:640,height:480,close(){closed++}}}});
  const result=messages.at(-1).result;
  assert.deepEqual(Array.from(result.multiHandedness,x=>x.label),['Left','Right']);
  assert.deepEqual(Array.from(result.multiAnatomicalHandedness,x=>x.label),['Right','Left']);
  assert.equal(closed,1);
});
