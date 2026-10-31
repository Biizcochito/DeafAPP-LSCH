import { createHash } from 'node:crypto';
import { catalogueSeed, createCatalogueResolver } from '../../src/training/recognitionCatalog.js';

export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const MAX_OBJECT_BYTES = 40_000_000;
export const BATCH_BYTES = 100_000_000;
export function validPath(path) {
  return typeof path === 'string' && path.length <= 512 && path.endsWith('.json') &&
    !/[\\\u0000-\u001f%?#]/.test(path) && path.split('/').length === 3 &&
    path.split('/').every(part => part && part !== '.' && part !== '..');
}
const summary = items => ({ count: items.length, bytes: items.reduce((sum, item) => sum + item.bytes, 0) });
export const planDigest = plan => sha256(JSON.stringify({ ...plan, digest: undefined }));

// Absence from the live manifest means neither collection nor recognition is
// enabled. Unknown labels stay aside until an administrator resolves them.
export function buildMigrationPlan(inventory, manifest, now = new Date().toISOString()) {
  if (inventory.errors?.length || !Array.isArray(inventory.rows) || !Array.isArray(inventory.objects) ||
      !manifest?.ok || !Array.isArray(manifest.catalogue) || typeof manifest.revision !== 'string') {
    throw Error('El inventario o el catálogo están incompletos.');
  }
  const catalogue = [...new Map([...catalogueSeed(), ...manifest.catalogue].map(row => [row.classId, row])).values()];
  const resolveClass = createCatalogueResolver(catalogue);
  const protectedClasses = new Set(manifest.catalogue.map(row => resolveClass(row.classId)));
  const byPath = new Map();
  for (const row of inventory.rows) {
    const rows = byPath.get(row.archivo_path) || []; rows.push(row); byPath.set(row.archivo_path, rows);
  }
  const inactive = [], active = [], excluded = [];
  const objectPaths = new Set();
  for (const object of inventory.objects) {
    if (objectPaths.has(object.path)) throw Error('El inventario contiene rutas duplicadas.');
    objectPaths.add(object.path);
    const rows = byPath.get(object.path) || [], row = rows[0], bytes = Number(object.metadata?.size);
    let reason;
    if (object.path.startsWith('drive/')) reason = 'friend-import-awaiting-separate-cleanup';
    else if (!validPath(object.path)) reason = 'not-a-recording-json-or-unsafe-path';
    else if (rows.length !== 1) reason = rows.length ? 'ambiguous-database-link' : 'no-database-link';
    else if (row.aprobada !== true || row.moderation_status !== 'approved') reason = 'not-approved';
    else if (!Number.isInteger(row.moderation_version) || !Number.isSafeInteger(bytes) || bytes <= 0 || bytes > MAX_OBJECT_BYTES ||
      !object.id || !object.updated_at || !object.metadata?.eTag) reason = 'incomplete-or-oversized-metadata';
    const classId = row && resolveClass(`${row.categoria}/${row.label}`);
    if (!reason && !classId) reason = 'unknown-class-needs-review';
    if (reason) { excluded.push({ path: object.path, bytes: bytes || 0, reason }); continue; }
    const item = { path: object.path, bytes, sourceId: String(row.id), sourceVersion: row.moderation_version,
      label: row.label, category: row.categoria, classId, objectId: object.id, objectVersion: object.version ?? null,
      updatedAt: object.updated_at, etag: object.metadata.eTag };
    (protectedClasses.has(classId) ? active : inactive).push(item);
  }
  // Three small files from different signs exercise the route before large copies.
  const pilot = [], seenClasses = new Set();
  for (const item of [...inactive].sort((a, b) => a.bytes - b.bytes || a.path.localeCompare(b.path))) {
    if (item.bytes > 2_000_000 || seenClasses.has(item.classId)) continue;
    pilot.push(item); seenClasses.add(item.classId); if (pilot.length === 3) break;
  }
  const pilotPaths = new Set(pilot.map(item => item.path));
  const batches = pilot.length ? [{ id: 'pilot', purpose: 'copy-and-verify-only', items: pilot, ...summary(pilot) }] : [];
  for (const [prefix, values] of [['inactive', inactive.filter(item => !pilotPaths.has(item.path))], ['active-last', active]]) {
    let batch;
    for (const item of [...values].sort((a, b) => b.bytes - a.bytes || a.path.localeCompare(b.path))) {
      if (!batch || batch.bytes + item.bytes > BATCH_BYTES) {
        batch = { id: `${prefix}-${batches.filter(value => value.id.startsWith(prefix)).length + 1}`,
          purpose: prefix === 'active-last' ? 'defer-until-runtime-tests' : 'copy-after-pilot', items: [], count: 0, bytes: 0 };
        batches.push(batch);
      }
      batch.items.push(item); batch.count++; batch.bytes += item.bytes;
    }
  }
  const categories = [...new Set(inactive.map(item => item.category))].map(category => ({ category,
    ...summary(inactive.filter(item => item.category === category)) })).sort((a, b) => b.bytes - a.bytes);
  const plan = { version: 1, createdAt: now, inventoryAt: inventory.checkedAt, project: inventory.project,
    sourceBucket: 'contribuciones', catalogueRevision: manifest.revision,
    mode: 'copy-only', changesDatabase: false, deletesSource: false,
    totals: { all: summary(inventory.objects.map(item => ({ bytes: Number(item.metadata?.size) || 0 }))),
      inactive: summary(inactive), active: summary(active), excluded: summary(excluded) }, categories, batches, excluded };
  return { ...plan, digest: planDigest(plan) };
}

export function selectedBatch(plan, id, now = Date.now()) {
  if (plan.version !== 1 || plan.digest !== planDigest(plan) || plan.mode !== 'copy-only' ||
      plan.changesDatabase !== false || plan.deletesSource !== false ||
      !Number.isFinite(Date.parse(plan.createdAt)) || now - Date.parse(plan.createdAt) > 86_400_000 || Date.parse(plan.createdAt) > now + 60_000) {
    throw Error('Plan alterado o vencido. Vuelve a generar el inventario y el plan.');
  }
  const batch = plan.batches.find(value => value.id === id);
  if (!batch || batch.count !== batch.items.length || batch.bytes !== summary(batch.items).bytes || batch.bytes > BATCH_BYTES ||
      batch.items.some(item => !validPath(item.path) || item.path.startsWith('drive/') || !/^\d+$/.test(item.sourceId) ||
        !Number.isInteger(item.sourceVersion) || item.sourceVersion < 0 || !Number.isSafeInteger(item.bytes) || item.bytes <= 0 || item.bytes > MAX_OBJECT_BYTES) ||
      new Set(batch.items.map(item => item.path)).size !== batch.items.length) throw Error('Lote no válido.');
  if (batch.purpose === 'defer-until-runtime-tests') throw Error('Las señas activas quedan pendientes de las pruebas de la siguiente fase.');
  return batch;
}

export function assertSourceCurrent(item, row, object) {
  if (!row || row.aprobada !== true || row.moderation_status !== 'approved' || String(row.id) !== item.sourceId ||
      row.moderation_version !== item.sourceVersion || row.archivo_path !== item.path || row.label !== item.label || row.categoria !== item.category ||
      !object || object.id !== item.objectId || (object.version ?? null) !== item.objectVersion || object.updated_at !== item.updatedAt ||
      object.metadata?.eTag !== item.etag || Number(object.metadata?.size) !== item.bytes) {
    throw Error('Cambió el original o su aprobación. Regenera el plan antes de continuar.');
  }
}

export function verifyRecordingBytes(item, bytes) {
  if (bytes.byteLength !== item.bytes) throw Error('El tamaño descargado no coincide con el inventario.');
  const payload = JSON.parse(Buffer.from(bytes).toString('utf8'));
  if (payload.label !== item.label || payload.categoria != null && payload.categoria !== item.category ||
      !Array.isArray(payload.frames) || payload.frames.length === 0) throw Error('El archivo no coincide con la grabación aprobada.');
  return sha256(bytes);
}
