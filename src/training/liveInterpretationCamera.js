export function createLiveInterpretationCamera({getMedia,createTracker,createInference,createRecognizer,
  freshLandmarks,trackingVector,draw,withTimeout,video,canvas,onResult,onState,onError,
  now=()=>performance.now(),setTimer=setTimeout,clearTimer=clearTimeout,setRepeater=setInterval,clearRepeater=clearInterval}) {
  let session=null,model=null,closed=false;
  const current=state=>!closed&&session===state;
  function configure(state) {
    state.recognizer?.close();state.inference?.close();state.recognizer=null;state.inference=null;
    if(!model){onResult({phase:'model'});return;}
    state.inference=createInference(model);
    state.recognizer=createRecognizer({wholePhrases:(model.enabledClasses||model.classes).some(id=>id.startsWith('oraciones/')),
      predict:windows=>state.inference.predict(windows),onUpdate:result=>{if(current(state))onResult(result);}});
    state.recognizer.reset('position');
  }
  function stop() {
    const state=session;session=null;
    if(state){clearTimer(state.timer);clearRepeater(state.expiry);state.recognizer?.close();state.inference?.close();
      state.stream?.getTracks().forEach(track=>track.stop());void state.tracker?.close();}
    video.srcObject=null;
    canvas.getContext('2d')?.clearRect(0,0,canvas.width,canvas.height);
    if(!closed){onState('off');onResult({phase:'off'});}
  }
  async function start() {
    if(closed||session)return;
    const state={};session=state;onState('starting');onResult({phase:'loading'});
    try {
      const stream=await getMedia({video:{width:{ideal:640},height:{ideal:480},facingMode:'user'},audio:false});
      if(!current(state)){stream.getTracks().forEach(track=>track.stop());return;}
      state.stream=stream;video.srcObject=stream;await video.play();
      if(!current(state))return;
      const tracker=await createTracker();
      if(!current(state)){await tracker.close();return;}
      state.tracker=tracker;configure(state);
      tracker.onResults(result=>{
        if(!current(state))return;
        const time=now(),fresh=freshLandmarks(result,time);
        canvas.width=video.videoWidth;canvas.height=video.videoHeight;
        const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);draw(ctx,fresh);
        state.recognizer?.expire(time);
        if(result.handTime===state.lastHandTime)return;
        state.lastHandTime=result.handTime;
        state.recognizer?.push({timeMs:time,vector:time-result.handTime<=350?trackingVector(fresh,video.videoWidth,video.videoHeight):null});
      });
      async function tick(){
        if(!current(state))return;
        const started=now();
        try{
          if(video.readyState>=2&&video.currentTime!==state.videoTime){
            state.videoTime=video.currentTime;
            await withTimeout(Promise.all([tracker.sendHands({image:video}),tracker.sendFace({image:video})]),state.warm?10000:45000);
            state.warm=true;
          }
          if(current(state))state.timer=setTimer(tick,Math.max(0,50-(now()-started)));
        }catch(error){if(current(state)){stop();onError(error);}}
      }
      state.expiry=setRepeater(()=>state.recognizer?.expire(now()),100);
      onState('on');void tick();
    }catch(error){if(current(state)){stop();onError(error);}}
  }
  return {start,stop,reset(){if(!closed)session?.recognizer?.reset('position');},setModel(value){if(closed||model?.id===value?.id)return;model=value;if(session?.tracker){try{configure(session);}catch(error){stop();onError(error);}}},
    close(){if(closed)return;stop();closed=true;}};
}
