// Hands must not wait for a slow face graph. Each channel owns at most one job
// and always takes the current video frame instead of queueing old images.
export function createLiveTrackingPump({tracker,video,onError,withTimeout,now=()=>performance.now(),setTimer=setTimeout,clearTimer=clearTimeout}){
  let closed=false;
  const channels=['hands','face'].map(name=>({name,timer:null,warm:false,videoTime:undefined}));
  async function tick(channel){
    if(closed)return;const started=now();
    try{
      if(video.readyState>=2&&video.currentTime!==channel.videoTime){
        channel.videoTime=video.currentTime;
        await withTimeout(channel.name==='hands'?tracker.sendHands({image:video}):tracker.sendFace({image:video}),channel.warm?10000:45000);
        channel.warm=true;
      }
      if(!closed)channel.timer=setTimer(()=>void tick(channel),Math.max(8,(channel.name==='hands'?33:80)-(now()-started)));
    }catch(error){if(!closed){close();onError(error);}}
  }
  function close(){if(closed)return;closed=true;channels.forEach(channel=>clearTimer(channel.timer));}
  channels.forEach(channel=>{channel.timer=setTimer(()=>void tick(channel),0);});
  return {close};
}
