// Read-only production package check. Public configuration is read locally and
// never printed. These timing checks do not measure linguistic accuracy.
import fs from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {decodeRuntimePackage} from '../src/training/runtimePackage.js';
import {searchSequenceDistances,rankSequenceDistances,prepareSequenceSearch} from '../src/training/sequenceCandidate.js';
import {reflectHandSequence} from '../src/training/controlledModel.js';
const source=fs.readFileSync('App.js','utf8');
const config=name=>source.match(new RegExp(`const ${name}\\s*=\\s*["']([^"']+)["']`))?.[1];
const requests=[];
const client=createClient(config('SUPABASE_URL'),config('SUPABASE_KEY'),{auth:{persistSession:false},global:{fetch:(input,init)=>{requests.push(new URL(typeof input==='string'?input:input.url).pathname);return fetch(input,init);}}});
async function rpc(name,args={}){const {data,error}=await client.rpc(name,args);if(error||!data?.ok)throw Error(`RPC failed: ${name}`);return data;}
const started=performance.now(),manifest=await rpc('deafapp_recognition_manifest'),response=await rpc('deafapp_recognition_model',{p_revision:manifest.revision}),received=performance.now();
const model=await decodeRuntimePackage(response.packet);if(model.id!==manifest.modelId)throw Error('Model revision mismatch');
const decoded=performance.now(),index=prepareSequenceSearch(model),timings=[];
for(const row of model.references.filter((row,index)=>index%15===0)){const begin=performance.now();rankSequenceDistances(model,searchSequenceDistances(model,row.sequence,reflectHandSequence(row.sequence),index));timings.push(performance.now()-begin);}
timings.sort((a,b)=>a-b);
const result={revision:manifest.revision,classes:model.classes.length,enabled:model.enabledClasses.length,references:model.references.length,compressedBytes:response.packet.compressedBytes,
  expandedBytes:response.packet.expandedBytes,fetchMs:Math.round(received-started),decodeMs:Math.round(decoded-received),referenceTimingMs:{median:Math.round(timings[Math.floor(timings.length/2)]),max:Math.round(timings.at(-1))},
  originalDownloads:requests.filter(path=>path.includes('/storage/')).length,requests:requests.length,accuracyMeasured:false};
if(result.originalDownloads)throw Error('Original downloads are forbidden in this check');console.log(JSON.stringify(result,null,2));
fs.writeFileSync('artifacts/prepared-recognition-production-check.json',JSON.stringify(result,null,2)+'\n');
