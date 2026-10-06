/* Hand inference runs outside the camera/face rendering thread. */
const HAND_ASSETS = new URL("mediapipe/hands-v1.0.1/", self.location.href).href;
let detector;
let inputCanvas;
let normalizeInput = true;
let lastTimestamp = -1;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === "init") {
      normalizeInput = data.options?.normalizeInput !== false;
      self.exports = {};
      importScripts(`${HAND_ASSETS}vision_bundle.js`);
      const files = await self.exports.FilesetResolver.forVisionTasks(HAND_ASSETS);
      detector = await self.exports.HandLandmarker.createFromOptions(files, {
        baseOptions: {
          modelAssetPath: `${HAND_ASSETS}hand_landmarker.task`,
          delegate: data.options?.delegate || "GPU",
        },
        runningMode: "VIDEO", numHands: data.options?.numHands ?? 2,
        minHandDetectionConfidence: data.options?.detectionConfidence ?? 0.25,
        minHandPresenceConfidence: data.options?.presenceConfidence ?? 0.35,
        minTrackingConfidence: 0.35,
      });
      self.postMessage({ id: data.id, type: "ready" });
    } else if (data.type === "frame") {
      try {
        lastTimestamp = Math.max(data.timestamp, lastTimestamp + 1);
        let input = data.image;
        if (normalizeInput) {
          if (!inputCanvas || inputCanvas.width !== input.width || inputCanvas.height !== input.height) inputCanvas = new OffscreenCanvas(input.width, input.height);
          inputCanvas.getContext("2d").drawImage(input, 0, 0);
          input = inputCanvas;
        }
        const result = detector.detectForVideo(input, lastTimestamp);
        self.postMessage({ id: data.id, type: "result", result: {
          multiHandLandmarks: result.landmarks,
          // Tasks emits anatomical sides on raw frames; normalize to the legacy
          // mirrored-input convention consumed by combineSignResults.
          multiHandedness: result.handedness.map(hand => ({ label: hand[0].categoryName === "Left" ? "Right" : "Left" })),
        } });
      } finally { data.image.close(); }
    }
  } catch (error) {
    self.postMessage({ id: data.id, type: "error", message: error.message || "No se pudo iniciar el trazado de manos." });
  }
};
