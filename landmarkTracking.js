import { withTrackingTimeout } from "./trackingOverlay.js";
import { createHandWorker } from "./handTrackingWorker.js";

const HAND_CONNECTIONS = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];

// The browser bundle and its WASM/model assets must use the same version.
const HOLISTIC_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1675471629";
let holisticScript;
const HANDS_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240";
const FACE_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619";
const scripts = new Map();
// Legacy MediaPipe loaders share window.Module during their first WASM load.
// Serialize only startup; initialized detectors can process independently.
let modelStartup = Promise.resolve();
const initializedModels = new WeakSet();
let preparedTracker;
function runModel(model, send) {
  if (initializedModels.has(model)) return send();
  const startup = modelStartup.catch(() => {}).then(async () => {
    await send();
    initializedModels.add(model);
  });
  modelStartup = startup;
  return startup;
}

export const FACE_KEY_IDX = [
  70, 63, 105, 66, 107, 336, 296, 334, 293, 300,
  33, 160, 158, 133, 153, 144, 362, 385, 387, 263, 373, 380,
  1, 2, 98, 327, 61, 291, 0, 17, 39, 269, 78, 308, 14, 317,
  234, 454, 10, 338, 152, 175,
];

export function loadHolistic() {
  if (!holisticScript) {
    holisticScript = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `${HOLISTIC_CDN}/holistic.js`;
      script.crossOrigin = "anonymous";
      script.onload = () => {
        if (window.Holistic && window.HAND_CONNECTIONS && window.FACEMESH_CONTOURS) {
          resolve(window.Holistic);
        } else {
          script.remove();
          reject(new Error("No se pudo iniciar el trazado de cara y manos."));
        }
      };
      script.onerror = () => {
        script.remove();
        reject(new Error("No se pudo descargar el trazado. Revisa tu conexión."));
      };
      document.head.appendChild(script);
    }).catch(error => {
      holisticScript = null; // Allow retry after a network failure.
      throw error;
    });
  }
  return holisticScript;
}

export function createHolistic(Holistic) {
  const holistic = new Holistic({ locateFile: file => `${HOLISTIC_CDN}/${file}` });
  holistic.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.5,
  });
  return holistic;
}

function loadModelScript(url, globals) {
  if (scripts.has(url)) return scripts.get(url);
  const loading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const timer = setTimeout(() => {
      script.remove();
      reject(new Error("La descarga del trazado tardó demasiado. Vuelve a activarlo para reintentar."));
    }, 30000);
    script.src = url;
    script.crossOrigin = "anonymous";
    script.onload = () => {
      clearTimeout(timer);
      if (globals.every(name => window[name])) resolve();
      else { script.remove(); reject(new Error("No se pudo iniciar el detector de cara y manos.")); }
    };
    script.onerror = () => {
      clearTimeout(timer);
      script.remove();
      reject(new Error("No se pudo descargar el detector. Revisa tu conexión y vuelve a activar el trazado."));
    };
    document.head.appendChild(script);
  }).catch(error => {
    scripts.delete(url);
    throw error;
  });
  scripts.set(url, loading);
  return loading;
}

export function combineSignResults(image, faceResults, handResults, poseResults = {}) {
  const results = { image, faceLandmarks: faceResults.multiFaceLandmarks?.[0], poseLandmarks: poseResults.poseLandmarks };
  (handResults.multiHandLandmarks || []).forEach((landmarks, index) => {
    // MediaPipe Hands assumes a mirrored input. Expo's video pixels are raw;
    // only the preview's CSS is mirrored, so swap the anatomical hand labels.
    const label = handResults.multiHandedness?.[index]?.label;
    let side = label === "Left" ? "rightHandLandmarks" : "leftHandLandmarks";
    if (results[side]) side = side === "rightHandLandmarks" ? "leftHandLandmarks" : "rightHandLandmarks";
    results[side] = landmarks;
  });
  return results;
}

export function mapCroppedHands(results, crop) {
  return {
    multiHandLandmarks: (results.multiHandLandmarks || []).map(hand => hand.map(point => ({
      ...point,
      x: crop.x + point.x * crop.width,
      y: crop.y + point.y * crop.height,
      z: point.z * crop.width,
    }))),
    multiHandedness: results.multiHandedness || [],
  };
}

export function mergeHandDetections(primary, recovered) {
  const landmarks = [...(primary.multiHandLandmarks || [])];
  const handedness = landmarks.map((_, index) => primary.multiHandedness?.[index]);
  (recovered.multiHandLandmarks || []).forEach((hand, index) => {
    if (landmarks.length >= 2 || !hand[0]) return;
    // Overlapping search areas can detect the same palm twice. Match wrists in
    // the original frame, rather than discarding a hand based on its label.
    const duplicate = landmarks.some(existing => existing[0] &&
      Math.hypot(existing[0].x - hand[0].x, existing[0].y - hand[0].y) < 0.08);
    if (!duplicate) {
      landmarks.push(hand);
      handedness.push(recovered.multiHandedness?.[index]);
    }
  });
  return { multiHandLandmarks: landmarks, multiHandedness: handedness };
}

// Prepare shaders/models before the camera screen. Keep the initialized graphs
// between signs; reopening the camera must not repeat WASM/shader startup.
export function warmSignTracking() {
  if (!preparedTracker) {
    preparedTracker = (async () => {
      const tracker = await createSignTracker();
      const image = document.createElement("canvas");
      image.width = 640;
      image.height = 480;
      const ctx = image.getContext("2d");
      ctx.fillStyle = "#222";
      ctx.fillRect(0, 0, 640, 480);
      try {
        if (tracker.handBackend === 'direct-regions') {
          await Promise.all([
            withTrackingTimeout(tracker.sendHands({ image }), 45000),
            withTrackingTimeout(tracker.sendFace({ image }), 30000),
          ]);
        } else {
          await withTrackingTimeout(tracker.sendHands({ image }), 45000);
          await withTrackingTimeout(tracker.sendFace({ image }), 30000);
        }
        return tracker;
      } catch (error) {
        tracker.close().catch(() => {});
        throw error;
      }
    })().catch(error => { preparedTracker = null; throw error; });
  }
  return preparedTracker;
}

// Face and palms are located independently; a cropped/undetected body never
// prevents tracing. Holistic is used only for the optional LSTM pose features.
export async function createSignTracker({ legacyHands = typeof Worker === "undefined" } = {}) {
  await Promise.all([
    legacyHands ? loadModelScript(`${HANDS_CDN}/hands.js`, ["Hands", "HAND_CONNECTIONS"]) : Promise.resolve(),
    loadModelScript(`${FACE_CDN}/face_mesh.js`, ["FaceMesh", "FACEMESH_CONTOURS"]),
  ]);
  const face = new window.FaceMesh({ locateFile: file => `${FACE_CDN}/${file}` });
  let hands;
  try {hands = legacyHands ? new window.Hands({ locateFile: file => `${HANDS_CDN}/${file}` }) : await createHandWorker();}
  catch(error) {await face.close();throw error;}
  const handPadding = legacyHands ? 1.4 : 1;
  face.setOptions({ maxNumFaces: 1, refineLandmarks: false, minDetectionConfidence: 0.4, minTrackingConfidence: 0.4 });
  if (legacyHands) hands.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.35, minTrackingConfidence: 0.35 });
  let faceResults = {};
  let handResults = {};
  let pendingFaceResults = {};
  let pendingHandResults = {};
  let poseResults = {};
  let pose;
  let includePose = false;
  let closed = false;
  let callback = () => {};
  const snapshot = document.createElement("canvas");
  const handSnapshot = document.createElement("canvas");
  let faceJob;
  let handJob;
  let faceTime = 0;
  let handTime = 0;
  let faceLatency = 0;
  let handLatency = 0;
  const capture = (canvas, image, padded = false) => {
    const width = image.videoWidth || image.naturalWidth || image.width;
    const height = image.videoHeight || image.naturalHeight || image.height;
    if (!width || !height) return false;
    const ratio = Math.min(1, 640 / Math.max(width, height));
    const targetWidth = Math.round(width * ratio);
    const targetHeight = Math.round(height * ratio);
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }
    const ctx = canvas.getContext("2d");
    if (padded) {
      ctx.fillStyle = "#222";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const inset = (handPadding - 1) / (2 * handPadding);
      ctx.drawImage(image, canvas.width * inset, canvas.height * inset, canvas.width / handPadding, canvas.height / handPadding);
    } else ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return true;
  };
  const publish = image => {
    if (closed) return;
    callback({ ...combineSignResults(image, faceResults, handResults, poseResults), faceTime, handTime, faceLatency, handLatency, handBackend: legacyHands ? 'legacy' : 'direct-regions' });
  };
  // In-flight callbacks must never erase the other detector's completed frame.
  // Commit each channel only after its send has completed.
  face.onResults(results => { pendingFaceResults = results; });
  if (legacyHands) hands.onResults(results => { pendingHandResults = results; });
  const tracker = {
    async resetSequence() {
      await Promise.allSettled([faceJob, handJob]);
      if (closed) return;
      if (initializedModels.has(face) && typeof face.reset === 'function') await face.reset();
      if (typeof hands.reset === 'function') await hands.reset();
      faceResults = {}; handResults = {}; pendingFaceResults = {}; pendingHandResults = {};
    },
    handBackend: legacyHands ? 'legacy' : 'direct-regions',
    onResults(fn) { callback = fn; },
    enablePose() { includePose = true; },
    sendFace({ image, publishResult = true }) {
      if (closed || faceJob) return faceJob || Promise.resolve();
      if (!capture(snapshot, image)) return Promise.resolve();
      const capturedAt = performance.now();
      pendingFaceResults = {};
      faceJob = runModel(face, () => face.send({ image: snapshot })).then(() => {
        faceResults = pendingFaceResults;
        faceTime = capturedAt;
        faceLatency = performance.now() - capturedAt;
        if (publishResult) publish(snapshot);
      }).finally(() => { faceJob = null; });
      return faceJob;
    },
    sendHands({ image, publishResult = true }) {
      if (closed || handJob) return handJob || Promise.resolve();
      const capturedAt = performance.now();
      // Regional inference uses full-size raw frames. Legacy fallback retains
      // its padded coordinates; neither path resets or queues the live graph.
      if (!capture(handSnapshot, image, true)) return Promise.resolve();
      const detect = async () => {
        pendingHandResults = {};
        if (legacyHands) await hands.send({ image: handSnapshot });
        else {
          const points = faceResults.multiFaceLandmarks?.[0];
          const xs = points?.map(p => p.x), ys = points?.map(p => p.y);
          const faceBox = points?.length ? {x:(Math.min(...xs)+Math.max(...xs))/2,y:(Math.min(...ys)+Math.max(...ys))/2,width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)} : undefined;
          pendingHandResults = await hands.detect(handSnapshot, capturedAt, faceBox);
        }
        const margin = (handPadding - 1) / 2;
        handResults = mapCroppedHands(pendingHandResults, { x: -margin, y: -margin, width: handPadding, height: handPadding });
        handTime = capturedAt;
        handLatency = performance.now() - capturedAt;
        if (publishResult) publish(handSnapshot);
      };
      handJob = (legacyHands ? runModel(hands, detect) : detect()).finally(() => { handJob = null; });
      return handJob;
    },
    async send({ image }) {
      if (closed) return;
      // The visualizer/recognition path consumes a complete frame. Live camera
      // overlays call the independent methods above, so hands cannot freeze face.
      await tracker.sendFace({ image, publishResult: false });
      await tracker.sendHands({ image, publishResult: false });
      if (includePose) {
        try {
          if (!pose) {
            const Holistic = await loadHolistic();
            if (closed) return;
            pose = createHolistic(Holistic);
            pose.onResults(results => { poseResults = results; });
          }
          poseResults = {};
          await pose.send({ image: snapshot });
        } catch (error) {
          includePose = false;
          console.warn("Pose opcional de reconocimiento:", error);
        }
      }
      publish(snapshot);
    },
    async close() {
      closed = true;
      await Promise.allSettled([faceJob, handJob]);
      await Promise.allSettled([face.close(), hands.close(), pose?.close()]);
    },
  };
  return tracker;
}

export function drawSignLandmarks(ctx, results) {
  const { width, height } = ctx.canvas;
  const point = lm => lm && Number.isFinite(lm.x) && Number.isFinite(lm.y);
  const draw = (landmarks, connections, color, radius, indices) => {
    if (!landmarks?.length) return;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(1, width / 400);
    ctx.beginPath();
    for (const [a, b] of connections) {
      if (!point(landmarks[a]) || !point(landmarks[b])) continue;
      ctx.moveTo(landmarks[a].x * width, landmarks[a].y * height);
      ctx.lineTo(landmarks[b].x * width, landmarks[b].y * height);
    }
    ctx.stroke();
    for (const lm of indices ? indices.map(i => landmarks[i]) : landmarks) {
      if (!point(lm)) continue;
      ctx.beginPath();
      ctx.arc(lm.x * width, lm.y * height, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  ctx.save();
  draw(results.faceLandmarks, window.FACEMESH_CONTOURS, "#F7DC6F", 2, FACE_KEY_IDX);
  draw(results.rightHandLandmarks, window.HAND_CONNECTIONS || HAND_CONNECTIONS, "#4ECDC4", 3);
  draw(results.leftHandLandmarks, window.HAND_CONNECTIONS || HAND_CONNECTIONS, "#79B8FF", 3);
  ctx.restore();
}
