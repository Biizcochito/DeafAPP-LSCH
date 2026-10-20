import {PHRASES} from './visibleTraining.js';

export function validSequence(features) {
  if(!Array.isArray(features)||features.length!==32)return false;
  for(const frame of features){
    if(!Array.isArray(frame)||frame.length!==171)return false;
    for(const value of frame)if(!Number.isFinite(value)||Math.abs(value)>50)return false;
    if(frame.slice(168).some(value=>value!==0&&value!==1))return false;
  }
  return true;
}

export function sequenceKey(features) {return validSequence(features)?JSON.stringify(features):null;}

// A reserved sequence can never be reintroduced as learning material under another ID.
export function trainingPhraseRows(rows) {
  rows=Array.isArray(rows)?rows.filter(row=>row&&typeof row==='object'):[];
  const reserved=new Set(rows.filter(row=>row.split==='evaluation').map(row=>sequenceKey(row.features)).filter(Boolean));
  const seen=new Map(),conflicts=new Set();
  for(const row of rows){
    if(!PHRASES.includes(row.classId)||row.wholePhrase!==true||!['train',undefined].includes(row.split)||row.variant&&row.variant!=='original')continue;
    const key=sequenceKey(row.features);if(!key||reserved.has(key))continue;
    if(seen.has(key)&&seen.get(key).classId!==row.classId)conflicts.add(key);
    else if(!seen.has(key))seen.set(key,row);
  }
  return [...seen].filter(([key])=>!conflicts.has(key)).map(([,row])=>row);
}

export function evaluationSummary(rows,modelId) {
  const tests=rows.filter(row=>row.split==='evaluation'&&row.modelId===modelId&&row.confirmed===true);
  const known=tests.filter(row=>PHRASES.includes(row.classId)),unknown=tests.filter(row=>row.classId==='unknown');
  return {samples:known.length,correct:known.filter(row=>row.prediction?.accepted&&row.prediction.classId===row.classId).length,
    unknownSamples:unknown.length,falseAccepts:unknown.filter(row=>row.prediction?.accepted).length};
}
