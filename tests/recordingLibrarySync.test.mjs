import test from 'node:test';
import assert from 'node:assert/strict';
import {startApprovedLibrarySync,approvedLibraryRevision,notifyRecordingReview,listenForRecordingReviews} from '../src/training/recordingLibrarySync.js';
import {createAdminClient} from '../src/admin/adminClient.js';

const flush=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
function harness(options={}){
 let time=0,id=0,current='one',busy=false,refreshes=0,checks=0,signal,listenCallback;
 const timers=new Map(),target=new EventTarget(),document=new EventTarget(),errors=[];document.hidden=false;
 const setTimer=(callback,delay)=>{timers.set(++id,{at:time+delay,callback});return id;};
 const sync=startApprovedLibrarySync({client:{},target,document,onError:error=>errors.push(error),
  readRevision:async(_client,value)=>{checks++;signal=value;return current;},
  refresh:async()=>{refreshes++;},canRefresh:()=>!busy,
  listen:callback=>{listenCallback=callback;return ()=>{listenCallback=null;};},
  setTimer,clearTimer:id=>timers.delete(id),...options});
 return {sync,target,document,errors,get refreshes(){return refreshes;},get checks(){return checks;},get signal(){return signal;},get pendingTimers(){return timers.size;},
  revision:value=>{current=value;},busy:value=>{busy=value;},notify:()=>listenCallback?.(),
  async advance(ms){const until=time+ms;while(true){const next=[...timers].filter(([,job])=>job.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;time=next[1].at;timers.delete(next[0]);next[1].callback();await flush();}time=until;await flush();}};
}

test('a saved approval refreshes an open library immediately; unchanged checks do not reload it',async()=>{
 const h=harness();await h.advance(0);assert.equal(h.refreshes,1);
 await h.advance(10000);assert.equal(h.refreshes,1);
 h.revision('approved');h.notify();await h.advance(25);assert.equal(h.refreshes,2);
 h.notify();h.notify();await h.advance(25);assert.equal(h.refreshes,2);h.sync.close();
});

test('another device is detected automatically without Realtime or a local notification',async()=>{
 const h=harness();await h.advance(0);h.revision('remote approval');await h.advance(2000);assert.equal(h.refreshes,2);
 h.revision('approval withdrawn');await h.advance(2000);assert.equal(h.refreshes,3);h.sync.close();
});

test('capturing defers synchronization until the task ends without losing the approval',async()=>{
 const h=harness();await h.advance(0);h.busy(true);h.revision('new');h.notify();await h.advance(3000);assert.equal(h.refreshes,1);
 h.busy(false);await h.advance(250);assert.equal(h.refreshes,2);h.sync.close();
});

test('a review arriving while a download runs is rechecked without overlapping refreshes',async()=>{
 let release,calls=0;
 const h=harness({refresh:()=>{calls++;return calls===1?new Promise(resolve=>{release=resolve;}):Promise.resolve();}});
 await h.advance(0);h.revision('changed while downloading');h.notify();await h.advance(5000);assert.equal(calls,1);
 release();await flush();await h.advance(25);assert.equal(calls,2);h.sync.close();
});

test('hidden tabs pause checks and wake on visibility, connectivity and focus',async()=>{
 const h=harness();await h.advance(0);h.document.hidden=true;h.document.dispatchEvent(new Event('visibilitychange'));
 h.revision('changed');await h.advance(20000);assert.equal(h.checks,1);
 h.document.hidden=false;h.document.dispatchEvent(new Event('visibilitychange'));await h.advance(25);assert.equal(h.refreshes,2);
 for(const event of ['online','focus']){h.revision(event);h.target.dispatchEvent(new Event(event));await h.advance(25);}
 assert.equal(h.refreshes,4);h.sync.close();
});

test('network errors retry with backoff, report recovery and do not falsely acknowledge a revision',async()=>{
 let unavailable=true,loads=0,recovered=0;
 const h=harness({refresh:async()=>{loads++;if(unavailable)throw Error('offline');},onConnected:()=>{recovered++;}});
 await h.advance(0);assert.equal(h.errors.length,1);await h.advance(3999);assert.equal(loads,1);
 unavailable=false;await h.advance(1);assert.equal(loads,2);assert.equal(recovered,1);h.sync.close();
});

test('closing aborts checks, removes listeners and prevents late requests after logout',async()=>{
 let release;
 const h=harness({refresh:()=>new Promise(resolve=>{release=resolve;})});await h.advance(0);h.sync.close();assert.equal(h.signal.aborted,true);
 release();await flush();h.notify();h.target.dispatchEvent(new Event('online'));await h.advance(10000);assert.equal(h.checks,1);assert.equal(h.pendingTimers,0);
 const expired=harness({refresh:async()=>{throw Object.assign(Error('expired'),{code:'session_expired'});}});await expired.advance(0);assert.equal(expired.pendingTimers,0);
});

test('Realtime changes trigger synchronization and its channel is removed on close',async()=>{
 let change,subscribed,removed=false;
 const channel={on(type,filter,callback){assert.equal(type,'postgres_changes');assert.deepEqual(filter,{event:'*',schema:'public',table:'grabaciones'});change=callback;return this;},subscribe(callback){subscribed=callback;return this;}};
 const h=harness({client:{channel:()=>channel,removeChannel:async value=>{assert.equal(value,channel);removed=true;}}});
 await h.advance(0);h.revision('realtime');change();await h.advance(25);assert.equal(h.refreshes,2);
 h.revision('missed while disconnected');subscribed('SUBSCRIBED');await h.advance(25);assert.equal(h.refreshes,3);
 h.sync.close();assert.equal(removed,true);
});

test('revision checks use approved count and latest moderation version instead of downloading files',async()=>{
 let value={count:297,data:[{id:3,moderation_version:2,moderated_at:'2026-10-28T21:00:00Z'}]};const calls=[];
 const query=Object.fromEntries(['select','eq','order','limit'].map(name=>[name,(...args)=>{calls.push([name,...args]);return query;}]));query.abortSignal=async()=>value;
 const client={from:name=>{assert.equal(name,'grabaciones');return query;}};
 const first=await approvedLibraryRevision(client);value={...value,count:296};assert.notEqual(await approvedLibraryRevision(client),first);
 value={count:297,data:[{...value.data[0],moderation_version:3}]};assert.notEqual(await approvedLibraryRevision(client),first);
 assert.ok(calls.some(([method,column,approved])=>method==='eq'&&column==='aprobada'&&approved===true));
 value={count:null,data:null,error:Error('offline')};await assert.rejects(()=>approvedLibraryRevision(client),/comprobar/);
});

test('same-tab, cross-tab and storage notifications carry no session or recording content',()=>{
 const windows=[new EventTarget(),new EventTarget()],channels=new Set();let stored;
 class Channel{constructor(name){this.name=name;channels.add(this);}postMessage(data){for(const other of channels)if(other!==this&&other.name===this.name)other.onmessage?.({data});}close(){channels.delete(this);}}
 for(const target of windows){target.BroadcastChannel=Channel;target.localStorage={setItem:(key,value)=>{stored={key,value};}};}
 let first=0,second=0;const a=listenForRecordingReviews(()=>first++,windows[0]),b=listenForRecordingReviews(()=>second++,windows[1]);
 notifyRecordingReview(windows[0]);assert.equal(first,2);assert.equal(second,1);assert.ok(stored.value.length<100);
 a();b();assert.equal(channels.size,0);
});

test('a committed moderation emits a notification only after server success; conflicts emit none',async()=>{
 const original=globalThis.window;let events=0,release;
 const target=new EventTarget();globalThis.window=target;const off=listenForRecordingReviews(()=>events++,target);
 try{
  const api=createAdminClient({rpc:()=>new Promise(resolve=>{release=resolve;})}),session={token:'a'.repeat(64),expiresAt:Date.now()+60000};
  const pending=api.review(session,[{id:'1',version:0}],'approved');assert.equal(events,0);release({data:{ok:true,changed:1}});await pending;assert.equal(events,1);
  const failed=api.review(session,[{id:'1',version:0}],'rejected');release({error:{code:'40001'}});await assert.rejects(failed);assert.equal(events,1);
 }finally{off();if(original===undefined)delete globalThis.window;else globalThis.window=original;}
});
