const EVENT='deafapp:recording-review',CHANNEL='deafapp-recording-library',KEY='deafapp-recording-review';

// Signals contain no recording data or credentials. Every receiver rechecks the
// authenticated library; a notification never grants approval by itself.
export function notifyRecordingReview(target=globalThis.window){
  if(!target)return;
  try{target.dispatchEvent(new Event(EVENT));}catch{/* Other transports can still notify. */}
  try{const channel=new target.BroadcastChannel(CHANNEL);channel.postMessage('changed');channel.close();}catch{/* Storage also reaches older browsers. */}
  try{target.localStorage.setItem(KEY,`${Date.now()}:${Math.random()}`);}catch{/* Storage may be unavailable in private browsing. */}
}

export function listenForRecordingReviews(callback,target=globalThis.window){
  if(!target)return ()=>{};
  const storage=event=>{if(event.key===KEY)callback();};let channel;
  target.addEventListener(EVENT,callback);target.addEventListener('storage',storage);
  try{channel=new target.BroadcastChannel(CHANNEL);channel.onmessage=()=>callback();}catch{/* Periodic checks remain available. */}
  return ()=>{target.removeEventListener(EVENT,callback);target.removeEventListener('storage',storage);channel?.close();};
}

export async function approvedLibraryRevision(client,signal){
  // The newest moderation timestamp and exact approved count detect additions,
  // removals and reapprovals, including records beyond the first results page.
  const result=await client.from('grabaciones').select('id,moderation_version,moderated_at',{count:'exact'})
    .eq('aprobada',true).order('moderated_at',{ascending:false,nullsFirst:false}).order('id',{ascending:false}).limit(1).abortSignal(signal);
  if(result.error||!Number.isInteger(result.count)||!Array.isArray(result.data))throw Error('No se pudieron comprobar los cambios de la biblioteca.');
  const latest=result.data[0];
  return JSON.stringify([result.count,latest?.id,latest?.moderation_version,latest?.moderated_at]);
}

export function startApprovedLibrarySync({client,refresh,onError=()=>{},onConnected=()=>{},canRefresh=()=>true,
  target=globalThis.window,document=globalThis.document,intervalMs=2000,
  readRevision=approvedLibraryRevision,listen=listenForRecordingReviews,
  setTimer=setTimeout,clearTimer=clearTimeout}){
  let closed=false,running=false,queued=false,force=true,timer,revision,failures=0,channel;
  const controller=new AbortController();
  const visible=()=>!document?.hidden;
  function schedule(delay){clearTimer(timer);if(!closed&&visible())timer=setTimer(tick,delay);}
  function request(forceRefresh=false){if(closed)return;force||=forceRefresh;queued=true;if(!running)schedule(25);}
  async function tick(){
    if(closed||!visible())return;
    if(!canRefresh()){schedule(250);return;}
    if(running)return;
    running=true;queued=false;const forced=force;force=false;
    try{
      const next=await readRevision(client,controller.signal);
      if(closed)return;
      if(forced||next!==revision)await refresh();
      if(!closed){revision=next;failures=0;onConnected();}
    }catch(error){
      if(!closed){force||=forced;failures++;onError(error);if(error.code==='session_expired')close();}
    }finally{running=false;schedule(queued?25:Math.min(30000,intervalMs*2**Math.min(failures,4)));}
  }
  const wake=()=>request(),visibility=()=>{if(visible())request();else clearTimer(timer);};
  const unlisten=listen(wake,target);
  target?.addEventListener('focus',wake);target?.addEventListener('online',wake);document?.addEventListener('visibilitychange',visibility);
  try{
    channel=client.channel(`approved-library-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'grabaciones'},wake)
      .subscribe(status=>{if(status==='SUBSCRIBED')request();});
  }catch{/* The revision check also works when Realtime is not enabled. */}
  function close(){
    if(closed)return;closed=true;clearTimer(timer);controller.abort();unlisten();
    target?.removeEventListener('focus',wake);target?.removeEventListener('online',wake);document?.removeEventListener('visibilitychange',visibility);
    try{if(channel)void Promise.resolve(client.removeChannel(channel)).catch(()=>{});}catch{/* Closing a page must still finish locally. */}
  }
  schedule(0);
  return {request:()=>request(true),close};
}
