import { TARGET_SIGNS, FEATURE_LAYOUT } from './datasetPreparation.js';
import { LEGACY_FEATURE_LAYOUT } from './legacyRecovery.js';
const classes = new Set(TARGET_SIGNS.map(s=>s.classId));
export const TRAINING_MINIMUMS = Object.freeze({trainOriginals:5,evaluationOriginals:2,minClasses:2,maxClassesPerGroup:12});
export const PROTOTYPE_MINIMUMS = Object.freeze({trainOriginals:1,evaluationOriginals:1,minClasses:2,maxClassesPerGroup:3});
const variants = new Set(['original','time-warp-0.85','time-warp-1.15','camera-tilt--3','camera-tilt-3']);
const key = s => s.parentHash;
export function assertPreparedDataset(dataset) {
  const personal = dataset?.mode === 'personal-prototype';
  if (!dataset || dataset.mode != null && !personal || JSON.stringify(dataset.featureLayout)!==JSON.stringify(personal ? LEGACY_FEATURE_LAYOUT : FEATURE_LAYOUT) || !Array.isArray(dataset.train) || !Array.isArray(dataset.evaluation) ||
    dataset.train.length>15000 || dataset.evaluation.length>5000) throw new Error('El conjunto no tiene el formato de preparación de DeafApp.');
  const all=[...dataset.train,...dataset.evaluation];
  for(const sample of all) {
    if(!classes.has(sample.classId)||typeof sample.participantId!=='string'||!sample.participantId||!sample.recordingId||!/^[a-f0-9]{64}$/.test(sample.parentHash)||
      !variants.has(sample.variant)||!Array.isArray(sample.features)||sample.features.length!==32||sample.features.some(v=>!Array.isArray(v)||v.length!==171||v.some(n=>!Number.isFinite(n)||Math.abs(n)>50)||![v[168],v[169],v[170]].every(n=>n===0||n===1)||v[170]!==1))
      throw new Error('Hay muestras con etiquetas, participantes o puntos no válidos.');
  }
  if(dataset.train.some(s=>s.split!=='train')||dataset.evaluation.some(s=>s.split!=='evaluation'||s.variant!=='original')) throw new Error('Las muestras de prueba deben ser originales y estar separadas.');
  const trainPeople=new Set(dataset.train.map(s=>s.participantId)), trainParents=new Set(dataset.train.map(key));
  if(dataset.evaluation.some(s=>(!personal && trainPeople.has(s.participantId))||trainParents.has(key(s)))) throw new Error('Una persona o grabación aparece en aprendizaje y prueba. Hay que separar de nuevo los datos.');
  const originals=new Map();
  for(const sample of dataset.train.filter(s=>s.variant==='original')) {
    if(originals.has(key(sample)))throw new Error('Una grabación original está duplicada.');originals.set(key(sample),sample);
  }
  const seen=new Set();
  for(const sample of dataset.train) {
    const original=originals.get(key(sample));
    const identity=`${key(sample)}/${sample.variant}`;
    if(!original||original.classId!==sample.classId||original.participantId!==sample.participantId||original.recordingId!==sample.recordingId||seen.has(identity))throw new Error('Una variación no coincide con su grabación original.');
    seen.add(identity);
  }
  if(new Set(dataset.evaluation.map(key)).size!==dataset.evaluation.length)throw new Error('La prueba tiene grabaciones duplicadas.');
  return dataset;
}

export function createTrainingPlan(dataset,{approvedCounts={}}={}) {
  assertPreparedDataset(dataset);
  const minimums = dataset.mode === 'personal-prototype' ? PROTOTYPE_MINIMUMS : TRAINING_MINIMUMS;
  const excluded=new Map();
  for(const item of dataset.quarantine||[]) {if(!excluded.has(item.classId))excluded.set(item.classId,new Set());for(const reason of item.reasons||[])excluded.get(item.classId).add(reason);}
  const rows=TARGET_SIGNS.map(sign=>{
    const train=dataset.train.filter(s=>s.classId===sign.classId&&s.variant==='original'), evaluation=dataset.evaluation.filter(s=>s.classId===sign.classId);
    const all=new Set([...train,...evaluation].map(key));
    const approved=approvedCounts[sign.classId]??all.size;
    const ready=train.length>=minimums.trainOriginals&&evaluation.length>=minimums.evaluationOriginals;
    const state=ready?'ready':all.size?'needs-samples':approved?'needs-preparation':'needs-material';
    return {...sign,approvedRecordings:approved,usableRecordings:all.size,trainOriginals:train.length,evaluationOriginals:evaluation.length,
      declaredParticipants:new Set([...train,...evaluation].map(s=>s.participantId)).size,
      missingTrain:Math.max(0,minimums.trainOriginals-train.length),missingEvaluation:Math.max(0,minimums.evaluationOriginals-evaluation.length),state,reasons:[...(excluded.get(sign.classId)||[])]};
  }).sort((a,b)=>Number(b.state==='ready')-Number(a.state==='ready')||b.usableRecordings-a.usableRecordings||b.approvedRecordings-a.approvedRecordings||a.classId.localeCompare(b.classId));
  return {version:1,createdAt:new Date().toISOString(),mode:dataset.mode || 'independent-evaluation',minimums,rows,
    readyClasses:rows.filter(r=>r.state==='ready').map(r=>r.classId),totalClasses:rows.length,
    approvedRecordings:Object.values(approvedCounts).reduce((sum,n)=>sum+n,0),usableRecordings:dataset.report?.acceptedRecordings??dataset.train.filter(s=>s.variant==='original').length+dataset.evaluation.length,
    trainingAvailable:rows.filter(r=>r.state==='ready').length>=minimums.minClasses,publicRecognitionReady:false};
}

export function selectTrainingGroup(dataset,classIds) {
  const plan=createTrainingPlan(dataset);
  const selected=classIds||plan.readyClasses.slice(0,plan.minimums.maxClassesPerGroup);
  if(!Array.isArray(selected)||new Set(selected).size!==selected.length||selected.length<2||selected.length>plan.minimums.maxClassesPerGroup||selected.some(id=>!plan.readyClasses.includes(id)))
    throw new Error(plan.mode === 'personal-prototype' ? 'El prototipo necesita 2 o 3 señas con al menos dos grabaciones originales distintas por seña.' : 'Se necesitan entre 2 y 12 señas con al menos 5 grabaciones originales de aprendizaje y 2 de prueba por seña, hechas por personas separadas.');
  const set=new Set(selected), train=dataset.train.filter(s=>set.has(s.classId)), evaluation=dataset.evaluation.filter(s=>set.has(s.classId));
  if(train.length>2500||evaluation.length>1000)throw new Error('Este grupo es demasiado grande para el navegador. Prepara un grupo menor.');
  return {classes:[...selected].sort(),train,evaluation,plan};
}
