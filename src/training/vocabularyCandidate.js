import {validSequence,sequenceKey} from './sequenceData.js';
import {canonicalPhraseRow} from './phraseLabels.js';
import {sequenceReferences,validateSequenceCandidate,SEQUENCE_CANDIDATE_FORMAT} from './sequenceCandidate.js';

const MINIMUM_ORIGINALS=3,MAX_REFERENCES_PER_CLASS=5;
async function hash(value){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(bytes),value=>value.toString(16).padStart(2,'0')).join('');}
function balancedReferences(rows){
  if(rows.length<=MAX_REFERENCES_PER_CLASS)return rows;
  return Array.from({length:MAX_REFERENCES_PER_CLASS},(_,index)=>rows[Math.round(index*(rows.length-1)/(MAX_REFERENCES_PER_CLASS-1))]);
}

export async function buildVocabularyCandidate(rows,targets,{baseModel=null,cancelled=()=>false}={}) {
  const allowed=new Set(targets.map(target=>target.classId)),prepared=[];
  for(const input of rows){
    if(cancelled())return null;
    const row=canonicalPhraseRow(input);
    if(!row||!validSequence(row.features))continue;
    // Evaluation copies must remain excluded even under another label or ID.
    if(row.split!=='evaluation'&&(!allowed.has(row.classId)||row.wholePhrase!==row.classId.startsWith('oraciones/')||row.variant&&row.variant!=='original'))continue;
    const parentHash=row.parentHash||await hash(sequenceKey(row.features));
    prepared.push({...row,parentHash,recordingId:row.id,split:row.split||'train',variant:row.variant||'original'});
  }
  const references=sequenceReferences(prepared),ready=targets.filter(target=>references.filter(row=>row.classId===target.classId).length>=MINIMUM_ORIGINALS).map(target=>target.classId);
  const base=baseModel?.format===SEQUENCE_CANDIDATE_FORMAT?baseModel:null;
  const baseEnabled=(base?.enabledClasses||base?.classes||[]).filter(id=>allowed.has(id));
  const enabledClasses=[...new Set([...baseEnabled,...ready])];
  const local=new Map(ready.map(id=>[id,references.filter(row=>row.classId===id)]));
  const byClass=new Map();
  for(const reference of base?.references||[]){if(!allowed.has(reference.classId)||local.has(reference.classId))continue;if(!byClass.has(reference.classId))byClass.set(reference.classId,[]);byClass.get(reference.classId).push(reference);}
  for(const [classId,values] of local)byClass.set(classId,values);
  // Even an incomplete new class can reject a lookalike; it cannot emit its
  // label until it has enough distinct originals.
  for(const reference of references){if(!byClass.has(reference.classId))byClass.set(reference.classId,references.filter(row=>row.classId===reference.classId));}
  const selected=[...byClass.values()].flatMap(balancedReferences),classes=[...byClass.keys()];
  const coverage=targets.map(target=>({...target,count:references.filter(row=>row.classId===target.classId).length,minimum:MINIMUM_ORIGINALS,
    ready:ready.includes(target.classId),active:enabledClasses.includes(target.classId)}));
  const extended=ready.length>0||references.some(row=>!base?.classes.includes(row.classId));
  if(!extended||classes.length<2||enabledClasses.length<2)return {candidate:baseModel,coverage:coverage.map(row=>({...row,active:(baseModel?.enabledClasses||baseModel?.classes||[]).includes(row.classId)})),report:null};
  const originals=references.length;
  const id=(await hash(JSON.stringify({base:base?.id||null,enabledClasses,references:selected.map(row=>[row.classId,row.parentHash])}))).slice(0,32);
  if(cancelled())return null;
  const report={classes:enabledClasses,originals,references:selected.length,accuracy:null,evaluationSamples:0,publicActivation:false,
    wholePhrases:ready.filter(id=>id.startsWith('oraciones/')),source:'approved-and-local-captures'};
  const candidate=validateSequenceCandidate({format:SEQUENCE_CANDIDATE_FORMAT,version:1,id,inputShape:[32,171],classes,references:selected,
    enabledClasses,decision:{maximumDistance:.35,minimumRelativeMargin:.25},report});
  return {candidate,coverage,report};
}
