import { CATEGORIAS } from "../signCatalog.js";
import { isTrainingCapture, TRAINING_FACE_INDICES } from "../trainingCapture.js";
import { safeSourceUrl } from "./sourceCatalog.js";

export const TARGET_SIGNS = CATEGORIAS.flatMap(category => category.señas.map(label => ({
  classId: `${category.id}/${label}`, category: category.id, label,
})));
const targets = new Map(TARGET_SIGNS.map(sign => [sign.classId, sign]));
export const FEATURE_LAYOUT = { version: 1, dimensions: 171, hands: ["anatomical-left", "anatomical-right"], faceIndices: TRAINING_FACE_INDICES, coordinates: "2d-face-relative-with-source-aspect", masks: ["left", "right", "face"], poseIncluded: false };

export function auditRecording(entry) {
  const recording = entry?.recording || {};
  const classId = `${recording.categoria}/${recording.label}`;
  const reasons = [];
  if (!targets.has(classId)) reasons.push("unknown-label-or-category");
  if (recording.training?.source === "public-reviewed-clip") {
    const review = entry.externalReview;
    if (review?.approved !== true || review.language !== "csg" || typeof review.reviewer !== "string" || !review.reviewer.trim() ||
      !Number.isFinite(Date.parse(review.reviewedAt))) reasons.push("not-reviewed-external-clip");
    if (review?.trainingAllowed !== true || !safeSourceUrl(review.evidenceUrl) || !review.license || review.sourceUrl !== recording.training.sourceUrl ||
      !safeSourceUrl(review.sourceUrl)) reasons.push("external-training-rights-unverified");
  } else if (entry?.serverReview?.approved !== true) reasons.push("not-approved");
  if (recording.language != null && recording.language !== "csg") reasons.push("not-lsch");
  if (!Array.isArray(recording.frames) || recording.frames.length < 12 || recording.frames.length > 120 ||
    !recording.frames.every(frame => typeof frame === "string" && /^(?:data:image\/jpeg;base64,)?\/9j\/[A-Za-z0-9+/=\s]+$/.test(frame))) reasons.push("invalid-jpeg-sequence");
  if (!isTrainingCapture(recording.training, recording.frames?.length)) reasons.push("missing-or-invalid-training-metadata");
  if (recording.training?.participantIdentity === "anonymous-local-source") reasons.push("unverified-participant-identity");
  if (reasons.length) return { eligible: false, classId, reasons };
  const samples = recording.training.samples;
  const validHands = samples.filter(s => (s.left || s.right) && Number.isFinite(s.handAgeMs) && s.handAgeMs >= 0 && s.handAgeMs <= 200);
  const validFace = samples.filter(s => s.face && Number.isFinite(s.faceAgeMs) && s.faceAgeMs >= 0 && s.faceAgeMs <= 350);
  if (validHands.length / samples.length < 0.8) reasons.push("insufficient-fresh-hands");
  if (validFace.length / samples.length < 0.8) reasons.push("insufficient-fresh-face");
  if (new Set(validHands.map(s => s.handResultAtMs)).size < Math.max(3, Math.ceil(samples.length * 0.2))) reasons.push("too-few-distinct-hand-results");
  if (samples.at(-1).requestedAtMs - samples[0].requestedAtMs < 500) reasons.push("sequence-too-short");
  if (!samples.every(s => s.sourceWidth > 0 && s.sourceHeight > 0)) reasons.push("missing-video-dimensions");
  return { eligible: reasons.length === 0, classId, reasons };
}

export function featureVector(sample) {
  const aspect = sample.sourceWidth / sample.sourceHeight;
  const face = sample.face;
  // Anchors preserve hand location relative to the face, unlike centering each hand.
  const nose = face?.[TRAINING_FACE_INDICES.indexOf(1)];
  const a = face?.[TRAINING_FACE_INDICES.indexOf(234)];
  const b = face?.[TRAINING_FACE_INDICES.indexOf(454)];
  const scale = a && b ? Math.hypot((a[0] - b[0]) * aspect, a[1] - b[1]) : 0;
  if (!nose || scale < 0.02) return null;
  const groups = [sample.handAgeMs >= 0 && sample.handAgeMs <= 200 ? sample.left : null,
    sample.handAgeMs >= 0 && sample.handAgeMs <= 200 ? sample.right : null, face];
  const vector = [];
  for (let i = 0; i < groups.length; i++) {
    for (let index = 0; index < (i === 2 ? TRAINING_FACE_INDICES.length : 21); index++) {
      const point = groups[i]?.[index];
      vector.push(point ? (point[0] - nose[0]) * aspect / scale : 0, point ? (point[1] - nose[1]) / scale : 0);
    }
  }
  vector.push(...groups.map(group => Number(!!group)));
  return vector.every(Number.isFinite) ? vector : null;
}

export function resampleFeatures(samples, length = 32, exponent = 1) {
  const start = samples[0].timeMs, duration = samples.at(-1).timeMs - start;
  if (!(duration > 0) || samples.length < 2 || length < 2) throw new Error("Secuencia sin tiempos válidos.");
  let cursor = 0;
  return Array.from({ length }, (_, index) => {
    const time = start + duration * Math.pow(index / (length - 1), exponent);
    while (cursor + 1 < samples.length - 1 && samples[cursor + 1].timeMs < time) cursor++;
    const left = samples[cursor], right = samples[cursor + 1];
    const fraction = right.timeMs > left.timeMs ? Math.max(0, Math.min(1, (time - left.timeMs) / (right.timeMs - left.timeMs))) : 0;
    const masks = [168, 169, 170].map(i => (fraction < 0.5 ? left : right).vector[i]);
    return left.vector.map((value, i) => {
      if (i >= 168) return masks[i - 168];
      const group = i < 42 ? 0 : i < 84 ? 1 : 2;
      if (!masks[group]) return 0;
      if (!left.vector[168 + group] || !right.vector[168 + group]) return (fraction < 0.5 ? left : right).vector[i];
      return Math.round((value + (right.vector[i] - value) * fraction) * 100000) / 100000;
    });
  });
}

// All derivatives retain the original participant and parent recording.
// They must be created after splitting; none are independent validation examples.
export function augmentTrainingSample(sample) {
  if (sample.split !== "train") throw new Error("Solo se aumenta el conjunto de entrenamiento.");
  const observations = sample.observations;
  const original = { ...sample, variant: "original", features: resampleFeatures(observations) };
  const variants = [original];
  for (const exponent of [0.85, 1.15]) variants.push({ ...sample, variant: `time-warp-${exponent}`, features: resampleFeatures(observations, 32, exponent) });
  for (const degrees of [-3, 3]) {
    const angle = degrees * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
    const features = original.features.map(vector => {
      const values = [...vector];
      for (let i = 0; i < 168; i += 2) { values[i] = vector[i] * cos - vector[i + 1] * sin; values[i + 1] = vector[i] * sin + vector[i + 1] * cos; }
      return values;
    });
    variants.push({ ...sample, variant: `camera-tilt-${degrees}`, features });
  }
  return variants.map(({ observations: _observations, ...value }) => value);
}

export function prepareDataset(entries, { participantAliases = {} } = {}) {
  const accepted = [], quarantine = [], hashes = new Map();
  const report = { version: 1, targetClasses: TARGET_SIGNS.length, inputRecordings: entries.length, acceptedRecordings: 0,
    declaredParticipants: 0, trainingVariants: 0, evaluationRecordings: 0, evaluationStatus: "unavailable", translatorReady: false,
    notes: ["La cantidad de aumentos no representa personas nuevas.", "Los perfiles son declarados y requieren comprobar que identifican personas diferentes.", "Este proceso prepara datos; no entrena ni publica un traductor."] };
  for (const entry of entries) {
    const audit = auditRecording(entry);
    if (!audit.eligible) { quarantine.push({ file: entry.file, classId: audit.classId, reasons: audit.reasons }); continue; }
    const contentHash = entry.contentHash;
    if (typeof contentHash !== "string" || !/^[a-f0-9]{64}$/.test(contentHash)) { quarantine.push({ file: entry.file, classId: audit.classId, reasons: ["missing-content-hash"] }); continue; }
    if (!hashes.has(contentHash)) hashes.set(contentHash, []);
    hashes.get(contentHash).push({ entry, audit });
  }
  for (const group of hashes.values()) {
    if (new Set(group.map(item => item.audit.classId)).size > 1) {
      for (const item of group) quarantine.push({ file: item.entry.file, classId: item.audit.classId, reasons: ["duplicate-content-with-conflicting-labels"] });
      continue;
    }
    const { entry, audit } = group[0], recording = entry.recording;
    for (const item of group.slice(1)) quarantine.push({ file: item.entry.file, classId: item.audit.classId, reasons: ["duplicate-content"] });
    const observations = recording.training.samples.filter(sample => sample.face && sample.faceAgeMs >= 0 && sample.faceAgeMs <= 350)
      .map(sample => ({ timeMs: sample.requestedAtMs, vector: featureVector(sample) })).filter(sample => sample.vector);
    if (observations.length < 12 || observations.at(-1).timeMs - observations[0].timeMs < 500) {
      quarantine.push({ file: entry.file, classId: audit.classId, reasons: ["insufficient-valid-face-anchors"] }); continue;
    }
    const originalId = recording.training.participantId;
    const participantId = participantAliases[originalId] || originalId;
    accepted.push({ classId: audit.classId, participantId, recordingId: recording.recordingId || entry.contentHash,
      parentHash: entry.contentHash, sessionId: recording.training.sessionId, file: entry.file, observations });
  }
  const people = [...new Set(accepted.map(sample => sample.participantId))].sort();
  // A single global participant split prevents the same person appearing in both sets for different signs.
  const heldOut = new Set(people.length >= 2 ? people.slice(-Math.max(1, Math.floor(people.length * 0.2))) : []);
  const train = [], evaluation = [];
  for (const sample of accepted) {
    if (heldOut.has(sample.participantId)) {
      const { observations, ...rest } = sample;
      evaluation.push({ ...rest, split: "evaluation", variant: "original", features: resampleFeatures(observations) });
    } else train.push(...augmentTrainingSample({ ...sample, split: "train" }));
  }
  report.acceptedRecordings = accepted.length;
  report.declaredParticipants = people.length;
  report.trainingVariants = train.length;
  report.evaluationRecordings = evaluation.length;
  report.evaluationStatus = people.length < 2 ? "needs-other-real-participants" : "provisional-participant-split-needs-identity-review";
  report.classes = TARGET_SIGNS.map(sign => {
    const samples = accepted.filter(sample => sample.classId === sign.classId);
    const trainingPeople = new Set(samples.filter(sample => !heldOut.has(sample.participantId)).map(sample => sample.participantId));
    const evaluationPeople = new Set(samples.filter(sample => heldOut.has(sample.participantId)).map(sample => sample.participantId));
    return { ...sign, recordings: samples.length, declaredParticipants: new Set(samples.map(sample => sample.participantId)).size,
      trainingParticipants: trainingPeople.size, evaluationParticipants: evaluationPeople.size,
      status: !samples.length ? "needs-reviewed-samples" : !evaluationPeople.size ? "needs-independent-evaluation" : !trainingPeople.size ? "needs-training-participants" : "provisional-data-available" };
  });
  return { report, quarantine, train, evaluation, vocabulary: TARGET_SIGNS, featureLayout: FEATURE_LAYOUT };
}
