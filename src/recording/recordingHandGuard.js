export const HAND_RESULT_MAX_AGE = 350;
export const HAND_CONTINUITY_GRACE_MS = 1200;

export function hasTrackedHand(points) {
  return points?.length === 21 && points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y));
}

export function handsReadyForRecording(tracking, now, minimumHands = 2) {
  const age = now - tracking?.handTime;
  return !!tracking?.enabled && age >= 0 && age <= HAND_RESULT_MAX_AGE &&
    Number(hasTrackedHand(tracking.leftHandLandmarks)) + Number(hasTrackedHand(tracking.rightHandLandmarks)) >= minimumHands;
}

// Switching from two hands to one can briefly interrupt detector results.
// Measure that gap from the last real detection, never from polling time.
export function createRecordingHandContinuity() {
  let lastHandTime;
  return {
    reset() { lastHandTime = undefined; },
    update(tracking, now) {
      if (!tracking?.enabled || tracking.handStatus && tracking.handStatus !== "ready") {
        lastHandTime = undefined;
        return false;
      }
      if (handsReadyForRecording(tracking, now, 1)) lastHandTime = tracking.handTime;
      const age = now - lastHandTime;
      return age >= 0 && age <= HAND_CONTINUITY_GRACE_MS;
    },
  };
}

export function cameraFrameReady(video) {
  return !!video && video.readyState >= 2 && video.videoWidth > 0 &&
    video.videoHeight > 0 && !video.paused && !video.ended;
}

// The click arms recording. It does not require the user to keep their mouse
// hand in the camera. After the initial confirmation, the countdown can use
// a less restrictive requirement without losing that confirmation.
export async function prepareTrackedRecording({ isReady, isCountdownReady = isReady, isCancelled, assertAllowed = () => {}, now, delay, onWaiting, onCountdown, stableMs = 500, maxWaitMs = 30000, timeoutMessage = "No se inició la grabación. Comprueba la cámara y muestra ambas manos con trazado; después vuelve a pulsar Preparar grabación." }) {
  const deadline = now() + maxWaitMs;
  let confirmed = false;
  const check = () => {
    if (isCancelled()) throw Object.assign(new Error("Grabación cancelada."), { code: "CANCELLED" });
    assertAllowed();
    if (now() >= deadline) throw new Error(timeoutMessage);
  };
  while (true) {
    onWaiting();
    let readySince;
    while (true) {
      check();
      if (confirmed ? isCountdownReady() : isReady()) {
        readySince ??= now();
        if (now() - readySince >= stableMs) break;
      } else readySince = undefined;
      await delay(50);
    }
    confirmed = true;
    let complete = true;
    for (let number = 3; number >= 1; number--) {
      onCountdown(number);
      for (let tick = 0; tick < 10; tick++) {
        await delay(100);
        check();
        if (!isCountdownReady()) { complete = false; break; }
      }
      if (!complete) break;
    }
    if (complete && isCountdownReady()) return;
  }
}

// Evaluate again at each asynchronous boundary; a previously enabled button
// must never authorize capturing/uploading after tracking is lost.
export async function captureTrackedFrames({ count, isReady, assertAllowed = () => {}, capture, delay, onFrame }) {
  const frames = [];
  for (let index = 0; index < count; index++) {
    assertAllowed();
    if (!isReady()) throw new Error("Se perdió el trazado de todas las manos. No guardamos la grabación. Repite la preparación.");
    const frame = await capture();
    assertAllowed();
    if (!isReady()) throw new Error("Se perdió el trazado de todas las manos. No guardamos la grabación. Repite la preparación.");
    frames.push(frame);
    onFrame(index + 1);
    await delay();
  }
  assertAllowed();
  if (!isReady()) throw new Error("Se perdió el trazado de todas las manos. No guardamos la grabación. Repite la preparación.");
  return frames;
}
