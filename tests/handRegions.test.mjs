import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
import {createHandWorker} from '../handTrackingWorker.js';

const context=vm.createContext({self:{}});
vm.runInContext(await readFile(new URL('../public/hand-regions.js',import.meta.url),'utf8'),context);
const regions=context.self.HandRegions;
const hand=(x,y,score=.99)=>({handScore:score,landmarks:Array.from({length:21},(_,i)=>({x:x+(i%5)*.015,y:y+Math.floor(i/5)*.015,z:-.01}))});

test('near-edge acquisitions retain square physical regions and search above the initial hands',()=>{
  for(const [width,height] of [[640,480],[480,640]]){
    const first=regions.seeds({x:.2,y:.4,width:.3,height:.5},width,height,0);
    assert.equal(first.length,2);
    for(const roi of first){assert.ok(roi.xCenter>=.1&&roi.xCenter<=.9);assert.ok(Math.abs(roi.width*width-roi.height*height)<1e-6);}
    const higher=regions.seeds({x:.2,y:.4,width:.3,height:.5},width,height,2);
    assert.ok(higher[0].yCenter<first[0].yCenter);
    const middle=regions.seeds({x:.2,y:.4,width:.3,height:.5},width,height,3);
    assert.ok(middle[0].yCenter>higher[0].yCenter&&middle[0].yCenter<first[0].yCenter);
    assert.ok(Math.abs(middle[0].width*width-middle[0].height*height)<1e-6);
  }
});

test('low confidence, missing fingers and non-finite points cannot confirm a recording',()=>{
  assert.equal(regions.valid(hand(.2,.6)),true);
  assert.equal(regions.valid(hand(.2,.6,.79)),false);
  const missing=hand(.2,.6);missing.landmarks.pop();assert.equal(regions.valid(missing),false);
  const invalid=hand(.2,.6);invalid.landmarks[4].x=NaN;assert.equal(regions.valid(invalid),false);
});

test('overlapping probes cannot present one physical hand as two hands',()=>{
  const first=hand(.3,.6).landmarks;
  assert.equal(regions.duplicate(first,hand(.305,.601).landmarks),true);
  assert.equal(regions.duplicate(first,hand(.37,.6).landmarks),false);
});

test('worker transfers the frame and face region, and releases pending frames on close',async()=>{
  let worker,closed=0;
  globalThis.document={baseURI:'https://example.test/'};
  globalThis.createImageBitmap=async()=>({close(){closed++;}});
  globalThis.Worker=class{
    constructor(url){assert.equal(url.href,'https://example.test/hand-tracking-worker.js');worker=this;}
    postMessage(data,transfer){if(data.type==='init')queueMicrotask(()=>this.onmessage({data:{id:data.id,type:'ready'}}));else{this.frame=data;assert.equal(transfer[0],data.image);}}
    terminate(){this.terminated=true;}
  };
  try{
    const detector=await createHandWorker();const face={x:.5,y:.4,width:.2,height:.4};
    const job=detector.detect({},100,face);await Promise.resolve();assert.deepEqual(worker.frame.face,face);
    const result={multiHandLandmarks:[hand(.2,.6).landmarks]};worker.onmessage({data:{id:worker.frame.id,type:'result',result}});
    assert.equal(await job,result);assert.equal(closed,1);
    const pending=detector.detect({},200,face);await Promise.resolve();detector.close();await assert.rejects(pending,/cerrado/);assert.equal(closed,2);assert.equal(worker.terminated,true);
  }finally{delete globalThis.document;delete globalThis.createImageBitmap;delete globalThis.Worker;}
});

test('browser prewarming starts face and hands together and reuses both initialized graphs',async()=>{
  let faceStarted=false,handStarted=false,finishFace,finishHands,workerCount=0,tracker;
  globalThis.document={baseURI:'https://example.test/',createElement(kind){return kind==='script'?{remove(){}}:{width:0,height:0,getContext:()=>({drawImage(){},fillRect(){}})};},head:{appendChild(script){assert.ok(script.src.includes('face_mesh'));queueMicrotask(()=>script.onload());}}};
  globalThis.window={FACEMESH_CONTOURS:[],FaceMesh:class{setOptions(){}onResults(fn){this.callback=fn;}send(){faceStarted=true;return new Promise(resolve=>{finishFace=()=>{this.callback({});resolve();};});}async close(){}}};
  globalThis.createImageBitmap=async()=>({close(){}});
  globalThis.Worker=class{constructor(){workerCount++;}postMessage(data){if(data.type==='init')queueMicrotask(()=>this.onmessage({data:{id:data.id,type:'ready'}}));else{handStarted=true;finishHands=()=>this.onmessage({data:{id:data.id,type:'result',result:{}}});}}terminate(){}};
  try{
    const {warmSignTracking}=await import('../landmarkTracking.js');const first=warmSignTracking();assert.equal(warmSignTracking(),first);
    for(let i=0;i<35;i++)await Promise.resolve();assert.equal(faceStarted,true);assert.equal(handStarted,true);
    finishHands();finishFace();tracker=await first;assert.equal(tracker.handBackend,'direct-regions');assert.equal(await warmSignTracking(),tracker);assert.equal(workerCount,1);
  }finally{await tracker?.close();delete globalThis.document;delete globalThis.window;delete globalThis.createImageBitmap;delete globalThis.Worker;}
});
