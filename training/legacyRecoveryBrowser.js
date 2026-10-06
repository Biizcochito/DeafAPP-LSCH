import { createSignTracker } from '../landmarkTracking.js';
import { withTrackingTimeout } from '../trackingOverlay.js';
import { listApprovedRows } from './browserDataset.js';
import { inspectLegacyRecording, recoverFrameObservation, summarizeRecovery, validateRecoveredItem, LEGACY_RECOVERY_VERSION } from './legacyRecovery.js';

export async function downloadApprovedRecording(client, row) {
  if (typeof row.path !== 'string' || row.path.includes('..') || !row.path.endsWith('.json')) throw new Error('Ruta de grabación no válida.');
  const { data, error } = await client.storage.from('contribuciones').download(row.path);
  if (error || !data || data.size > 25_000_000) throw new Error('No se pudo abrir la grabación aprobada.');
  return JSON.parse(await data.text());
}
function imageFromFrame(frame) {
  return new Promise((resolve, reject) => {
    const image = new Image(), timer = setTimeout(() => reject(new Error('No se pudo decodificar una imagen.')), 10000);
    image.onload = () => { clearTimeout(timer); resolve(image); };
    image.onerror = () => { clearTimeout(timer); reject(new Error('La imagen está dañada.')); };
    image.src = frame;
  });
}
export function currentRecovery(item, row) {
  if (item.version !== LEGACY_RECOVERY_VERSION || item.sourceVersion !== row.version || item.sourcePath !== row.path || item.sourceClassId !== `${row.category}/${row.label}`) return false;
  try { validateRecoveredItem(item); return true; } catch { return false; }
}
export async function recoverApprovedLegacy({ api, session, client, store, signal, onProgress = () => {}, onItem = () => {}, detectorFactory = createSignTracker, decodeImage = imageFromFrame }) {
  const check = () => { if (signal?.aborted) throw new Error('Recuperación cancelada. Se conserva lo que ya terminó.'); };
  const rows = await listApprovedRows(api, session, signal), cached = new Map((await store.all()).map(item => [String(item.id), item]));
  let tracker, result, processed = 0, reused = 0, failed = 0;
  try {
    for (const [index, row] of rows.entries()) {
      check();const saved = cached.get(String(row.id));
      if (saved && currentRecovery(saved, row)) { reused++;onItem(saved);onProgress({ index: index + 1, total: rows.length, text: `Recuperación guardada: ${index + 1}/${rows.length}.` });continue; }
      try {
        onProgress({ index: index + 1, total: rows.length, text: `Abriendo ${row.label}, #${row.id} (${index + 1}/${rows.length})…` });
        const recording = await downloadApprovedRecording(client, row);check();
        const source = inspectLegacyRecording(recording, row), observations = [];
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(recording.frames)));
        const parentHash = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
        if (!tracker) {
          onProgress({ index: index + 1, total: rows.length, text: 'Cargando los detectores para recuperar las imágenes guardadas…' });
          try { tracker = await detectorFactory(); }
          catch (cause) { const error = new Error(`No se pudo iniciar la recuperación: ${cause.message}`);error.name = 'RecoveryDetectorError';throw error; }
          tracker.onResults(value => { result = value; });check();
        }
        try { await withTrackingTimeout(tracker.resetSequence(), 10000); }
        catch (cause) { const error = new Error(`El detector necesita reiniciarse: ${cause.message}`);error.name = 'RecoveryDetectorError';throw error; }
        for (const [frameIndex, frame] of source.frames.entries()) {
          check();onProgress({ index: index + 1, total: rows.length, text: `${row.label}, #${row.id}: imagen ${frameIndex + 1}/${source.frames.length} · grabación ${index + 1}/${rows.length}.` });
          const image = await decodeImage(frame);check();result = null;
          try { await withTrackingTimeout(tracker.send({ image }), 45000); }
          catch (cause) { const error = new Error(`La recuperación se detuvo para reiniciar el detector: ${cause.message}`);error.name = 'RecoveryDetectorError';throw error; }
          check();
          observations.push(recoverFrameObservation(result, frameIndex, image.naturalWidth, image.naturalHeight));image.src = '';
        }
        const item = { version: LEGACY_RECOVERY_VERSION, id: String(row.id), sourceVersion: row.version, sourcePath: row.path, sourceClassId: source.sourceClassId,
          originalLabel: row.label, originalCategory: row.category, parentHash, intervalMs: source.intervalMs,
          classId: source.classId, labelReviewed: !!source.classId, labelReviewBasis: source.classId ? 'existing-server-approval-exact-vocabulary' : 'needs-admin-correction',
          participantId: null, participantIdentity: 'unknown', recoveredAt: new Date().toISOString(), observations, quality: summarizeRecovery(observations) };
        await store.put(item);processed++;onItem(item);
      } catch (error) {
        check();if (error?.code === 'session_expired' || error?.name === 'RecoveryDetectorError') throw error;
        failed++;const item = { id: String(row.id), sourceVersion: row.version, sourcePath: row.path, sourceClassId: `${row.category}/${row.label}`,
          originalLabel: row.label, originalCategory: row.category, error: error.message, recoveredAt: new Date().toISOString() };
        await store.put(item);onItem(item);
      }
    }
    await api.overview(session);check();return { total: rows.length, processed, reused, failed };
  } finally { if (tracker) {tracker.onResults(() => {});await withTrackingTimeout(tracker.close(), 5000).catch(() => {});} }
}
