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

test('los colores siguen cada palma aunque el modelo invierta sus etiquetas',()=>{
  const overlay=createLandmarkContinuity();
  for(let i=0;i<18;i++){
    const time=100+i*33,a=points(.2+i*.004),b=points(.8-i*.004);
    const raw={handTime:time,leftHandLandmarks:i%2?b:a,rightHandLandmarks:i%2?a:b};
    const snapshot=structuredClone(raw);overlay.update(raw,time);const visual=overlay.frame(time);
    assert.ok(visual.leftHandLandmarks[0].x<.4);
    assert.ok(visual.rightHandLandmarks[0].x>.6);
    assert.deepEqual(raw,snapshot,'la asociación visual nunca reetiqueta la observación cruda');
  }
});

test('las trayectorias conservan los colores al cruzarse y tras una oclusión breve',()=>{
  const overlay=createLandmarkContinuity();
  for(let i=0;i<31;i++){
    const time=100+i*33,a=points(.2+i*.02),b=points(.8-i*.02).map(p=>({...p,y:p.y+.035}));
    // Sort by image position, simulating changing labels/order at the crossing.
    const raw={handTime:time,leftHandLandmarks:a[0].x<b[0].x?a:b,rightHandLandmarks:a[0].x<b[0].x?b:a};
    if(i>=18&&i<=20){delete raw.leftHandLandmarks;raw.rightHandLandmarks=a;}
    overlay.update(raw,time);
    if(i>=24){const result=overlay.frame(time);assert.ok(result.leftHandLandmarks[0].x>.6);assert.ok(result.rightHandLandmarks[0].x<.4);}
  }
});

test('el filtro reduce ruido en reposo y responde a dedos rápidos aunque la muñeca no cambie',()=>{
  const overlay=createLandmarkContinuity();let sumRaw=0,sumVisual=0,n=0;
  for(let i=0;i<100;i++){
    const time=100+i*33,noise=Math.sin(i*2.1)*.003;
    overlay.update({handTime:time,leftHandLandmarks:points(.3+noise)},time);
    if(i>20){sumRaw+=noise**2;sumVisual+=(overlay.frame(time).leftHandLandmarks[0].x-.3)**2;n++;}
  }
  assert.ok(Math.sqrt(sumVisual/n)<Math.sqrt(sumRaw/n)*.55);
  overlay.clear();const hand=points();overlay.update({handTime:100,leftHandLandmarks:hand},100);
  for(let i=1;i<=5;i++){
    const time=100+i*33,next=points();next[8].x+=i*.025;
    overlay.update({handTime:time,leftHandLandmarks:next},time);
    if(i>=3)assert.ok(next[8].x-overlay.frame(time).leftHandLandmarks[8].x<.012,'el dedo responde sin arrastrar toda la mano');
    assert.equal(overlay.frame(time).leftHandLandmarks[0].x,hand[0].x);
  }
});

test('cambios rápidos de sentido no mantienen una mano fantasma ni prolongan su vida desde la cara',()=>{
  const overlay=createLandmarkContinuity();
  for(let i=0;i<10;i++){const t=100+i*40;overlay.update({handTime:t,leftHandLandmarks:points(.3+Math.sin(i)*.04)},t);}
  overlay.update({handTime:500},500);overlay.update({handTime:500,faceTime:700,faceLandmarks:points(.5,468)},700);
  assert.equal(overlay.frame(700).leftHandLandmarks,undefined);
  overlay.update({handTime:1200,rightHandLandmarks:points(.75)},1200);
  assert.equal(overlay.frame(1200).leftHandLandmarks,undefined);
  assert.equal(overlay.frame(1200).rightHandLandmarks[0].x,.75);
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

test('una inferencia lenta toma el siguiente fotograma sin sumar una pausa fija',async()=>{
  let release,calls=0;
  const h=pumpHarness({hand:()=>++calls===1?new Promise(done=>{release=done;}):Promise.resolve()});
  await h.advance(70);assert.equal(h.calls.hands,1);
  release();await flush();await h.advance(0);
  assert.equal(h.calls.hands,2);h.pump.close();
});
test('un error termina ambos ritmos una sola vez y no revive después de cerrar',async()=>{
  const h=pumpHarness({hand:()=>Promise.reject(Error('GPU unavailable'))});await h.advance(100);assert.equal(h.errors.length,1);assert.equal(h.timers.size,0);await h.advance(10000);assert.equal(h.errors.length,1);
  let reject;const pending=pumpHarness({face:()=>new Promise((_,fail)=>{reject=fail;})});await pending.advance(0);pending.pump.close();reject(Error('late'));await flush();assert.equal(pending.errors.length,0);
});
