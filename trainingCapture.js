// Indices refer to MediaPipe FaceMesh's original 468-point topology.
export const TRAINING_FACE_INDICES = [70, 63, 105, 66, 107, 336, 296, 334, 293, 300, 33, 160, 158, 133, 153, 144, 362, 385, 387, 263, 373, 380, 1, 2, 98, 327, 61, 291, 0, 17, 39, 269, 78, 308, 14, 317, 234, 454, 10, 338, 152, 175];

export function makeParticipantId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID() : `person-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const points = (values, count) => values?.length === count && values.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))
  ? values.map(p => [p.x, p.y, Number.isFinite(p.z) ? p.z : 0]) : null;

export function captureTrackingSample(tracking, now, startedAt) {
  const handAgeMs = Number.isFinite(tracking?.handTime) ? now - tracking.handTime : null;
  const faceAgeMs = Number.isFinite(tracking?.faceTime) ? now - tracking.faceTime : null;
  const handFresh = tracking?.enabled && Number.isFinite(handAgeMs) && handAgeMs >= 0 && handAgeMs <= 350;
  const faceFresh = tracking?.enabled && Number.isFinite(faceAgeMs) && faceAgeMs >= 0 && faceAgeMs <= 600;
  const face = faceFresh && tracking.faceLandmarks?.length === 468
    ? TRAINING_FACE_INDICES.map(index => tracking.faceLandmarks[index]) : null;
  return {
    requestedAtMs: Math.max(0, now - startedAt), completedAtMs: Math.max(0, now - startedAt),
    handAgeMs, faceAgeMs,
    handResultAtMs: Number.isFinite(tracking?.handTime) ? tracking.handTime - startedAt : null,
    faceResultAtMs: Number.isFinite(tracking?.faceTime) ? tracking.faceTime - startedAt : null,
    sourceWidth: tracking?.sourceWidth || 0, sourceHeight: tracking?.sourceHeight || 0,
    left: handFresh ? points(tracking.leftHandLandmarks, 21) : null,
    right: handFresh ? points(tracking.rightHandLandmarks, 21) : null,
    face: points(face, TRAINING_FACE_INDICES.length),
  };
}

export function isTrackingSample(sample) {
  const validPoints = (value, count) => value === null || (Array.isArray(value) && value.length === count && value.every(p =>
    Array.isArray(p) && p.length === 3 && p.every(Number.isFinite)));
  return !!sample && Number.isFinite(sample.requestedAtMs) && sample.requestedAtMs >= 0 &&
    Number.isFinite(sample.completedAtMs) && sample.completedAtMs >= sample.requestedAtMs &&
    Number.isFinite(sample.sourceWidth) && Number.isFinite(sample.sourceHeight) &&
    sample.sourceWidth >= 0 && sample.sourceHeight >= 0 &&
    [sample.handAgeMs, sample.faceAgeMs, sample.handResultAtMs, sample.faceResultAtMs].every(v => v === null || Number.isFinite(v)) &&
    (!(sample.left || sample.right) || (Number.isFinite(sample.handAgeMs) && sample.handAgeMs >= 0 && Number.isFinite(sample.handResultAtMs))) &&
    (!sample.face || (Number.isFinite(sample.faceAgeMs) && sample.faceAgeMs >= 0 && Number.isFinite(sample.faceResultAtMs))) &&
    validPoints(sample.left, 21) && validPoints(sample.right, 21) && validPoints(sample.face, TRAINING_FACE_INDICES.length);
}

export function createTrainingCapture({ participantId, sessionId, samples, platform, frameSize, jpegQuality, source = "deafapp-camera", participantIdentity = "self-selected-local-profile", sourceUrl }) {
  const value = {
    version: 1, language: "csg", participantId, sessionId,
    participantIdentity, source, reviewStatus: "pending", ...(sourceUrl ? { sourceUrl } : {}),
    coordinateSystem: "normalized-unmirrored-video", faceIndices: [...TRAINING_FACE_INDICES],
    platform, frameSize, jpegQuality,
    alignment: "tracking-snapshot-at-photo-request-with-age", samples,
  };
  if (!isTrainingCapture(value, samples.length)) throw new Error("No se pudieron preparar los datos de la grabación.");
  return value;
}

export function isTrainingCapture(value, frameCount) {
  const sourceValid = value?.source === "deafapp-camera" && ["self-selected-local-profile", "anonymous-local-source"].includes(value.participantIdentity) ||
    value?.source === "public-reviewed-clip" && value.participantIdentity === "source-reviewed-participant" &&
    typeof value.sourceUrl === "string" && /^https:\/\//.test(value.sourceUrl);
  return !!value && value.version === 1 && value.language === "csg" &&
    typeof value.participantId === "string" && /^[\w-]{1,100}$/.test(value.participantId) &&
    typeof value.sessionId === "string" && /^[\w-]{1,100}$/.test(value.sessionId) &&
    sourceValid && value.reviewStatus === "pending" &&
    value.coordinateSystem === "normalized-unmirrored-video" && value.alignment === "tracking-snapshot-at-photo-request-with-age" &&
    JSON.stringify(value.faceIndices) === JSON.stringify(TRAINING_FACE_INDICES) &&
    ["web", "ios", "android"].includes(value.platform) &&
    value.jpegQuality > 0 && value.jpegQuality <= 1 &&
    value.frameSize?.width > 0 && value.frameSize?.height > 0 &&
    Number.isFinite(value.frameSize.width) && Number.isFinite(value.frameSize.height) &&
    Array.isArray(value.samples) && value.samples.length === frameCount && value.samples.every(isTrackingSample) &&
    value.samples.every((sample, index) => index === 0 || sample.requestedAtMs >= value.samples[index - 1].requestedAtMs);
}
