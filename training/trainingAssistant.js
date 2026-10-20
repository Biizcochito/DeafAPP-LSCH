import {CATEGORIAS_VISIBLES} from '../signCatalog.js';
import {PHRASES,predictForest,decodeCandidate} from './visibleTraining.js';
import {sequenceKey,trainingPhraseRows,evaluationSummary,validSequence} from './assistantData.js';

export const VISIBLE_TARGETS=CATEGORIAS_VISIBLES.flatMap(category=>category.señas.map(label=>({classId:`${category.id}/${label}`,category:category.id,label})));
const allowed=new Set(VISIBLE_TARGETS.map(row=>row.classId));
const support=['verbos/querer','verbos/necesitar','necesidades/ayuda','necesidades/agua','verbos/comer'];
const count=value=>Number.isInteger(value)&&value>=0?value:0;
const name=id=>id.split('/').at(-1);

export function captureQuality(frames) {
  const all=Array.isArray(frames)?frames:[],total=all.length;
  const face=all.filter(frame=>frame.vector?.[170]===1).length;
  const usable=all.filter(frame=>frame.vector?.[170]===1&&(frame.vector[168]===1||frame.vector[169]===1)).length;
  const single=all.filter(frame=>frame.vector?.[170]===1&&frame.vector[168]+frame.vector[169]===1).length;
  return {frames:total,tracked:usable,trackingPercent:total?Math.round(100*usable/total):0,facePercent:total?Math.round(100*face/total):0,singleHandFrames:single};
}

export function buildTrainingPlan({progress,rows=[],goal='phrases',personal=null,quality=[]}) {
  const learning=trainingPhraseRows(rows),counts=PHRASES.map(classId=>({classId,count:learning.filter(row=>row.classId===classId).length}));
  const pending=counts.filter(row=>row.count<3).sort((a,b)=>a.count-b.count||PHRASES.indexOf(a.classId)-PHRASES.indexOf(b.classId));
  const snapshot=new Map((progress?.targets||[]).filter(row=>allowed.has(row.classId)).map(row=>[row.classId,count(row.originals)]));
  const local=new Map(),seen=new Set();
  for(const row of rows){const key=sequenceKey(row.features);if(!key||seen.has(key)||!allowed.has(row.classId)||row.wholePhrase||row.split!=='train')continue;seen.add(key);local.set(row.classId,(local.get(row.classId)||0)+1);}
  const catalog=VISIBLE_TARGETS.filter(row=>row.category!=='oraciones').map(row=>({...row,snapshot:snapshot.get(row.classId)||0,local:local.get(row.classId)||0})).sort((a,b)=>{
    const missingA=Number(a.snapshot+a.local===0),missingB=Number(b.snapshot+b.local===0);
    return missingB-missingA||(a.snapshot+a.local)-(b.snapshot+b.local)||(support.includes(a.classId)?support.indexOf(a.classId):100)-(support.includes(b.classId)?support.indexOf(b.classId):100)||a.local-b.local||a.classId.localeCompare(b.classId);
  });
  const reviews=rows.filter(row=>allowed.has(row.classId)&&Array.isArray(row.committee)&&row.committee.length&&row.committeeReviewed!==true).map(row=>({id:row.id,classId:row.classId,priority:row.committee.reduce((score,group)=>score+(group.disagreement?5:0)+count(group.abstentions),0)})).sort((a,b)=>b.priority-a.priority);
  const failures=rows.filter(row=>row.split==='evaluation'&&row.modelId===personal?.modelId&&row.confirmed&&PHRASES.includes(row.classId)&&(!row.prediction?.accepted||row.prediction.classId!==row.classId));
  let next;
  if(!progress)next={type:'wait',title:'Consultar el informe privado',reason:'Falta cargar el informe autenticado del catálogo.'};
  else if(goal==='catalog'&&catalog.length){const target=catalog[0];next={type:'capture',classId:target.classId,title:`Grabar «${target.label}»`,reason:`Informe: ${target.snapshot} originales. En este navegador: ${target.local} tomas nuevas. ${support.includes(target.classId)?'Esta seña apoya las oraciones prioritarias.':'Ayuda a completar el catálogo visible.'}`};}
  else if(goal==='review'&&quality.at(-1)?.accepted===false){const last=quality.at(-1);next={type:'capture',classId:allowed.has(last.classId)?last.classId:PHRASES[0],title:'Repetir la toma con mejor seguimiento',reason:last.reason};}
  else if(goal==='review'&&reviews.length){const item=reviews[0];next={type:'review',recordingId:item.id,title:`Revisar comparación de «${name(item.classId)}»`,reason:item.priority?'Es una de las tomas pendientes con más discrepancias o abstenciones. Confirma la realización antes de usar sus etiquetas.':'Los modelos coinciden, pero el significado de la toma sigue pendiente de revisión.'};}
  else if(pending.length){const target=pending[0];next={type:'capture',classId:target.classId,title:`Grabar «${name(target.classId)}»`,reason:`Tiene ${target.count} de 3 tomas de aprendizaje utilizables. Faltan ${3-target.count} para el mínimo del prototipo personal.`};}
  else if(!personal)next={type:'train',title:'Entrenar el candidato de oraciones',reason:`Las ${PHRASES.length} oraciones reúnen el mínimo de aprendizaje (${learning.length} originales utilizables). La precisión se medirá después con tomas nuevas.`};
  else if(failures.length){const classId=failures[0].classId;next={type:'capture',classId,title:`Reforzar «${name(classId)}» con una toma nueva`,reason:'El candidato falló en una prueba confirmada de esta oración. Graba material nuevo para aprender; la prueba anterior permanecerá reservada.'};}
  else next={type:'evaluate',title:'Probar una oración nueva sin indicar su etiqueta',reason:'El candidato personal está listo para una prueba. Confirma qué hiciste después de ver su predicción; esa toma quedará reservada.'};
  const tested=(progress?.models||[]).filter(row=>count(row.evaluationSamples)>0);
  const evaluation=evaluationSummary(rows,personal?.modelId);
  const modelExplanation=tested.length?tested.map(row=>`${row.name}: ${count(row.correct)}/${count(row.evaluationSamples)} aceptadas correctas`).join(' · '):'El informe no contiene pruebas reservadas de estos candidatos.';
  return {next,counts,catalog,readyToTrain:pending.length===0,learningOriginals:learning.length,
    snapshotCovered:[...snapshot.values()].filter(value=>value>0).length,targetCount:VISIBLE_TARGETS.length,
    localSigns:[...local.values()].reduce((a,b)=>a+b,0),reserved:rows.filter(row=>row.split==='evaluation').length,
    evaluation,failedPhrases:[...new Set(failures.map(row=>row.classId))],modelExplanation,pendingReviews:reviews.length,
    qualityIssues:quality.filter(row=>row.accepted===false).length,
    steps:[{tool:'Consultar cobertura',detail:`${[...snapshot.values()].filter(value=>value>0).length}/${VISIBLE_TARGETS.length} clases en el informe privado`},
      {tool:'Auditar tomas locales',detail:`${learning.length} originales de oraciones utilizables; ${rows.filter(row=>row.split==='evaluation').length} reservadas excluidas del aprendizaje`},
      {tool:'Revisar evaluación',detail:modelExplanation},{tool:'Elegir siguiente acción',detail:next.title}]};
}

// Compare only candidates with identical class sets. Scores are not calibrated probabilities of correctness.
export async function compareCandidates({api,session,progress,features,cache=new Map(),cancelled=()=>false}) {
  if(!validSequence(features))throw Error('La toma no contiene una secuencia válida.');
  const candidates=(progress?.models||[]).filter(row=>/^[a-f0-9]{32}$/.test(row.modelId)&&Array.isArray(row.classes)&&row.classes.length>=2&&row.classes.every(id=>allowed.has(id)));
  const predictions=[];
  for(const row of candidates){
    if(cancelled())throw Error('Comparación interrumpida.');
    let model=cache.get(row.modelId);
    if(!model){const response=await api.trainingCandidate(session,row.modelId);model=await decodeCandidate(response.candidate);
      if(model.id!==row.modelId||JSON.stringify([...model.classes].sort())!==JSON.stringify([...row.classes].sort()))throw Error('El candidato no coincide con el informe privado.');
      if(cancelled())throw Error('Comparación interrumpida.');cache.set(row.modelId,model);}
    predictions.push({modelId:row.modelId,name:row.name,classes:[...row.classes].sort(),...predictForest(model,features)});
  }
  const groups=new Map();for(const row of predictions){const key=row.classes.join('|');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
  return [...groups.values()].map(group=>({classes:group[0].classes,predictions:group,
    disagreement:new Set(group.map(row=>row.accepted?row.classId:'abstain')).size>1,
    abstentions:group.filter(row=>!row.accepted).length}));
}
