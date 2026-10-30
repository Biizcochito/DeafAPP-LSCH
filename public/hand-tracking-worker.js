/* Pinned TFJS 4.22.0 + hand-pose-detection 2.0.1. Their JS implementation
   exposes handLandmarks/handLandmarksToRoi. Direct regional inference avoids
   the palm detector's missed acquisitions; every point still comes from ML. */
importScripts('hand-regions.js?v=stable-traces-20261030', 'hand-model/tf.min.js', 'hand-model/hand-pose-detection.min.js');
let detector, canvas, timestamp = -1;
const slots = [{}, {}];
let searchPhase = 0;
async function infer(image, face, now=timestamp) {
  if (!canvas || canvas.width !== image.width || canvas.height !== image.height) canvas = new OffscreenCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d', {willReadFrequently:true});
  ctx.drawImage(image, 0, 0);
  const tensor = tf.tidy(() => tf.browser.fromPixels(ctx.getImageData(0,0,canvas.width,canvas.height)).toFloat());
  try {
    const seeds = HandRegions.seeds(face, canvas.width, canvas.height, searchPhase++);
    const regions=slots.map((slot,index)=>HandRegions.trackedRegion(slot,now,canvas.width,canvas.height)||seeds[index]);
    const candidates = await Promise.all(regions.map(region => detector.handLandmarks(region,tensor)));
    const validTracked=(hand,index)=>HandRegions.valid(hand)&&HandRegions.consistent(hand,slots[index],now,canvas.width,canvas.height);
    // Retry a recently tracked hand in a larger, motion-guided crop in the
    // same frame. Only a new successful model inference supplies output points.
    await Promise.all(candidates.map(async(hand,index)=>{
      if(validTracked(hand,index))return;
      const recovery=HandRegions.trackedRegion(slots[index],now,canvas.width,canvas.height,true);
      if(recovery)candidates[index]=await detector.handLandmarks(recovery,tensor);
    }));
    const hands = [], labels = [], anatomical = [];
    candidates.forEach((hand, index) => {
      const slot = slots[index];
      if (!validTracked(hand,index) || hands.some(other => HandRegions.duplicate(other, hand.landmarks))) {
        slot.misses=(slot.misses||0)+1;
        if(now-slot.seenAt>650)HandRegions.forget(slot);
        return;
      }
      HandRegions.remember(slot,detector.handLandmarksToRoi(hand.landmarks,{width:canvas.width,height:canvas.height}),now,hand.landmarks);
      hands.push(hand.landmarks);
      // Keep a tracked identity instead of changing sides when hands cross.
      labels.push({label:index === 0 ? 'Left' : 'Right'});
      anatomical.push({label:hand.handedness});
    });
    // Conventional palm acquisition covers new hands in other positions or
    // orientations. Direct regions recover palms this stage misses.
    const lostTrackedHand=slots.some(slot=>slot.roi&&slot.misses>0);
    if (hands.length < 2 && (lostTrackedHand || searchPhase % 2 === 0)) {
      const palms = await detector.detectPalm(tensor);
      const recovered = await Promise.all(palms.map(palm => detector.handLandmarks(detector.palmDetectionToRoi(palm, {width:canvas.width,height:canvas.height}), tensor)));
      for (const hand of recovered) {
        if (hands.length >= 2 || !HandRegions.valid(hand) || hands.some(other => HandRegions.duplicate(other,hand.landmarks))) continue;
        const free=[0,1].filter(index=>!labels.some(item=>item.label===(index===0?'Left':'Right')));
        const preferred=hand.landmarks[0].x<(face?.x??.5)?0:1;
        free.sort((a,b)=>{
          const distance=index=>{const roi=HandRegions.trackedRegion(slots[index],now,canvas.width,canvas.height);return roi?Math.hypot(roi.xCenter-hand.landmarks[0].x,roi.yCenter-hand.landmarks[0].y):(index===preferred?2:3);};
          return distance(a)-distance(b);
        });
        const index=free[0];
        HandRegions.remember(slots[index],detector.handLandmarksToRoi(hand.landmarks,{width:canvas.width,height:canvas.height}),now,hand.landmarks);
        hands.push(hand.landmarks);labels.push({label:index === 0 ? 'Left' : 'Right'});
        anatomical.push({label:hand.handedness});
      }
    }
    // Region slots are tracking identities; inference needs the handedness predicted by ML.
    return {multiHandLandmarks:hands,multiHandedness:labels,multiAnatomicalHandedness:anatomical};
  } finally { tensor.dispose(); }
}
self.onmessage = async ({data}) => {
  try {
    if (data.type === 'init') {
      await tf.setBackend('webgl'); await tf.ready();
      detector = await handPoseDetection.createDetector(handPoseDetection.SupportedModels.MediaPipeHands, {
        runtime:'tfjs',modelType:'lite',maxHands:2,
        detectorModelUrl:new URL('hand-model/palm/model.json',self.location.href).href,
        landmarkModelUrl:new URL('hand-model/landmark/model.json',self.location.href).href,
      });
      if (['handLandmarks','handLandmarksToRoi','detectPalm','palmDetectionToRoi'].some(name => typeof detector[name] !== 'function')) throw new Error('El modelo de manos no es compatible.');
      const blank = new OffscreenCanvas(640,480);
      blank.getContext('2d').fillRect(0,0,640,480);
      await infer(blank);
      // Compile the occasional acquisition fallback before the camera opens.
      const blankTensor = tf.zeros([480,640,3]);
      try {await detector.detectPalm(blankTensor);} finally {blankTensor.dispose();}
      searchPhase = 0; slots.forEach(HandRegions.forget);
      self.postMessage({id:data.id,type:'ready'});
    } else if (data.type === 'reset') {
      searchPhase = 0; slots.forEach(HandRegions.forget);
      self.postMessage({id:data.id,type:'result',result:{}});
    } else if (data.type === 'frame') {
      try {
        timestamp = Math.max(timestamp + 1, data.timestamp);
        const result = await infer(data.image, data.face,timestamp);
        self.postMessage({id:data.id,type:'result',result});
      } finally {data.image.close();}
    }
  } catch(error) { self.postMessage({id:data.id,type:'error',message:error.message || 'No se pudo iniciar el trazado de manos.'}); }
};
