/* Pinned TFJS 4.22.0 + hand-pose-detection 2.0.1. Their JS implementation
   exposes handLandmarks/handLandmarksToRoi. Direct regional inference avoids
   the palm detector's missed acquisitions; every point still comes from ML. */
importScripts('hand-regions.js', 'hand-model/tf.min.js', 'hand-model/hand-pose-detection.min.js');
let detector, canvas, timestamp = -1;
const slots = [{}, {}];
let searchPhase = 0;
async function infer(image, face) {
  if (!canvas || canvas.width !== image.width || canvas.height !== image.height) canvas = new OffscreenCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d', {willReadFrequently:true});
  ctx.drawImage(image, 0, 0);
  const tensor = tf.tidy(() => tf.browser.fromPixels(ctx.getImageData(0,0,canvas.width,canvas.height)).toFloat());
  try {
    const seeds = HandRegions.seeds(face, canvas.width, canvas.height, searchPhase++);
    const candidates = await Promise.all(slots.map((slot, index) => detector.handLandmarks(slot.roi || seeds[index], tensor)));
    const hands = [], labels = [];
    candidates.forEach((hand, index) => {
      const slot = slots[index];
      if (!HandRegions.valid(hand) || hands.some(other => HandRegions.duplicate(other, hand.landmarks))) {
        if (++slot.misses >= 2) slot.roi = null;
        return;
      }
      slot.misses = 0;
      slot.roi = detector.handLandmarksToRoi(hand.landmarks, {width:canvas.width,height:canvas.height});
      hands.push(hand.landmarks);
      // Keep a tracked identity instead of changing sides when hands cross.
      labels.push({label:index === 0 ? 'Left' : 'Right'});
    });
    // Conventional palm acquisition covers new hands in other positions or
    // orientations. Direct regions recover palms this stage misses.
    if (hands.length < 2 && searchPhase % 4 === 0) {
      const palms = await detector.detectPalm(tensor);
      const recovered = await Promise.all(palms.map(palm => detector.handLandmarks(detector.palmDetectionToRoi(palm, {width:canvas.width,height:canvas.height}), tensor)));
      for (const hand of recovered) {
        if (hands.length >= 2 || !HandRegions.valid(hand) || hands.some(other => HandRegions.duplicate(other,hand.landmarks))) continue;
        const preferred = hand.landmarks[0].x < (face?.x ?? .5) ? 0 : 1;
        const label = preferred === 0 ? 'Left' : 'Right';
        const index = labels.some(item => item.label === label) ? 1-preferred : preferred;
        slots[index].misses = 0;
        slots[index].roi = detector.handLandmarksToRoi(hand.landmarks, {width:canvas.width,height:canvas.height});
        hands.push(hand.landmarks);labels.push({label:index === 0 ? 'Left' : 'Right'});
      }
    }
    return {multiHandLandmarks:hands,multiHandedness:labels};
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
      searchPhase = 0; slots.forEach(slot => {slot.roi=null;slot.misses=0;});
      self.postMessage({id:data.id,type:'ready'});
    } else if (data.type === 'frame') {
      try {
        timestamp = Math.max(timestamp + 1, data.timestamp);
        const result = await infer(data.image, data.face);
        self.postMessage({id:data.id,type:'result',result});
      } finally {data.image.close();}
    }
  } catch(error) { self.postMessage({id:data.id,type:'error',message:error.message || 'No se pudo iniciar el trazado de manos.'}); }
};
