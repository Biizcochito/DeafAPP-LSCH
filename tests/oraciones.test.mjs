import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIAS, ORACIONES } from '../signCatalog.js';
import { captureTrackingSample, createTrainingCapture } from '../trainingCapture.js';
import { createRecordingDraft, submitRecordingDraft } from '../recordingSubmission.js';
import { auditRecording, prepareDataset } from '../training/datasetPreparation.js';

function capture() {
  const samples = Array.from({ length: 30 }, (_, index) => {
    const time = 1000 + index * 100;
    const face = Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.35, z: 0 }));
    face[234].x = 0.4; face[454].x = 0.6;
    const hand = Array.from({ length: 21 }, (_, point) => ({ x: 0.2 + index / 200 + point / 500, y: 0.4 + point / 500, z: 0 }));
    return captureTrackingSample({ enabled: true, handTime: time - 10, faceTime: time - 20,
      leftHandLandmarks: hand, faceLandmarks: face, sourceWidth: 640, sourceHeight: 480 }, time, 1000);
  });
  return createTrainingCapture({ participantId: 'person-a', sessionId: 'session', samples,
    platform: 'web', frameSize: { width: 640, height: 480 }, jpegQuality: 0.15 });
}

test('el catálogo incluye diez oraciones breves con etiquetas únicas y estables', () => {
  assert.equal(CATEGORIAS.filter(category => category.id === 'oraciones').length, 1);
  assert.equal(ORACIONES.señas.length, 10);
  assert.equal(new Set(ORACIONES.señas).size, 10);
  for (const label of ORACIONES.señas) {
    assert.equal(label, label.trim().toLowerCase());
    assert.ok(label.split(' ').length >= 2 && label.split(' ').length <= 3);
    assert.ok(!/[\\/]/.test(label));
  }
});

test('las diez oraciones conservan el JSON de captura, el registro y la preparación de entrenamiento', async () => {
  const entries = [];
  for (const [index, label] of ORACIONES.señas.entries()) {
    const draft = createRecordingDraft({ category: ORACIONES.id, label, id: `phrase-${index}`,
      frames: Array(30).fill('/9j/AAAA=='), intervalMs: 100, training: capture() });
    let payload;
    let registration;
    let uploaded;
    const client = {
      from: table => {
        assert.equal(table, 'grabaciones');
        return {
          select: () => ({ eq: (column, path) => {
            assert.equal(column, 'archivo_path'); assert.equal(path, draft.storagePath);
            return { limit: async () => ({ data: [], error: null }) };
          } }),
          insert: async row => { registration = row; return { error: null }; },
        };
      },
      storage: { from: bucket => {
        assert.equal(bucket, 'contribuciones');
        return { upload: async (path, blob, options) => {
          assert.equal(path, `oraciones/${label}/${label}_phrase-${index}.json`);
          assert.equal(options.upsert, false);
          payload = JSON.parse(await blob.text());
          return { error: null };
        } };
      } },
    };
    await submitRecordingDraft({ draft, client, onUploaded: async value => { uploaded = value; } });
    assert.equal(uploaded.uploaded, true);
    assert.deepEqual(registration, { label, categoria: 'oraciones', archivo_path: draft.storagePath });
    assert.equal(payload.schemaVersion, 2);
    assert.equal(payload.language, 'csg');
    assert.equal(payload.label, label);
    assert.equal(payload.categoria, 'oraciones');
    assert.equal(payload.n_frames, 30);
    assert.equal(payload.training.samples.length, 30);
    const entry = { file: draft.storagePath, contentHash: String(index).repeat(64), recording: payload,
      serverReview: { approved: true } };
    assert.equal(auditRecording(entry).eligible, true);
    assert.ok(auditRecording({ ...entry, serverReview: { approved: false } }).reasons.includes('not-approved'));
    entries.push(entry);
  }
  const dataset = prepareDataset(entries);
  assert.equal(dataset.report.acceptedRecordings, 10);
  assert.equal(dataset.quarantine.length, 0);
  for (const label of ORACIONES.señas) {
    assert.ok(dataset.train.some(sample => sample.classId === `oraciones/${label}`));
  }
});
