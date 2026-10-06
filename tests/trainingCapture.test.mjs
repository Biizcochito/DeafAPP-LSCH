import assert from 'node:assert/strict';
import { test } from 'node:test';
import { captureTrackingSample, createTrainingCapture, isTrainingCapture, TRAINING_FACE_INDICES } from '../trainingCapture.js';
import { loadRecordingSource } from '../recordingSource.js';
const hand = () => Array.from({ length: 21 }, (_, i) => ({ x: 0.2 + i / 100, y: 0.4, z: 0 }));
const face = () => Array.from({ length: 468 }, (_, i) => ({ x: 0.3 + i / 1000, y: 0.3, z: 0 }));
const tracking = () => ({ enabled: true, handTime: 990, faceTime: 980, sourceWidth: 640, sourceHeight: 480, leftHandLandmarks: hand(), faceLandmarks: face() });

test('the snapshot retains anatomical sides and copies points without modifying the detector', () => {
  const value = tracking(), snapshot = captureTrackingSample(value, 1000, 950);
  assert.equal(snapshot.requestedAtMs, 50); assert.equal(snapshot.handAgeMs, 10);
  assert.equal(snapshot.left.length, 21); assert.equal(snapshot.right, null);
  assert.equal(snapshot.face.length, TRAINING_FACE_INDICES.length);
  const x = snapshot.left[0][0]; value.leftHandLandmarks[0].x = 9;
  assert.equal(snapshot.left[0][0], x);
});
test('old, future, disabled and untimed detections are never saved as fresh points', () => {
  for (const change of [{ handTime: 0, faceTime: 0 }, { handTime: 1100, faceTime: 1100 }, { enabled: false }, { handTime: undefined, faceTime: undefined }]) {
    const snapshot = captureTrackingSample({ ...tracking(), ...change }, 1000, 950);
    assert.equal(snapshot.left, null); assert.equal(snapshot.face, null);
  }
});
test('metadata requires the same number of timed observations as recorded images', () => {
  const sample = captureTrackingSample(tracking(), 1000, 950);
  const metadata = createTrainingCapture({ participantId: 'one-real-person', sessionId: 'session-1', samples: [sample], platform: 'web', frameSize: { width: 640, height: 480 }, jpegQuality: 0.15 });
  assert.equal(isTrainingCapture(metadata, 1), true); assert.equal(isTrainingCapture(metadata, 2), false);
  assert.equal(isTrainingCapture({ ...metadata, language: 'asl' }, 1), false);
  assert.equal(isTrainingCapture({ ...metadata, samples: [{ ...sample, completedAtMs: 0 }] }, 1), false);
  assert.equal(isTrainingCapture({ ...metadata, participantId: '../other' }, 1), false);
});

test('automatic origin keeps the selected legacy code and survives a reload without choosing a person', async () => {
  let saved = { version: 1, selectedId: 'original-b', profiles: [{ id: 'original-a', name: 'Persona 1' }, { id: 'original-b', name: 'Persona 2' }] };
  const store = { load: async () => structuredClone(saved), save: async value => { saved = structuredClone(value); } };
  const first = await loadRecordingSource(store, () => { throw new Error('Must reuse existing origin'); });
  assert.equal(first.id, 'original-b'); assert.equal(first.participantIdentity, 'anonymous-local-source');
  assert.equal(saved.version, 2); assert.equal(saved.profiles.length, 2);
  const reloaded = await loadRecordingSource(store, () => { throw new Error('Must remain stable'); });
  assert.deepEqual(reloaded, first);
});

test('blocked or malformed local storage still supplies a usable anonymous origin', async () => {
  const unavailable = { load: async () => { throw new Error('Storage blocked'); }, save: async () => { throw new Error('Storage blocked'); } };
  assert.deepEqual(await loadRecordingSource(unavailable, () => 'temporary-origin'), {
    id: 'temporary-origin', participantIdentity: 'anonymous-local-source', persistent: false,
  });
  let stored;
  const malformed = { load: async () => ({ version: 2, sourceId: '../invalid' }), save: async value => { stored = value; } };
  assert.equal((await loadRecordingSource(malformed, () => 'new-origin')).id, 'new-origin');
  assert.equal(stored.sourceId, 'new-origin');
  const training = createTrainingCapture({ participantId: 'temporary-origin', participantIdentity: 'anonymous-local-source', sessionId: 'session',
    samples: [captureTrackingSample(tracking(), 1000, 950)], platform: 'web', frameSize: { width: 640, height: 480 }, jpegQuality: 0.15 });
  assert.equal(isTrainingCapture(training, 1), true);
});
