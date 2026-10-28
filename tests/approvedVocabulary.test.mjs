import test from 'node:test';
import assert from 'node:assert/strict';
import {createTrainingCapture,captureTrackingSample} from '../src/recording/trainingCapture.js';
import {approvedRecordingFeatures,loadApprovedVocabulary} from '../src/training/approvedVocabulary.js';
import {buildVocabularyCandidate} from '../src/training/vocabularyCandidate.js';
import {VISIBLE_TARGETS} from '../src/training/trainingAssistant.js';
import {predictSequenceCandidate,handSequence,SEQUENCE_CANDIDATE_FORMAT} from '../src/training/sequenceCandidate.js';

// Synthetic movement verifies data flow, not recognition accuracy for LSCh.
function fixture(id='1',classId='saludos/hola',seed=0,{duration=3000,handAge=300,faceAge=500}={}){
  const [category,label]=classId.split('/');
  const samples=Array.from({length:32},(_,i)=>{
    const now=1000+i*duration/31,face=Array.from({length:468},()=>({x:.5,y:.35,z:0}));
    face[234]={x:.4,y:.35,z:0};face[454]={x:.6,y:.35,z:0};
    const hand=Array.from({length:21},(_,p)=>({x:.2+seed*.005+i*.003+p*.002,y:.4+p*.002,z:0}));
    return captureTrackingSample({enabled:true,handTime:now-handAge,faceTime:now-faceAge,leftHandLandmarks:hand,faceLandmarks:face,sourceWidth:640,sourceHeight:480},now,1000);
  });
  return {row:{id,status:'approved',version:1,path:`${category}/${label}/${id}.json`,category,label},
    recording:{language:'csg',categoria:category,label,timestamp:Date.now(),frames:Array(32).fill('/9j/AAAA=='),
      training:createTrainingCapture({participantId:'browser-a',participantIdentity:'anonymous-local-source',sessionId:id,samples,platform:'web',frameSize:{width:640,height:480},jpegQuality:.15})}};
}
function backend(fixtures,{pending=[],cacheRows=[]}={}){
  let saved=cacheRows,downloads=0;const calls=[];
  return {api:{list:async(_session,{status,page})=>{calls.push({status,page});const rows=status==='approved'?fixtures.map(v=>v.row):pending;return {rows:rows.slice(page*25,page*25+25),total:rows.length,counts:{pending:pending.length}};}},
    client:{storage:{from:bucket=>{assert.equal(bucket,'contribuciones');return {download:async path=>{downloads++;return {data:new Blob([JSON.stringify(fixtures.find(v=>v.row.path===path).recording)])};}};}}},
    cache:async(action,value)=>action==='get'?saved:(saved=value),get saved(){return saved;},get downloads(){return downloads;},calls};
}

test('approved app recordings become private features with the same freshness limits as the camera',()=>{
  const {row,recording}=fixture();const result=approvedRecordingFeatures(row,recording,VISIBLE_TARGETS);
  assert.equal(result.sourceReview,'approved');assert.equal(result.participantVerified,false);assert.equal(result.features.length,32);
  assert.equal(result.features[0][168],1);assert.equal(result.features[0][169],0);assert.equal(result.wholePhrase,false);assert.equal('frames' in result,false);
  for(const mutate of [r=>{r.training.samples.forEach(s=>{s.handAgeMs=400;});},r=>{r.training.samples.forEach(s=>{s.faceAgeMs=700;});},r=>{r.training.samples.forEach(s=>{s.handResultAtMs=-10;});},r=>{delete r.training;},r=>{r.language='asl';},r=>{r.retention={expiresAt:'2000-01-01'};}]){
    const bad=structuredClone(recording);mutate(bad);assert.throws(()=>approvedRecordingFeatures(row,bad,VISIBLE_TARGETS));
  }
  assert.throws(()=>approvedRecordingFeatures({...row,status:'pending'},recording,VISIBLE_TARGETS));
  assert.throws(()=>approvedRecordingFeatures({...row,label:'gracias'},recording,VISIBLE_TARGETS));
});

test('whole phrases need a full take, preserve duration and canonicalize estoy bien',()=>{
  const full=fixture('phrase','oraciones/yo bien',0,{duration:9000});
  const result=approvedRecordingFeatures(full.row,full.recording,VISIBLE_TARGETS);
  assert.equal(result.classId,'oraciones/estoy bien');assert.equal(result.wholePhrase,true);assert.equal(result.durationMs,9000);
  const short=fixture('short','oraciones/quiero agua',0,{duration:1200});
  assert.throws(()=>approvedRecordingFeatures(short.row,short.recording,VISIBLE_TARGETS),/completo/);
});

test('the library paginates approved files, reports pending files and caches features across reloads',async()=>{
  const fixtures=Array.from({length:27},(_,i)=>fixture(String(i),'saludos/hola',i)),pending=[{...fixtures[0].row,id:'pending',status:'pending'}];
  const b=backend(fixtures,{pending});const options={...b,targets:VISIBLE_TARGETS};
  let result=await loadApprovedVocabulary(options);
  assert.equal(result.rows.length,27);assert.equal(result.pending.length,1);assert.equal(b.downloads,27);
  assert.deepEqual(b.calls.slice(0,3),[{status:'approved',page:0},{status:'approved',page:1},{status:'pending',page:0}]);
  assert.ok(b.saved.every(row=>!row.frames&&!row.training));
  result=await loadApprovedVocabulary(options);assert.equal(result.rows.length,27);assert.equal(b.downloads,27);
  fixtures[0].row.version++;await loadApprovedVocabulary(options);assert.equal(b.downloads,28);
  fixtures.shift();result=await loadApprovedVocabulary(options);assert.equal(result.rows.length,26);assert.equal(b.saved.length,26);
  assert.equal(b.saved.some(row=>row.sourceId==='0'),false);
});

test('old recordings, unavailable storage and aborts do not fabricate trained examples',async()=>{
  const old=fixture();delete old.recording.training;const b=backend([old]);
  const result=await loadApprovedVocabulary({...b,targets:VISIBLE_TARGETS});assert.equal(result.rows.length,0);assert.equal(result.excluded[0].reason,'missing-tracking');
  const controller=new AbortController();controller.abort();await assert.rejects(()=>loadApprovedVocabulary({...b,targets:VISIBLE_TARGETS,signal:controller.signal}),{name:'AbortError'});
  const unavailable=backend([fixture()]);unavailable.client.storage.from=()=>({download:async()=>({error:Error('offline')})});
  assert.equal((await loadApprovedVocabulary({...unavailable,targets:VISIBLE_TARGETS})).excluded[0].reason,'download-failed');
});

test('an approval withdrawn during download is removed before training or caching',async()=>{
 const fixtures=[fixture()],b=backend(fixtures),from=b.client.storage.from;
 b.client.storage.from=bucket=>{const storage=from(bucket);return {download:async path=>{const value=await storage.download(path);fixtures.pop();return value;}};};
 const result=await loadApprovedVocabulary({...b,targets:VISIBLE_TARGETS});
 assert.equal(result.rows.length,0);assert.equal(b.saved.length,0);assert.equal(result.excluded[0].reason,'approval-changed');
});

const geometry=seed=>Array.from({length:32},(_,i)=>[...Array.from({length:84},(_,k)=>k%2?.3+Math.sin(i/4)*.12:(k%42)*.02+seed),...Array(84).fill(0),1,1,1]);
const capture=(classId,seed,id=String(seed))=>({id,classId,features:geometry(seed),wholePhrase:classId.startsWith('oraciones/'),split:'train'});

test('all visible words and full phrases enter the same live candidate and survive reconstruction',async()=>{
  const rows=VISIBLE_TARGETS.flatMap((target,c)=>Array.from({length:7},(_,i)=>capture(target.classId,c*.8+i*.001)));
  const first=await buildVocabularyCandidate(rows,VISIBLE_TARGETS),reload=await buildVocabularyCandidate(JSON.parse(JSON.stringify(rows)),VISIBLE_TARGETS);
  assert.equal(first.candidate.id,reload.candidate.id);assert.equal(first.candidate.enabledClasses.length,VISIBLE_TARGETS.length);
  assert.equal(first.report.wholePhrases.length,4);assert.ok(first.candidate.references.length<=200);assert.ok(first.coverage.every(row=>row.active&&row.count===7));
  for(const [i,target] of VISIBLE_TARGETS.entries())assert.equal(predictSequenceCandidate(first.candidate,geometry(i*.8+.002)).classId,target.classId);
  assert.equal(first.report.accuracy,null);
});

test('copies, conflicting labels, artificial variants and reserved parent recordings never add coverage',async()=>{
  const a=VISIBLE_TARGETS[0].classId,b=VISIBLE_TARGETS[1].classId;
  const rows=[capture(a,0),capture(a,.01),capture(a,.02),capture(b,2),capture(b,2.01),capture(b,2.02)];
  const base=await buildVocabularyCandidate(rows,VISIBLE_TARGETS);assert.equal(base.report.classes.length,2);
  for(const extra of [{...rows[0],id:'reserved',split:'evaluation',classId:'unknown'},
    {...rows[0],id:'conflicting',classId:b},
    {...rows[0],id:'same-parent',features:geometry(.003),parentHash:'held-out',split:'evaluation'}]){
    const input=structuredClone(rows);if(extra.parentHash)input[0].parentHash='held-out';
    const result=await buildVocabularyCandidate([...input,extra],VISIBLE_TARGETS);assert.equal(result.report,null);assert.equal(result.coverage.find(row=>row.classId===a).active,false);
  }
  const few=await buildVocabularyCandidate([...rows.slice(0,2),{...rows[2],variant:'rotation'},...rows.slice(3)],VISIBLE_TARGETS);
  assert.equal(few.coverage.find(row=>row.classId===a).count,2);assert.equal(few.coverage.some(row=>row.active),false);
});

test('new classes extend enabled base classes while keeping unsupported negative references disabled',async()=>{
  const ids=['saludos/hola','necesidades/agua','saludos/bien'],base={format:SEQUENCE_CANDIDATE_FORMAT,version:1,id:'base',inputShape:[32,171],classes:ids,
    enabledClasses:ids.slice(0,2),references:ids.map((classId,i)=>({classId,parentHash:`base-${i}`,sequence:handSequence(geometry(i*2))})),decision:{maximumDistance:.35,minimumRelativeMargin:.25}};
  const rows=[0,1,2].map(i=>capture('oraciones/quiero agua',6+i*.001));const result=await buildVocabularyCandidate(rows,VISIBLE_TARGETS,{baseModel:base});
  assert.ok(result.candidate.enabledClasses.includes('oraciones/quiero agua'));assert.equal(result.candidate.enabledClasses.includes('saludos/bien'),false);
  assert.equal(predictSequenceCandidate(result.candidate,geometry(4)).reason,'unsupported-sign');
  assert.equal(predictSequenceCandidate(result.candidate,geometry(6.001)).classId,'oraciones/quiero agua');
  const cancelled=await buildVocabularyCandidate(rows,VISIBLE_TARGETS,{cancelled:()=>true});assert.equal(cancelled,null);
  const incomplete=await buildVocabularyCandidate([...rows,capture('verbos/comer',9)],VISIBLE_TARGETS,{baseModel:base});
  assert.equal(predictSequenceCandidate(incomplete.candidate,geometry(9)).reason,'unsupported-sign');
  const negativeOnly=await buildVocabularyCandidate([capture('verbos/comer',9)],VISIBLE_TARGETS,{baseModel:base});
  assert.equal(predictSequenceCandidate(negativeOnly.candidate,geometry(9)).reason,'unsupported-sign');
});

test('a whole phrase requires its ordered trajectory rather than a prefix or reversed movement',async()=>{
 const phrase='oraciones/necesito ayuda',other='saludos/hola';
 const trajectory=offset=>geometry(0).map((frame,i)=>frame.map((value,k)=>k<84&&k%2===0?value+offset+i*.15:value));
 const rows=[0,.001,.002].flatMap((offset,i)=>[{...capture(phrase,0,`p-${i}`),features:trajectory(offset)},capture(other,9+offset,`w-${i}`)]);
 const {candidate}=await buildVocabularyCandidate(rows,VISIBLE_TARGETS);
 const full=trajectory(.0015),prefix=Array.from({length:32},(_,i)=>full[Math.floor(i*10/31)]);
 assert.equal(predictSequenceCandidate(candidate,full).classId,phrase);
 assert.equal(predictSequenceCandidate(candidate,prefix).accepted,false);
 assert.equal(predictSequenceCandidate(candidate,[...full].reverse()).accepted,false);
});
