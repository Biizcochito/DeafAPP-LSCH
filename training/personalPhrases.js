import {PHRASES} from './visibleTraining.js';

const DATABASE='deafapp-private-phrases-v1';
export function phraseStore(action, value) {
  return new Promise((resolve,reject)=>{
    const opening=indexedDB.open(DATABASE,1);
    opening.onupgradeneeded=()=>opening.result.createObjectStore('captures',{keyPath:'id'});
    opening.onerror=()=>reject(Error('No se pudo abrir el almacenamiento de este navegador.'));
    opening.onsuccess=()=>{
      const db=opening.result,tx=db.transaction('captures',action==='list'?'readonly':'readwrite'),store=tx.objectStore('captures');
      const request=action==='list'?store.getAll():action==='clear'?store.clear():store.put(value);
      let result;request.onsuccess=()=>{result=request.result;};
      tx.oncomplete=()=>{db.close();resolve(result);};
      tx.onerror=()=>{db.close();reject(Error('No se pudo guardar la captura.'));};
      tx.onabort=()=>{db.close();reject(Error('Se interrumpió el almacenamiento.'));};
    };
  });
}

export function phraseCounts(rows) {
  return PHRASES.map(classId=>({classId,count:rows.filter(row=>row.classId===classId&&row.wholePhrase===true).length}));
}

export async function trainPersonalPhrases(tf, rows, onEpoch, cancelled=()=>false) {
  if(phraseCounts(rows).some(row=>row.count<3))throw Error('Graba tres tomas completas de cada oración.');
  const originals=rows.filter(row=>PHRASES.includes(row.classId)&&row.wholePhrase===true);
  if(originals.some(row=>row.features?.length!==32||row.features.some(frame=>frame.length!==171||frame.some(v=>!Number.isFinite(v)))))throw Error('Una captura no es compatible.');
  const model=tf.sequential();
  model.add(tf.layers.conv1d({inputShape:[32,171],filters:16,kernelSize:3,activation:'relu'}));
  model.add(tf.layers.maxPooling1d({poolSize:2}));model.add(tf.layers.flatten());
  model.add(tf.layers.dense({units:32,activation:'relu'}));model.add(tf.layers.dropout({rate:.2}));
  model.add(tf.layers.dense({units:3,activation:'softmax'}));
  model.compile({optimizer:tf.train.adam(.002),loss:'categoricalCrossentropy'});
  const x=tf.tensor3d(originals.map(row=>row.features));
  const y=tf.tensor2d(originals.map(row=>PHRASES.map(id=>Number(id===row.classId))));
  try{
    await model.fit(x,y,{epochs:30,batchSize:Math.min(8,rows.length),shuffle:true,callbacks:{onEpochEnd:async(epoch,logs)=>{onEpoch?.(epoch+1,logs.loss);if(cancelled())model.stopTraining=true;await tf.nextFrame();}}});
    if(cancelled())throw Error('Entrenamiento interrumpido.');
    return {model,report:{classes:PHRASES,originals:originals.length,accuracy:null,evaluationSamples:0,publicActivation:false,wholePhraseOnly:true}};
  }catch(error){model.dispose();throw error;}finally{x.dispose();y.dispose();}
}

export function predictPersonalPhrase(tf, model, features) {
  // Inference accepts movements only; the selected recording label is never consulted.
  const probabilities=tf.tidy(()=>Array.from(model.predict(tf.tensor3d([features])).dataSync()));
  const order=probabilities.map((score,i)=>({score,i})).sort((a,b)=>b.score-a.score);
  const accepted=order[0].score>=.85&&order[0].score-order[1].score>=.2;
  return {accepted,classId:accepted?PHRASES[order[0].i]:null};
}
