import test from 'node:test';
import assert from 'node:assert/strict';
import { retireVerifiedSource } from '../scripts/recording-migration/retire.mjs';
import { sha256 } from '../scripts/recording-migration/plan.mjs';

function fixture(){
 const bytes=Buffer.from(JSON.stringify({label:'mama',categoria:'familia',frames:['private']}));
 const item={path:'familia/mama/a.json',sourceId:'241',sourceVersion:1,bytes:bytes.length,label:'mama',category:'familia'};
 const receipt={...item,sha256:sha256(bytes)},events=[];
 const args={item,receipt,backup:{read:async()=>bytes},source:{assertCurrent:async()=>events.push('source-check'),download:async()=>bytes},
   destination:{download:async()=>bytes},backend:async()=>({provider:'r2',bytes}),integrity:async()=>events.push('integrity'),
   remove:async path=>events.push(`remove:${path}`),onRemoved:async value=>events.push(value)};
 return {args,events,bytes};
}
test('only the redundant file is retired after private read, backup and integrity checks',async()=>{
 const {args,events}=fixture();await retireVerifiedSource(args);
 const index=events.indexOf('remove:familia/mama/a.json');assert.ok(index>=4);
 assert.equal(events[index+1].path,args.item.path);assert.equal(events[index+1].sha256,args.receipt.sha256);
 assert.equal(events.at(-1),'integrity');assert.equal(events.filter(x=>typeof x==='string'&&x.startsWith('remove:')).length,1);
});
for(const reason of ['backup','r2','backend','database','source','receipt'])test(`a failed ${reason} check preserves the source file`,async()=>{
 const {args,events}=fixture();
 if(reason==='backup')args.backup.read=async()=>Buffer.from('changed');
 if(reason==='r2')args.destination.download=async()=>Buffer.from('changed');
 if(reason==='backend')args.backend=async()=>({provider:'supabase',bytes:Buffer.from('changed')});
 if(reason==='database')args.integrity=async()=>{throw Error('changed model');};
 if(reason==='source')args.source.assertCurrent=async()=>{throw Error('changed source');};
 if(reason==='receipt')args.receipt={...args.receipt,sourceVersion:2};
 await assert.rejects(retireVerifiedSource(args));assert.ok(!events.some(x=>typeof x==='string'&&x.startsWith('remove:')));
});
test('the receipt is persisted before a post-retirement failure',async()=>{
 const {args,events,bytes}=fixture();let reads=0;
 args.backend=async()=>{if(reads++)throw Error('transient');return {provider:'r2',bytes};};
 await assert.rejects(retireVerifiedSource(args));assert.ok(events.some(x=>typeof x==='object'&&x.removedAt));
});
