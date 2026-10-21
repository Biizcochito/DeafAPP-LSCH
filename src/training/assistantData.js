import {canonicalPhraseRow,canonicalPhraseClassId} from './phraseLabels.js';
import {PHRASES} from './visibleTraining.js';

import {validSequence,sequenceKey} from './sequenceData.js';
export {validSequence,sequenceKey} from './sequenceData.js';

// A reserved sequence can never be reintroduced as learning material under another ID.
export function trainingPhraseRows(rows) {
  rows=Array.isArray(rows)?rows.filter(row=>row&&typeof row==='object').map(canonicalPhraseRow):[];
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
  const tests=rows.filter(row=>row.split==='evaluation'&&row.modelId===modelId&&row.confirmed===true).map(row=>({...row,classId:canonicalPhraseClassId(row.classId),prediction:row.prediction?{...row.prediction,classId:canonicalPhraseClassId(row.prediction.classId)}:row.prediction}));
  const known=tests.filter(row=>PHRASES.includes(row.classId)),unknown=tests.filter(row=>row.classId==='unknown');
  return {samples:known.length,correct:known.filter(row=>row.prediction?.accepted&&row.prediction.classId===row.classId).length,
    unknownSamples:unknown.length,falseAccepts:unknown.filter(row=>row.prediction?.accepted).length};
}
