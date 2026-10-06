import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTrainingCapture, captureTrackingSample, TRAINING_FACE_INDICES } from '../trainingCapture.js';
import { prepareDataset, auditRecording, featureVector, augmentTrainingSample } from '../training/datasetPreparation.js';

function recording(person = 'friend', hash = 'a', label = 'hola', category = 'saludos') {
  const samples = Array.from({ length: 30 }, (_, i) => {
    const time = 1000 + i * 100;
    const face = Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.35, z: 0 }));
    face[234] = { x: 0.4, y: 0.35, z: 0 }; face[454] = { x: 0.6, y: 0.35, z: 0 };
    const hand = Array.from({ length: 21 }, (_, point) => ({ x: 0.2 + i / 200 + point / 500, y: 0.4 + point / 500, z: 0 }));
    return captureTrackingSample({ enabled: true, handTime: time - 10, faceTime: time - 20, leftHandLandmarks: hand, faceLandmarks: face, sourceWidth: 640, sourceHeight: 480 }, time, 1000);
  });
  const training = createTrainingCapture({ participantId: person, sessionId: 'session', samples, platform: 'web', frameSize: { width: 640, height: 480 }, jpegQuality: 0.15 });
  return { file: `${person}-${hash}.json`, contentHash: hash.repeat(64), serverReview: { approved: true }, recording: { recordingId: `${person}-${hash}`, language: 'csg', label, categoria: category, frames: Array.from({ length: 30 }, () => '/9j/AAAA=='), training } };
}

test('automatic browser codes are valid captures but never count as independent people', () => {
  const automatic = recording('browser-origin');
  automatic.recording.training.participantIdentity = 'anonymous-local-source';
  assert.deepEqual(auditRecording(automatic).reasons, ['unverified-participant-identity']);
  const prepared = prepareDataset([automatic]);
  assert.equal(prepared.report.declaredParticipants, 0);
  assert.equal(prepared.evaluation.length, 0);
  assert.ok(prepared.quarantine[0].reasons.includes('unverified-participant-identity'));
});
test('one person can prepare a prototype but never provides independent-person evaluation', () => {
  const result = prepareDataset([recording()]);
  assert.equal(result.report.acceptedRecordings, 1); assert.equal(result.report.declaredParticipants, 1);
  assert.equal(result.train.length, 5); assert.equal(result.evaluation.length, 0);
  assert.equal(result.report.evaluationStatus, 'needs-other-real-participants'); assert.equal(result.report.translatorReady, false);
  for (const variant of result.train) { assert.equal(variant.participantId, 'friend'); assert.equal(variant.parentHash, 'a'.repeat(64)); assert.equal(variant.features.length, 32); assert.equal(variant.features[0].length, 171); }
  assert.deepEqual(result.train.find(v => v.variant === 'original').features[0], result.train.find(v => v.variant === 'time-warp-0.85').features[0]);
  assert.notDeepEqual(result.train.find(v => v.variant === 'original').features[10], result.train.find(v => v.variant === 'time-warp-0.85').features[10]);
});
test('participant separation is global and every artificial variation stays on the training side', () => {
  const entries = [recording('person-a', 'a'), recording('person-b', 'b'), recording('person-a', 'c', 'gracias'), recording('person-b', 'd', 'gracias')];
  const result = prepareDataset(entries);
  const trainPeople = new Set(result.train.map(v => v.participantId));
  assert.ok(result.evaluation.every(v => !trainPeople.has(v.participantId) && v.variant === 'original'));
  assert.throws(() => augmentTrainingSample({ split: 'evaluation' }), /Solo/);
  const samePerson = prepareDataset(entries, { participantAliases: { 'person-b': 'person-a' } });
  assert.equal(samePerson.report.declaredParticipants, 1); assert.equal(samePerson.evaluation.length, 0);
});
test('unreviewed files, other languages, stale hands and repeated detections are quarantined', () => {
  const unreviewed = recording(); unreviewed.serverReview.approved = false;
  const other = recording('friend', 'b'); other.recording.language = 'asl';
  const stale = recording('friend', 'c'); stale.recording.training.samples.forEach(s => { s.handAgeMs = 300; });
  const frozen = recording('friend', 'd'); frozen.recording.training.samples.forEach(s => { s.handResultAtMs = -10; });
  const legacy = recording('friend', 'e'); delete legacy.recording.training;
  const result = prepareDataset([unreviewed, other, stale, frozen, legacy]);
  assert.equal(result.train.length, 0); assert.equal(result.quarantine.length, 5);
});
test('identical footage never increases samples or participants; conflicting labels quarantine both', () => {
  const result = prepareDataset([recording('person-a'), recording('person-b')]);
  assert.equal(result.report.acceptedRecordings, 1); assert.equal(result.report.declaredParticipants, 1);
  const conflict = prepareDataset([recording(), recording('friend', 'a', 'gracias')]);
  assert.equal(conflict.report.acceptedRecordings, 0); assert.equal(conflict.quarantine.length, 2);
});
test('papa in family and papa as food remain distinct training classes', () => {
  const result = prepareDataset([recording('person-a', 'a', 'papa', 'familia'), recording('person-a', 'b', 'papa', 'frutas_verduras')]);
  assert.equal(result.report.acceptedRecordings, 2);
  assert.ok(result.vocabulary.some(v => v.classId === 'familia/papa')); assert.ok(result.vocabulary.some(v => v.classId === 'frutas_verduras/papa'));
});
test('external LSCh clips require reviewed labels, participant provenance and explicit training rights', () => {
  const entry = recording();
  entry.recording.training.source = 'public-reviewed-clip';
  entry.recording.training.participantIdentity = 'source-reviewed-participant';
  entry.recording.training.sourceUrl = 'https://source.test/clip';
  assert.equal(auditRecording(entry).eligible, false);
  entry.externalReview = { approved: true, language: 'csg', reviewer: 'LSCh reviewer', reviewedAt: '2026-10-03', trainingAllowed: true,
    evidenceUrl: 'https://source.test/permission', license: 'CC-BY-4.0', sourceUrl: 'https://source.test/clip' };
  assert.equal(auditRecording(entry).eligible, true);
  entry.externalReview.trainingAllowed = false;
  assert.ok(auditRecording(entry).reasons.includes('external-training-rights-unverified'));
});
test('spatial features preserve hand location and are invariant to whole-frame translation and scale', () => {
  const sample = recording().recording.training.samples[10];
  const changed = structuredClone(sample);
  for (const group of ['left', 'right', 'face']) changed[group]?.forEach(p => { p[0] = p[0] * 0.8 + 0.05; p[1] = p[1] * 0.8 + 0.05; });
  const original = featureVector(sample), transformed = featureVector(changed);
  original.forEach((v, i) => assert.ok(Math.abs(v - transformed[i]) < 1e-10));
  assert.equal(original[169], 0); assert.equal(original.slice(42, 84).every(v => v === 0), true);
  sample.face[TRAINING_FACE_INDICES.indexOf(454)] = [...sample.face[TRAINING_FACE_INDICES.indexOf(234)]];
  assert.equal(featureVector(sample), null);
});
