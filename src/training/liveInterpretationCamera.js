import {createLandmarkContinuity} from '../camera/landmarkContinuity.js';
import {createLiveTrackingPump} from '../camera/liveTrackingPump.js';

export function createLiveInterpretationCamera({getMedia,createTracker,createInference,createRecognizer,
  freshLandmarks,trackingVector,draw,withTimeout,video,canvas,onResult,onState,onError,
  now=()=>performance.now(),setTimer=setTimeout,clearTimer=clearTimeout,setRepeater=setInterval,clearRepeater=clearInterval}) {
  let session=null,model=null,closed=false,prepared=null,detector=null,suspended=false,blocked=false,wanted=false;
  const current=state=>!closed&&session===state;
  function prepare() {
    if(closed)return Promise.resolve(null);
    if(!prepared)prepared=Promise.resolve().then(createTracker).then(tracker=>{
      if(closed){void tracker.close();return null;}
      detector=tracker;return tracker;
    }).catch(error=>{prepared=null;throw error;});
    return prepared;
  }
  function configure(state) {
    state.recognizer?.close();state.inference?.close();state.recognizer=null;state.inference=null;
    if(!model){onResult({phase:'model'});return;}
    state.inference=createInference(model);
    state.recognizer=createRecognizer({wholePhrases:(model.enabledClasses||model.classes).some(id=>id.startsWith('oraciones/')),
      predict:windows=>state.inference.predict(windows),onUpdate:result=>{if(current(state)&&!suspended)onResult(result);}});
    state.recognizer.reset('position');
  }
  function pause(state) {
    state.pump?.close();state.pump=null;clearRepeater(state.expiry);state.expiry=null;
    state.overlay?.clear();state.recognizer?.reset('position');
    canvas.getContext('2d')?.clearRect(0,0,canvas.width,canvas.height);
  }
  function stop(forget=true) {
    if(forget)wanted=false;
    const state=session;session=null;
    if(state){pause(state);state.recognizer?.close();state.inference?.close();
      state.stream?.getTracks().forEach(track=>{track.removeEventListener?.('ended',state.ended);track.stop();});}
    video.srcObject=null;
    canvas.getContext('2d')?.clearRect(0,0,canvas.width,canvas.height);
    if(!closed){onState('off');onResult({phase:'off'});}
  }
  async function start() {
    if(closed)return;wanted=true;if(session||blocked)return;
    const state={};session=state;onState('starting');onResult({phase:'loading'});
    // Camera permission/preview and model initialization do not wait on each other.
    const trackerReady=prepare().then(tracker=>({tracker}),error=>({error}));
    try {
      const stream=await getMedia({video:{width:{ideal:640},height:{ideal:480},facingMode:'user'},audio:false});
      if(!current(state)){stream.getTracks().forEach(track=>track.stop());return;}
      state.stream=stream;state.ended=()=>{if(current(state))stop();};
      stream.getTracks().forEach(track=>track.addEventListener?.('ended',state.ended));
      video.srcObject=stream;await video.play();
      if(!current(state))return;
      const ready=await trackerReady;if(!current(state))return;if(ready.error)throw ready.error;
      const tracker=ready.tracker;
      state.tracker=tracker;state.overlay=createLandmarkContinuity();configure(state);
      state.paint=time=>{
        if(!current(state)||suspended)return;
        if(canvas.width!==video.videoWidth)canvas.width=video.videoWidth;
        if(canvas.height!==video.videoHeight)canvas.height=video.videoHeight;
        const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);draw(ctx,state.overlay.frame(time));
      };
      tracker.onResults(result=>{
        if(!current(state)||suspended)return;
        const time=now(),recent={...result,
          faceLandmarks:result.faceTime>=state.minimumTime?result.faceLandmarks:undefined,
          leftHandLandmarks:result.handTime>=state.minimumTime?result.leftHandLandmarks:undefined,
          rightHandLandmarks:result.handTime>=state.minimumTime?result.rightHandLandmarks:undefined};
        const fresh=freshLandmarks(recent,time);
        state.overlay.update(recent,time);state.paint(time);
        state.recognizer?.expire(time);
        if(result.handTime===state.lastHandTime)return;
        state.lastHandTime=result.handTime;
        state.recognizer?.push({timeMs:time,vector:result.handTime>=state.minimumTime&&time-result.handTime<=350?trackingVector(fresh,video.videoWidth,video.videoHeight):null});
      });
      if(!suspended)resume(state);
      onState('on');
    }catch(error){if(current(state)){stop();onError(error);}}
  }
  function resume(state) {
    if(!state.tracker||state.pump||!current(state)||suspended)return;
    state.minimumTime=now();state.lastHandTime=undefined;state.overlay.clear();state.recognizer?.reset('position');
    void Promise.resolve(video.play()).catch(error=>{if(current(state)){stop();onError(error);}});
    state.pump=createLiveTrackingPump({tracker:state.tracker,video,now,withTimeout,setTimer,clearTimer,onError:error=>{
      if(current(state)){stop();const failed=detector;detector=null;prepared=null;void failed?.close();onError(error);}
    }});
    state.expiry=setRepeater(()=>{if(current(state)&&!suspended){const time=now();state.recognizer?.expire(time);state.paint(time);}},33);
  }
  return {prepare,start,stop,
    setSuspended(value){if(closed||suspended===value)return;suspended=value;
      if(session){if(value)pause(session);else resume(session);}
      else if(!value&&wanted&&!blocked)void start();
    },
    setBlocked(value){if(closed||blocked===value)return;blocked=value;if(value)stop(false);else if(wanted&&!suspended)void start();},
    reset(){if(!closed)session?.recognizer?.reset('position');},setModel(value){if(closed||model?.id===value?.id)return;model=value;if(session?.tracker){try{configure(session);}catch(error){stop();onError(error);}}},
    close(){if(closed)return;stop();closed=true;void detector?.close();detector=null;}};
}
