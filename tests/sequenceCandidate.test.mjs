import test from 'node:test';
import assert from 'node:assert/strict';
import {handSequence,sequenceDistance,sequenceReferences,predictSequenceCandidate,validateSequenceCandidate,SEQUENCE_CANDIDATE_FORMAT,createPersonalSignCandidate} from '../training/sequenceCandidate.js';
import {validateForest,predictForest} from '../training/visibleTraining.js';
// Geometry fixtures exercise contracts only. They are not LSCh examples or an accuracy measurement.
const features=seed=>Array.from({length:32},(_,t)=>[...Array.from({length:84},(_,k)=>k%2?.4+Math.sin(t/8)*.1:(k%42)*.02+seed),...Array(84).fill(0),1,1,1]);
const row=(id,classId,seed)=>({parentHash:id,recordingId:id,classId,split:'train',variant:'original',features:features(seed)});
const source=[row('a','saludos/hola',.2),row('b','necesidades/agua',2)];
const model=()=>validateSequenceCandidate({format:SEQUENCE_CANDIDATE_FORMAT,version:1,inputShape:[32,171],classes:source.map(r=>r.classId),references:sequenceReferences(source),decision:{maximumDistance:.35,minimumRelativeMargin:.25}});
test('matches movements with time variation and excludes face identity from the descriptor',()=>{
 const sample=features(.2),changed=sample.map(frame=>frame.map((v,i)=>i>=84&&i<168?5:v));assert.deepEqual(handSequence(sample),handSequence(changed));
 const sequence=handSequence(sample);assert.ok(sequenceDistance(sequence,[...sequence.slice(0,8),...sequence.slice(4)])<.01);assert.equal(predictSequenceCandidate(model(),sample).classId,'saludos/hola');
});
test('references reject augmented, reserved, duplicate and conflicting originals',()=>{
 const a=source[0],copy={...a,recordingId:'copy'};assert.equal(sequenceReferences([a,copy,{...source[1],variant:'rotation'}]).length,1);
 assert.equal(sequenceReferences([a,{...a,split:'evaluation',features:features(.25)}]).length,0);
 assert.equal(sequenceReferences([a,{...a,parentHash:'evaluation-copy',split:'evaluation'}]).length,0);
 assert.equal(sequenceReferences([a,{...a,classId:'saludos/bien'}]).length,0);
 assert.equal(sequenceReferences(source,{reservedHashes:['a']}).length,1);
});
test('does not turn a remote or ambiguous match into a recognition',()=>{
 assert.equal(predictSequenceCandidate(model(),features(10)).accepted,false);
 const m=model();m.references.push({...m.references[0],classId:m.classes[1]});const result=predictSequenceCandidate(m,features(.2));assert.equal(result.accepted,false);assert.equal(result.classId,null);assert.equal(result.reason,'ambiguous');
 const empty=features(.2).map(frame=>frame.map((v,i)=>i>=168?0:v));assert.equal(predictSequenceCandidate(m,empty).reason,'no-active-hands');
});
test('validates the private payload and shares the inference entry point with existing forests',()=>{
 const m=model();assert.equal(validateForest(m),m);assert.equal(predictForest(m,features(.2)).classId,'saludos/hola');
 assert.throws(()=>validateSequenceCandidate({...m,decision:{maximumDistance:Infinity,minimumRelativeMargin:0}}));assert.throws(()=>validateSequenceCandidate({...m,references:[{...m.references[0],sequence:[[NaN]]}]}));
 assert.throws(()=>predictSequenceCandidate(m,[[0]]));
});

test('a resting second hand does not prevent recognition when only the signing hand is visible',()=>{
 const withRest=features(.2).map(frame=>frame.map((value,i)=>i>=42&&i<84&&i%2===1?value+4:value));
 const single=withRest.map(frame=>frame.map((value,i)=>i>=42&&i<84||i===169?0:value));
 assert.deepEqual(handSequence(withRest),handSequence(single));
});

test('personal adaptation needs separate originals per sign and never learns from a held-out copy',async()=>{
 const rows=['saludos/hola','necesidades/agua'].flatMap((classId,c)=>[0,1,2].map(i=>({...row(`${c}-${i}`,classId,c*2+i*.01),id:`${c}-${i}`,wholePhrase:false})));
 const trained=await createPersonalSignCandidate(rows,source.map(r=>r.classId));assert.equal(trained.references.length,6);assert.equal(trained.report.accuracy,null);assert.equal(predictSequenceCandidate(trained,features(.005)).classId,'saludos/hola');
 await assert.rejects(()=>createPersonalSignCandidate([...rows,{...rows[0],id:'reserved',classId:'unknown',wholePhrase:true,split:'evaluation'}],source.map(r=>r.classId)),/tres tomas/);
});

test('a nearer unenabled class is rejected instead of forcing hola or agua',()=>{
 const m=model();m.classes.push('saludos/bien');m.references.push({...m.references[0],classId:'saludos/bien',sequence:handSequence(features(4))});m.enabledClasses=['saludos/hola','necesidades/agua'];
 const result=predictSequenceCandidate(m,features(4));assert.equal(result.accepted,false);assert.equal(result.classId,null);assert.equal(result.reason,'unsupported-sign');
});
