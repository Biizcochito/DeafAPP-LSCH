import {SEQUENCE_CANDIDATE_FORMAT,validateSequenceCandidate,prepareSequenceSearch,searchSequenceDistances,rankSequenceDistances} from './sequenceCandidate.js';
import {createCatalogueResolver} from './recognitionCatalog.js';
import {digestText} from './runtimePackage.js';

export function validHandSequence(sequence){return Array.isArray(sequence)&&sequence.length>=3&&sequence.length<=32&&sequence.every(frame=>(Array.isArray(frame)||frame instanceof Float32Array)&&frame.length===88&&frame.every(n=>Number.isFinite(n)&&Math.abs(n)<=100));}
export const reflectHandSequence=sequence=>sequence.map(frame=>frame.map((n,i)=>i%44<42&&i%2===0?-n:n));
function balanced(rows,limit=10){return rows.length<=limit?rows:Array.from({length:limit},(_,i)=>rows[Math.round(i*(rows.length-1)/(limit-1))]);}
function diverse(rows,limit=10){
  const groups=new Map();for(const row of rows){const key=row.personConfirmed&&row.person?row.person:row.origin||'unknown';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
  if(groups.size===1)return balanced(rows,limit);
  const ordered=[...groups.values()],selected=[];for(let index=0;selected.length<Math.min(limit,rows.length);index++)for(const group of ordered){if(group[index])selected.push(group[index]);if(selected.length===limit)break;}
  return selected;
}

/** @param {any[]} catalogue @param {any[]} samples
 * @param {{now?:number,sourceRevision?:string,evaluate?:boolean,allowMetadataOnly?:boolean,loadSequences?:(ids:string[])=>Promise<Map<string,any>>}} [options] */
export async function prepareControlledModel(catalogue,samples,{now=Date.now(),sourceRevision='local',evaluate=true,allowMetadataOnly=false,loadSequences}={}){
  const prepared=[],excluded=[],resolve=createCatalogueResolver(catalogue);
  for(const sample of samples){
    const classId=resolve(sample.classId);
    if(!classId||(!validHandSequence(sample.sequence)&&!(allowMetadataOnly&&sample.sequenceValid===true))||typeof sample.hash!=='string'||sample.expiresAt&&(!Number.isFinite(Date.parse(sample.expiresAt))||Date.parse(sample.expiresAt)<=now)){excluded.push(sample.id);continue;}
    prepared.push({...sample,classId,role:['validation','evaluation'].includes(sample.role)?sample.role:'train'});
  }
  const reserved=new Set(prepared.filter(row=>row.role!=='train').map(row=>row.hash));
  const reservedPeople=new Set(prepared.filter(row=>row.role!=='train'&&row.personConfirmed&&row.person).map(row=>row.person));
  const labels=new Map();for(const row of prepared){if(!labels.has(row.hash))labels.set(row.hash,new Set());labels.get(row.hash).add(row.classId);}
  const learning=prepared.filter(row=>row.role==='train'&&!reserved.has(row.hash)&&labels.get(row.hash).size===1&&!(row.personConfirmed&&reservedPeople.has(row.person)));
  const grouped=new Map();for(const row of learning){if(!grouped.has(row.classId))grouped.set(row.classId,new Map());const previous=grouped.get(row.classId).get(row.hash);if(!previous||!validHandSequence(previous.sequence)&&validHandSequence(row.sequence))grouped.get(row.classId).set(row.hash,row);}
  const byClass=new Map();for(const row of prepared){if(!byClass.has(row.classId))byClass.set(row.classId,[]);byClass.get(row.classId).push(row);}
  const coverage=catalogue.filter(row=>!row.aliasOf).map(entry=>{
    const rows=[...(grouped.get(entry.classId)?.values()||[])],all=byClass.get(entry.classId)||[],tests=all.filter(row=>row.role==='evaluation');
    const people=new Set(rows.filter(row=>row.personConfirmed&&row.person).map(row=>row.person));
    return {classId:entry.classId,originals:rows.length,minimum:entry.minimum,recordingGoal:entry.recordingGoal,peopleGoal:entry.peopleGoal,confirmedPeople:people.size,
      unknownPeople:rows.filter(row=>!row.personConfirmed||!row.person).length,heldOut:tests.length,ready:rows.length>=entry.minimum,
      active:entry.state==='enabled'&&rows.length>=entry.minimum,state:entry.state,activationScope:entry.activationScope,
      evaluation:{samples:0,correct:0,predicted:0,recall:null,precision:null,scope:'pending',people:new Set(tests.filter(row=>row.personConfirmed&&row.person).map(row=>row.person)).size}};
  });
  const enabled=coverage.filter(row=>row.active).map(row=>row.classId),classes=[...grouped.keys()];
  const selected=classes.flatMap(classId=>diverse([...grouped.get(classId).values()]));
  const loaded=loadSequences?await loadSequences(selected.map(row=>row.id)):null;
  const references=selected.map(row=>{const sequence=loaded?.get(row.id)||row.sequence;if(!validHandSequence(sequence))throw Error('Faltan referencias preparadas. Actualiza el modelo.');
    return {classId:row.classId,parentHash:row.hash,recordingId:row.id,sequence:sequence.map(frame=>frame instanceof Float32Array?frame:Float32Array.from(frame))};});
  if(classes.length<2||enabled.length<2)return {model:null,coverage,excluded,sourceRevision};
  const id=(await digestText(JSON.stringify({sourceRevision,enabled,references:references.map(row=>[row.classId,row.parentHash])}))).slice(0,32);
  const model=validateSequenceCandidate({format:SEQUENCE_CANDIDATE_FORMAT,version:1,id,inputShape:[32,171],classes,references,enabledClasses:enabled,
    decision:{maximumDistance:.35,minimumRelativeMargin:.25},report:{source:'controlled-approved-library',accuracy:null,publicActivation:true,prototype:true}});
  const testClasses=coverage.filter(row=>row.ready).map(row=>row.classId);
  const evaluationModel={...model,enabledClasses:testClasses},index=evaluate?prepareSequenceSearch(evaluationModel):null,metrics=new Map(coverage.map(row=>[row.classId,row.evaluation]));
  const seenTests=new Set(),evaluationPlan=prepared.filter(row=>{if(row.role!=='evaluation'||seenTests.has(row.hash)||labels.get(row.hash).size!==1)return false;seenTests.add(row.hash);return true;});
  if(evaluate)for(const row of evaluationPlan){
    const metric=metrics.get(row.classId);if(!metric||!testClasses.includes(row.classId))continue;
    const prediction=rankSequenceDistances(evaluationModel,searchSequenceDistances(evaluationModel,row.sequence,reflectHandSequence(row.sequence),index));
    metric.samples++;if(prediction.accepted){const guessed=metrics.get(prediction.classId);if(guessed)guessed.predicted++;if(prediction.classId===row.classId)metric.correct++;}
  }
  const allLearning=[...grouped.values()].flatMap(map=>[...map.values()]);
  const knownTraining=allLearning.every(row=>row.personConfirmed&&row.person);
  const knownTests=evaluationPlan.every(row=>row.personConfirmed&&row.person);
  for(const row of coverage){const metric=row.evaluation;metric.expectedScope=knownTraining&&knownTests?'different-confirmed-people':'different-recordings';if(!metric.samples)continue;metric.recall=metric.correct/metric.samples;metric.precision=metric.predicted?metric.correct/metric.predicted:0;
    metric.scope=knownTraining&&knownTests?'different-confirmed-people':'different-recordings';}
  const usedHashes=new Set(references.map(row=>row.parentHash));
  const expiries=learning.filter(row=>usedHashes.has(row.hash)&&row.expiresAt).map(row=>Date.parse(row.expiresAt)).filter(Number.isFinite);
  return {model,coverage,excluded,sourceRevision,evaluationPlan:evaluationPlan.map(row=>({id:row.id,classId:row.classId})),evaluationEnabledClasses:testClasses,expiresAt:expiries.length?new Date(Math.min(...expiries)).toISOString():null};
}
