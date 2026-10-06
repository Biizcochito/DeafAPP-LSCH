import { frameDataUri } from '../adminClient.js';
import { FEATURE_LAYOUT, TARGET_SIGNS, featureVector, resampleFeatures, augmentTrainingSample } from './datasetPreparation.js';
import { TRAINING_FACE_INDICES } from '../trainingCapture.js';

const targets = new Set(TARGET_SIGNS.map(sign => sign.classId));
export const LEGACY_FEATURE_LAYOUT = { ...FEATURE_LAYOUT, version: 2, hands: ['frame-left-tracked', 'frame-right-tracked'], temporalBasis: 'normalized-frame-order', orientation: 'as-stored-unverified' };
export const LEGACY_RECOVERY_VERSION = 1;
export function inspectLegacyRecording(recording, row) {
  if (!row || !Number.isInteger(row.version) || recording?.label !== row.label || recording.categoria != null && recording.categoria !== row.category)
    throw new Error('La etiqueta del archivo no coincide con su aprobación.');
  if (!Array.isArray(recording.frames) || recording.frames.length < 12 || recording.frames.length > 120)
    throw new Error('La secuencia necesita entre 12 y 120 imágenes para esta recuperación.');
  const frames = recording.frames.map(frameDataUri);
  if (frames.some(frame => !frame)) throw new Error('Hay imágenes con un formato que no se puede recuperar.');
  const sourceClassId = `${row.category}/${row.label}`;
  return { frames, sourceClassId, classId: targets.has(sourceClassId) ? sourceClassId : null,
    intervalMs: Number.isFinite(recording.intervalMs) && recording.intervalMs > 0 && recording.intervalMs <= 2000 ? recording.intervalMs : null };
}

const points = (values, count) => values?.length === count && values.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))
  ? values.map(point => [point.x, point.y, Number.isFinite(point.z) ? point.z : 0]) : null;
export function recoverFrameObservation(result, frameIndex, width, height) {
  const face = result?.faceLandmarks?.length === 468 ? points(TRAINING_FACE_INDICES.map(index => result.faceLandmarks[index]), TRAINING_FACE_INDICES.length) : null;
  // Live tracking swaps anatomical labels for raw camera pixels. Old files have
  // no reliable mirror flag, so this format explicitly retains image-side slots.
  const left = points(result?.rightHandLandmarks, 21), right = points(result?.leftHandLandmarks, 21);
  const vector = face ? featureVector({ sourceWidth: width, sourceHeight: height, face, left, right, handAgeMs: 0 }) : null;
  return { frameIndex, width, height, face: !!face, hands: Number(!!left) + Number(!!right), vector };
}

export function summarizeRecovery(observations) {
  const total = observations.length, faces = observations.filter(frame => frame.vector).length;
  const hands = observations.filter(frame => frame.hands > 0).length;
  const reasons = [];
  if (total < 12 || faces < 12 || faces / total < 0.8) reasons.push('insufficient-recovered-face');
  if (hands / total < 0.5) reasons.push('insufficient-recovered-hands');
  return { totalFrames: total, faceFrames: faces, handFrames: hands, usable: reasons.length === 0, reasons };
}

export function validateRecoveredItem(item) {
  if (!item || item.version !== LEGACY_RECOVERY_VERSION || !/^\d+$/.test(String(item.id)) || !Number.isInteger(item.sourceVersion) || item.sourceVersion < 0 ||
    !/^[a-f0-9]{64}$/.test(item.parentHash) || !Array.isArray(item.observations) || item.observations.length < 12 || item.observations.length > 120 ||
    item.observations.some((frame, index) => frame.frameIndex !== index || !Number.isFinite(frame.width) || !Number.isFinite(frame.height) || frame.width <= 0 || frame.height <= 0 ||
      !Number.isInteger(frame.hands) || frame.hands < 0 || frame.hands > 2 || frame.vector !== null && (!Array.isArray(frame.vector) || frame.vector.length !== 171 ||
      frame.vector.some(n => !Number.isFinite(n) || Math.abs(n) > 50) || frame.vector[170] !== 1 || ![frame.vector[168], frame.vector[169]].every(n => n === 0 || n === 1) || frame.vector[168] + frame.vector[169] !== frame.hands)))
    throw new Error('La recuperación no contiene puntos válidos.');
  if (item.classId !== null && !targets.has(item.classId)) throw new Error('La seña corregida no pertenece al vocabulario.');
  if (item.participantId != null && (typeof item.participantId !== 'string' || !/^[\w-]{1,100}$/.test(item.participantId)))
    throw new Error('Usa un código de participante sin nombres, espacios ni caracteres especiales.');
  return item;
}

export function preparePersonalPrototype(items) {
  const originals = [], quarantine = [], byHash = new Map();
  for (const item of items) {
    validateRecoveredItem(item);
    const quality = summarizeRecovery(item.observations);
    if (!item.classId || !item.labelReviewed || !quality.usable) {
      quarantine.push({ file: String(item.id), classId: item.classId || item.sourceClassId, reasons: [...(!item.classId || !item.labelReviewed ? ['needs-legacy-label-review'] : []), ...quality.reasons] }); continue;
    }
    if (!byHash.has(item.parentHash)) byHash.set(item.parentHash, []);
    byHash.get(item.parentHash).push(item);
  }
  for (const group of byHash.values()) {
    if (new Set(group.map(item => item.classId)).size > 1) {
      group.forEach(item => quarantine.push({ file: String(item.id), classId: item.classId, reasons: ['duplicate-content-with-conflicting-labels'] })); continue;
    }
    const item = group[0];
    group.slice(1).forEach(duplicate => quarantine.push({ file: String(duplicate.id), classId: duplicate.classId, reasons: ['duplicate-content'] }));
    const observations = item.observations.filter(frame => frame.vector).map(frame => ({ timeMs: frame.frameIndex, vector: frame.vector }));
    // frameIndex is only an interpolation coordinate. It is never persisted or
    // reported as a recovered capture timestamp or actual movement speed.
    originals.push({ classId: item.classId, parentHash: item.parentHash, participantId: item.participantId || 'legacy-unknown-origin',
      participantIdentity: item.participantId ? 'admin-declared' : 'unknown', recordingId: `legacy-${item.id}`, file: String(item.id), observations,
      timingBasis: item.intervalMs ? 'stored-nominal-interval-not-capture-timestamps' : 'frame-order-only' });
  }
  const heldOut = new Set();
  for (const classId of new Set(originals.map(item => item.classId))) {
    const group = originals.filter(item => item.classId === classId).sort((a, b) => a.parentHash.localeCompare(b.parentHash));
    if (group.length >= 2) heldOut.add(group.at(-1).parentHash);
  }
  const train = [], evaluation = [];
  for (const original of originals) {
    if (heldOut.has(original.parentHash)) {
      const { observations, ...metadata } = original;
      evaluation.push({ ...metadata, split: 'evaluation', variant: 'original', features: resampleFeatures(observations) });
    } else train.push(...augmentTrainingSample({ ...original, split: 'train' }));
  }
  const used = new Set(originals.map(item => item.file));
  return { mode: 'personal-prototype', featureLayout: LEGACY_FEATURE_LAYOUT, train, evaluation, quarantine,
    report: { inputRecordings: items.length, acceptedRecordings: originals.length, declaredParticipants: new Set(originals.filter(item => item.participantIdentity !== 'unknown').map(item => item.participantId)).size,
      unknownParticipantRecordings: originals.filter(item => item.participantIdentity === 'unknown').length, evaluationStatus: 'different-recordings-not-independent-people', translatorReady: false },
    reviewSnapshot: items.filter(item => used.has(String(item.id))).map(item => ({ id: String(item.id), version: item.sourceVersion })),
    approvedCounts: items.reduce((counts, item) => { const id = item.classId || item.sourceClassId; counts[id] = (counts[id] || 0) + 1; return counts; }, {}) };
}
