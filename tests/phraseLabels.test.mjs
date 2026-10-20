import test from 'node:test';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {PHRASES} from '../training/visibleTraining.js';
import {canonicalPhraseClassId,canonicalPhraseLabel} from '../training/phraseLabels.js';
import {trainingPhraseRows,evaluationSummary} from '../training/assistantData.js';
import {trainPersonalPhrases,predictPersonalPhrase,phraseCounts} from '../training/personalPhrases.js';
import {inspectLegacyRecording} from '../training/legacyRecovery.js';
import {displayWord} from '../ui/signNames.js';
import {resumirResultado,titularDeResultado} from '../translator.js';
// Puntos sintéticos para comprobar flujo y reservas; nunca son muestras de entrenamiento reales.
const features=seed=>Array.from({length:32},()=>[...Array(168).fill(seed),1,1,1]);
test('«yo bien» identifica la cuarta oración y conserva las señas individuales',()=>{
 assert.equal(PHRASES.at(-1),'oraciones/estoy bien');
 for(const value of ['yo bien','YO_BIEN','oraciones/yo bien','conversacion/yo_bien'])assert.equal(canonicalPhraseClassId(value),'oraciones/estoy bien');
 for(const value of ['pronombres/yo','saludos/bien','yo','bien','no estoy bien'])assert.equal(canonicalPhraseClassId(value),value);
 assert.equal(canonicalPhraseLabel('yo bien'),'estoy bien');assert.equal(displayWord('YO_BIEN'),'estoy bien');
});
test('las capturas completas con la etiqueta antigua cuentan sin alterar el origen ni admitir reservas',()=>{
 const original={id:'old',classId:'oraciones/yo bien',wholePhrase:true,split:'train',features:features(.1)};
 const learning=trainingPhraseRows([original]);assert.equal(learning[0].classId,'oraciones/estoy bien');assert.equal(learning[0].sourceClassId,'oraciones/yo bien');
 assert.equal(original.classId,'oraciones/yo bien');assert.equal(learning[0].features,original.features);
 assert.equal(phraseCounts([original]).find(r=>r.classId==='oraciones/estoy bien').count,1);
 assert.equal(trainingPhraseRows([original,{...original,id:'reserved',classId:'oraciones/estoy bien',split:'evaluation'}]).length,0);
 assert.equal(trainingPhraseRows([{...original,wholePhrase:false}]).length,0);
});
test('la recuperación valida la aprobación original y devuelve la etiqueta canónica sin cambiar el archivo',()=>{
 const recording={label:'yo bien',categoria:'conversacion',frames:Array(12).fill('/9j/AA==')};
 const result=inspectLegacyRecording(recording,{label:'yo bien',category:'conversacion',version:1});
 assert.equal(result.classId,'oraciones/estoy bien');assert.equal(result.sourceClassId,'conversacion/yo bien');assert.equal(recording.label,'yo bien');
 assert.throws(()=>inspectLegacyRecording(recording,{label:'estoy bien',category:'oraciones',version:1}));
});
test('una predicción «yo bien» se presenta como «estoy bien» conservando la salida cruda del modelo',()=>{
 const result=resumirResultado({prediccion:'yo bien',candidatos:[{sena:'yo bien',confianza:.9}]},displayWord);
 assert.equal(titularDeResultado(result),'estoy bien');assert.equal(result.prediccion,'yo bien');assert.equal(result.candidatos[0].sena,'yo bien');
 assert.deepEqual(evaluationSummary([{split:'evaluation',confirmed:true,modelId:'m',classId:'oraciones/yo bien',prediction:{accepted:true,classId:'oraciones/estoy bien'}}],'m'),{samples:1,correct:1,unknownSamples:0,falseAccepts:0});
});

test('el entrenamiento personal exige las cuatro oraciones y produce cuatro salidas',async()=>{
 const require=createRequire(import.meta.url),tf=require('../public/hand-model/tf.min.js');await tf.setBackend('cpu');await tf.ready();
 const rows=PHRASES.flatMap((classId,c)=>Array.from({length:3},(_,i)=>({id:`qa-${c}-${i}`,classId:c===3?'oraciones/yo bien':classId,wholePhrase:true,split:'train',features:features((c+1)*.1+i*.001)})));
 await assert.rejects(()=>trainPersonalPhrases(tf,rows.slice(0,9)),/tres tomas completas/);
 const candidate=await trainPersonalPhrases(tf,rows);
 try{assert.equal(candidate.model.outputs[0].shape.at(-1),4);assert.deepEqual(candidate.report.classes,PHRASES);assert.equal(candidate.report.originals,12);assert.equal(candidate.report.accuracy,null);
  const prediction=predictPersonalPhrase(tf,candidate.model,features(.4));assert.ok(!prediction.accepted||PHRASES.includes(prediction.classId));
 }finally{candidate.model.dispose();}
});
