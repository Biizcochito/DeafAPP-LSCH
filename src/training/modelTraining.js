import { selectTrainingGroup } from './trainingPlan.js';
export async function trainReviewedModel(dataset,{tf,classIds,signal,onProgress=()=>{},epochs=30}={}) {
  const group=selectTrainingGroup(dataset,classIds);
  if(!tf||!Number.isInteger(epochs)||epochs<1||epochs>100)throw new Error('No se pudo iniciar el entrenador.');
  const check=()=>{if(signal?.aborted)throw new Error('Entrenamiento cancelado.');};check();
  const classes=group.classes, labelIndex=new Map(classes.map((id,i)=>[id,i]));
  const model=tf.sequential();
  model.add(tf.layers.conv1d({inputShape:[32,171],filters:16,kernelSize:3,activation:'relu',kernelInitializer:tf.initializers.glorotUniform({seed:19})}));
  model.add(tf.layers.maxPooling1d({poolSize:2}));model.add(tf.layers.flatten());
  model.add(tf.layers.dense({units:32,activation:'relu',kernelInitializer:tf.initializers.glorotUniform({seed:23})}));
  model.add(tf.layers.dropout({rate:0.2,seed:29}));model.add(tf.layers.dense({units:classes.length,activation:'softmax',kernelInitializer:tf.initializers.glorotUniform({seed:31})}));
  const optimizer=tf.train.adam(0.002);
  model.compile({optimizer,loss:'categoricalCrossentropy',metrics:['accuracy']});
  const tensors=[];
  try {
    const x=tf.tensor3d(group.train.map(s=>s.features));tensors.push(x);
    const y=tf.tidy(()=>tf.oneHot(tf.tensor1d(group.train.map(s=>labelIndex.get(s.classId)),'int32'),classes.length));tensors.push(y);
    const history=await model.fit(x,y,{epochs,batchSize:Math.min(16,group.train.length),shuffle:true,
      callbacks:{onBatchEnd:()=>{if(signal?.aborted)model.stopTraining=true;},onEpochEnd:async(epoch,logs)=>{onProgress({stage:'training',epoch:epoch+1,epochs,loss:logs.loss});await tf.nextFrame();}}});
    check();onProgress({stage:'evaluation'});
    // Held-out originals are evaluated once. Prototype mode holds out footage,
    // while independent mode also requires completely different participants.
    const ex=tf.tensor3d(group.evaluation.map(s=>s.features));tensors.push(ex);
    const probabilities=model.predict(ex);tensors.push(probabilities);
    const values=await probabilities.array();check();
    const matrix=classes.map(()=>classes.map(()=>0));let correct=0;
    group.evaluation.forEach((sample,i)=>{
      const actual=labelIndex.get(sample.classId), predicted=values[i].indexOf(Math.max(...values[i]));matrix[actual][predicted]++;if(actual===predicted)correct++;
    });
    const perClass=classes.map((classId,i)=>{
      const total=matrix[i].reduce((a,b)=>a+b,0), predicted=matrix.reduce((sum,row)=>sum+row[i],0);
      return {classId,samples:total,correct:matrix[i][i],recall:matrix[i][i]/total,precision:predicted?matrix[i][i]/predicted:0};
    });
    return {model,report:{version:1,createdAt:new Date().toISOString(),architecture:'temporal-conv1d-32x171',classes,
      epochsCompleted:history.history.loss.length,initialLoss:history.history.loss[0],finalLoss:history.history.loss.at(-1),
      trainOriginals:group.train.filter(s=>s.variant==='original').length,trainVariants:group.train.length,
      trainingParticipants:new Set(group.train.map(s=>s.participantId)).size,evaluationParticipants:new Set(group.evaluation.map(s=>s.participantId)).size,
      evaluationSamples:group.evaluation.length,accuracy:correct/group.evaluation.length,perClass,confusionMatrix:matrix,
      mode:group.plan.mode,
      evaluationScope:group.plan.mode === 'personal-prototype' ? 'different-recordings-not-independent-people' : 'held-out-declared-participants-identity-needs-review',
      participantIndependenceTested:group.plan.mode !== 'personal-prototype',
      movementTiming:group.plan.mode === 'personal-prototype' ? 'normalized-image-order-not-exact-capture-speed' : 'recorded-capture-times',
      unknownGesturesEvaluated:false,publicActivation:false,status:group.plan.mode === 'personal-prototype' ? 'personal-prototype-not-publicly-validated' : 'candidate-needs-linguistic-and-real-camera-evaluation'}};
  } catch(e) {model.dispose();throw e;}
  finally {tensors.forEach(t=>t.dispose());optimizer.dispose();}
}
