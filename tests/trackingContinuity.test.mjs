import test from 'node:test';
import assert from 'node:assert/strict';
import {createLandmarkContinuity} from '../src/camera/landmarkContinuity.js';
import {createLiveTrackingPump} from '../src/camera/liveTrackingPump.js';
const points=(x=.3,n=21)=>Array.from({length:n},(_,i)=>({x:x+i*.001,y:.4+i*.002,z:0}));
const flush=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};

test('un fallo breve mantiene solo el dibujo y las publicaciones de cara no prolongan la retención',()=>{
  const overlay=createLandmarkContinuity(),raw={handTime:100,leftHandLandmarks:points()};overlay.update(raw,200);
  const missing={handTime:200,faceTime:300};overlay.update(missing,300);assert.equal(missing.leftHandLandmarks,undefined);
  assert.equal(overlay.frame(350).leftHandLandmarks.length,21);assert.ok(overlay.frame(350).overlayAlpha.leftHandLandmarks<1);
  overlay.update({...missing,faceTime:400},400);assert.equal(overlay.frame(441).leftHandLandmarks,undefined);assert.equal(raw.leftHandLandmarks[0].x,.3);
});
test('sin nuevos resultados los dibujos caducan; datos futuros o inválidos no renuevan un trazado',()=>{
  const overlay=createLandmarkContinuity();overlay.update({handTime:100,leftHandLandmarks:points()},100);assert.equal(overlay.frame(701).leftHandLandmarks,undefined);
  overlay.update({handTime:1000,leftHandLandmarks:points()},800);assert.equal(overlay.frame(800).leftHandLandmarks,undefined);
  overlay.update({handTime:900,leftHandLandmarks:points()},900);const invalid=points();invalid[2].x=NaN;overlay.update({handTime:950,leftHandLandmarks:invalid},950);
  assert.equal(overlay.frame(1091).leftHandLandmarks,undefined);overlay.clear();assert.equal(overlay.frame(1000).leftHandLandmarks,undefined);
});
test('el suavizado no modifica muestras originales y los desplazamientos rápidos se dibujan sin arrastre',()=>{
  const overlay=createLandmarkContinuity();overlay.update({handTime:0,leftHandLandmarks:points()},0);
  const next=points(.31);overlay.update({handTime:20,leftHandLandmarks:next},20);const x=overlay.frame(20).leftHandLandmarks[0].x;
  assert.ok(x>.3&&x<.31);assert.equal(next[0].x,.31);overlay.update({handTime:40,leftHandLandmarks:points(.6)},40);assert.equal(overlay.frame(40).leftHandLandmarks[0].x,.6);
});
test('la caducidad de cara y manos es independiente',()=>{
  const overlay=createLandmarkContinuity();overlay.update({faceTime:0,faceLandmarks:points(.5,468),handTime:0,leftHandLandmarks:points()},0);
  overlay.update({faceTime:0,faceLandmarks:points(.5,468),handTime:550,leftHandLandmarks:points()},550);
  assert.equal(overlay.frame(650).faceLandmarks,undefined);assert.equal(overlay.frame(650).leftHandLandmarks.length,21);
});
function pumpHarness({face,hand,staticVideo=false}={}){
  let time=0,id=0;const timers=new Map(),calls={hands:0,face:0},errors=[];
  const video={readyState:2,get currentTime(){return staticVideo?1:time/1000;}};
  const tracker={sendHands(){calls.hands++;return hand?hand():Promise.resolve();},sendFace(){calls.face++;return face?face():Promise.resolve();}};
  const pump=createLiveTrackingPump({tracker,video,now:()=>time,withTimeout:promise=>promise,onError:e=>errors.push(e),setTimer:(fn,ms)=>{timers.set(++id,{fn,at:time+ms});return id;},clearTimer:key=>timers.delete(key)});
  return {pump,calls,errors,timers,async advance(ms){const until=time+ms;while(true){const next=[...timers].filter(([,row])=>row.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;time=next[1].at;timers.delete(next[0]);next[1].fn();await flush();}time=until;await flush();}};
}
test('una cara lenta no frena las manos ni acumula trabajos sobre fotogramas viejos',async()=>{
  let release;const h=pumpHarness({face:()=>new Promise(resolve=>{release=resolve;})});await h.advance(500);assert.equal(h.calls.face,1);assert.ok(h.calls.hands>=14);assert.ok(h.calls.hands<=17);
  h.pump.close();release();await flush();assert.equal(h.timers.size,0);const n=h.calls.hands;await h.advance(500);assert.equal(h.calls.hands,n);
});
test('una mano lenta no crea solicitudes concurrentes y los fotogramas detenidos no se reprocesan',async()=>{
  let release;const h=pumpHarness({hand:()=>new Promise(resolve=>{release=resolve;})});await h.advance(500);assert.equal(h.calls.hands,1);assert.ok(h.calls.face>5);h.pump.close();release();await flush();assert.equal(h.timers.size,0);
  const still=pumpHarness({staticVideo:true});await still.advance(1000);assert.deepEqual(still.calls,{hands:1,face:1});still.pump.close();
});
test('un error termina ambos ritmos una sola vez y no revive después de cerrar',async()=>{
  const h=pumpHarness({hand:()=>Promise.reject(Error('GPU unavailable'))});await h.advance(100);assert.equal(h.errors.length,1);assert.equal(h.timers.size,0);await h.advance(10000);assert.equal(h.errors.length,1);
  let reject;const pending=pumpHarness({face:()=>new Promise((_,fail)=>{reject=fail;})});await pending.advance(0);pending.pump.close();reject(Error('late'));await flush();assert.equal(pending.errors.length,0);
});
