export const BLOCKED_GESTURE_MESSAGE = "Gesto no permitido: dedo medio levantado. Cambia el gesto para poder grabar.";

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function cosine(a, b, c) {
  const ux = a.x - b.x, uy = a.y - b.y;
  const vx = c.x - b.x, vy = c.y - b.y;
  const length = Math.hypot(ux, uy) * Math.hypot(vx, vy);
  return length > 1e-8 ? (ux * vx + uy * vy) / length : 1;
}

// Recognize only the explicit middle-finger configuration. Other hand shapes
// (including the LSCh alphabet, I-love-you, a fist and pointing) remain allowed.
// Correct normalized image coordinates before measuring angles/distances.
export function isMiddleFingerGesture(landmarks, aspectRatio = 1) {
  if (landmarks?.length !== 21 || !Number.isFinite(aspectRatio) || aspectRatio <= 0 ||
      !landmarks.every(p => Number.isFinite(p?.x) && Number.isFinite(p?.y))) return false;
  const points = landmarks.map(p => ({x: p.x * aspectRatio, y: p.y}));
  const wrist = points[0], base = points[9], pip = points[10], dip = points[11], tip = points[12];
  const palm = distance(wrist, base);
  if (palm < 0.015) return false;
  const length = distance(base, pip) + distance(pip, dip) + distance(dip, tip);
  const middleStraight = cosine(base, pip, dip) < -0.85 && cosine(pip, dip, tip) < -0.8 &&
    distance(base, tip) > length * 0.88 && distance(wrist, tip) > distance(wrist, pip) * 1.22 &&
    cosine(wrist, base, tip) < -0.65;
  if (!middleStraight) return false;
  return [5, 13, 17].every(index => {
    const mcp = points[index], joint = points[index + 1], next = points[index + 2], end = points[index + 3];
    const path = distance(mcp, joint) + distance(joint, next) + distance(next, end);
    const folded = cosine(mcp, joint, next) > -0.75 || distance(mcp, end) < path * 0.65;
    return folded && distance(wrist, end) < distance(wrist, joint) + palm * 0.12;
  });
}

export function createGestureGate({stableMs = 250, minimumFrames = 3, maxAgeMs = 350} = {}) {
  let since, frames = 0, misses = 0, lastTime, lastCandidateTime, blocked = false;
  const reset = () => {since = undefined; frames = 0; misses = 0; lastTime = undefined; lastCandidateTime = undefined; blocked = false;};
  return {
    reset,
    update(tracking, now) {
      const age = now - tracking?.handTime;
      const fresh = tracking?.enabled && age >= 0 && age <= maxAgeMs;
      if (!fresh || !(tracking.leftHandLandmarks?.length || tracking.rightHandLandmarks?.length)) {
        reset(); return {blocked: false};
      }
      const width = tracking?.sourceWidth || tracking?.image?.width || 1;
      const height = tracking?.sourceHeight || tracking?.image?.height || 1;
      const candidate = [tracking.leftHandLandmarks, tracking.rightHandLandmarks]
        .some(hand => isMiddleFingerGesture(hand, width / height));
      // Face/animation frames can repeat the same hand result: count only real
      // hand-model results, and measure persistence in their capture timestamps.
      if (lastTime !== tracking.handTime) {
        if (lastTime !== undefined && (tracking.handTime < lastTime || tracking.handTime - lastCandidateTime > maxAgeMs)) reset();
        lastTime = tracking.handTime;
        if (candidate) {
          since ??= tracking.handTime;
          lastCandidateTime = tracking.handTime;
          misses = 0;
          frames++;
          blocked = frames >= minimumFrames && tracking.handTime - since >= stableMs;
        } else if (++misses >= 2) reset();
      }
      return {blocked, gesture: blocked ? 'middle-finger' : undefined};
    },
  };
}

export function assertGestureAllowed(blocked) {
  if (blocked) throw Object.assign(new Error("Grabación descartada por un gesto no permitido (dedo medio). Vuelve a preparar la seña indicada."), {code: 'BLOCKED_GESTURE'});
}
