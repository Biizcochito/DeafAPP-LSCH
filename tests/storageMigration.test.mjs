import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMigrationPlan, selectedBatch, assertSourceCurrent, verifyRecordingBytes, sha256, validPath } from '../scripts/recording-migration/plan.mjs';
import { copyVerifiedOriginal } from '../scripts/recording-migration/copy.mjs';

const now = '2026-10-31T20:00:00.000Z';
function fixture() {
  const values = [['familia', 'mama', 400_000], ['familia', 'hermano', 600_000], ['familia', 'bebe', 700_000],
    ['alimentos', 'carne', 25_000_000], ['oraciones', 'yo bien', 800_000], ['saludos', 'hola', 1_000_000]];
  const rows = values.map(([categoria, label], i) => ({ id: i + 1, categoria, label, archivo_path: `${categoria}/${label}/${i}.json`,
    aprobada: true, moderation_status: 'approved', moderation_version: 2 }));
  const objects = rows.map((row, i) => ({ path: row.archivo_path, id: `object-${i}`, version: `v-${i}`, updated_at: now,
    metadata: { size: values[i][2], eTag: `etag-${i}` } }));
  const manifest = { ok: true, revision: '1:2:3', catalogue: [
    { classId: 'oraciones/estoy bien', category: 'oraciones', label: 'estoy bien', collection: true, state: 'enabled' },
    { classId: 'saludos/hola', category: 'saludos', label: 'hola', collection: true, state: 'enabled' }] };
  return { inventory: { project: 'https://example.supabase.co', checkedAt: now, rows, objects, errors: [] }, manifest };
}
test('the pilot uses distinct inactive signs, preserving active phrases and their aliases for last', () => {
  const { inventory, manifest } = fixture(), plan = buildMigrationPlan(inventory, manifest, now);
  assert.deepEqual(plan.batches[0].items.map(item => item.label), ['mama', 'hermano', 'bebe']);
  assert.equal(plan.totals.active.count, 2);
  assert.equal(plan.batches.filter(batch => batch.id.startsWith('active-last'))[0].items.find(item => item.label === 'yo bien').classId, 'oraciones/estoy bien');
  assert.throws(() => selectedBatch(plan, 'active-last-1', Date.parse(now)), /pendientes/);
  assert.equal(plan.deletesSource, false); assert.equal(plan.changesDatabase, false);
});
test('friend imports, rejected/unlinked files and unknown labels are quarantined', () => {
  const { inventory, manifest } = fixture();
  inventory.rows[0].moderation_status = 'rejected';
  inventory.rows[1].archivo_path = 'drive/hermano/1.json'; inventory.objects[1].path = 'drive/hermano/1.json';
  inventory.rows[2].label = 'inventada-sin-catalogo';
  inventory.objects.push({ path: 'familia/abuelo/no-row.json', metadata: { size: 300_000 } });
  const plan = buildMigrationPlan(inventory, manifest, now), reasons = plan.excluded.map(item => item.reason);
  assert.ok(reasons.includes('not-approved')); assert.ok(reasons.includes('friend-import-awaiting-separate-cleanup'));
  assert.ok(reasons.includes('unknown-class-needs-review')); assert.ok(reasons.includes('no-database-link'));
  assert.ok(!plan.batches.some(batch => batch.id === 'pilot'));
});
test('large inactive originals are divided into bounded batches', () => {
  const { inventory, manifest } = fixture();
  for (let i = 20; i < 30; i++) {
    const row = { ...inventory.rows[3], id: i, archivo_path: `alimentos/carne/${i}.json` };
    inventory.rows.push(row); inventory.objects.push({ ...inventory.objects[3], id: `object-${i}`, path: row.archivo_path });
  }
  const plan = buildMigrationPlan(inventory, manifest, now);
  assert.ok(plan.batches.filter(batch => batch.id.startsWith('inactive')).length >= 3);
  assert.ok(plan.batches.every(batch => batch.bytes <= 100_000_000));
  assert.equal(new Set(plan.batches.flatMap(batch => batch.items).map(item => item.path)).size, plan.batches.reduce((sum, batch) => sum + batch.count, 0));
});
test('altered/stale plans, duplicate paths, and incomplete inventories fail closed', () => {
  const { inventory, manifest } = fixture(), plan = buildMigrationPlan(inventory, manifest, now);
  assert.equal(selectedBatch(plan, 'pilot', Date.parse(now)).count, 3);
  assert.throws(() => selectedBatch(plan, 'pilot', Date.parse(now) + 86_400_001), /vencido/);
  plan.batches[0].items[0].bytes++;
  assert.throws(() => selectedBatch(plan, 'pilot', Date.parse(now)), /alterado/);
  assert.throws(() => buildMigrationPlan({ ...inventory, errors: ['list failed'] }, manifest), /incompletos/);
  assert.throws(() => buildMigrationPlan({ ...inventory, objects: [...inventory.objects, inventory.objects[0]] }, manifest), /duplicadas/);
  for (const path of ['../a/x.json', '/a/x.json', 'a/b/../x.json', 'a/b/%2e%2e.json', 'a/b/x.json?token=x', 'a\\b\\x.json']) assert.equal(validPath(path), false);
});
test('a changed approval or storage revision blocks a copy', () => {
  const { inventory, manifest } = fixture(), item = buildMigrationPlan(inventory, manifest, now).batches[0].items[0];
  const row = inventory.rows[0], object = inventory.objects[0];
  assert.doesNotThrow(() => assertSourceCurrent(item, row, object));
  assert.throws(() => assertSourceCurrent(item, { ...row, moderation_version: 3 }, object), /Cambió/);
  assert.throws(() => assertSourceCurrent(item, row, { ...object, version: 'new-object-version' }), /Cambió/);
  assert.throws(() => assertSourceCurrent(item, { ...row, aprobada: false }, object), /Cambió/);
});

function copyFixture() {
  const bytes = Buffer.from(JSON.stringify({ label: 'mama', categoria: 'familia', frames: ['private-frame'], training: { retained: true } }));
  const item = { path: 'familia/mama/1.json', sourceId: '1', sourceVersion: 2, label: 'mama', category: 'familia', bytes: bytes.length };
  let stored, backedUp, puts = 0, sourceChecks = 0, receipts = [];
  const source = { async assertCurrent() { sourceChecks++; }, async download() { return bytes; } };
  const destination = {
    async head() { return stored && { bytes: stored.length, sha256: sha256(stored) }; },
    async putIfAbsent(path, data) { assert.equal(stored, undefined); stored = Buffer.from(data); puts++; },
    async download() { return stored; },
  };
  const backup = { async read() { return backedUp; }, async write(path, data) { backedUp = Buffer.from(data); } };
  return { item, bytes, source, destination, backup, onReceipt: async receipt => { receipts.push(receipt); },
    stats: () => ({ puts, stored, backedUp, sourceChecks, receipts }),
    setStored(value) { stored = value; }, setBackup(value) { backedUp = value; } };
}
test('copy preserves original bytes and metadata, with verified backup and destination', async () => {
  const context = copyFixture(), receipt = await copyVerifiedOriginal(context), state = context.stats();
  assert.deepEqual(state.stored, context.bytes); assert.deepEqual(state.backedUp, context.bytes);
  assert.equal(state.puts, 1); assert.equal(state.sourceChecks, 4); assert.equal(state.receipts.length, 1);
  assert.equal(receipt.sha256, sha256(context.bytes)); assert.equal(receipt.sourceId, '1'); assert.equal(receipt.sourceVersion, 2);
  assert.equal(receipt.sourceDeleted, false); assert.equal(receipt.databaseChanged, false);
});
test('interrupted copy resumes by verifying an existing object without uploading again', async () => {
  const context = copyFixture(), read = context.destination.download;
  context.destination.download = async () => { throw Error('network interrupted after put'); };
  await assert.rejects(copyVerifiedOriginal(context), /interrupted/);
  assert.equal(context.stats().receipts.length, 0); assert.equal(context.stats().puts, 1);
  context.destination.download = read;
  const receipt = await copyVerifiedOriginal(context);
  assert.equal(receipt.uploaded, false); assert.equal(context.stats().puts, 1); assert.equal(context.stats().receipts.length, 1);
});
test('conflicting destination content is never overwritten', async () => {
  const context = copyFixture(); context.setStored(Buffer.from('other content'));
  await assert.rejects(copyVerifiedOriginal(context), /sin sobrescribir/);
  assert.equal(context.stats().puts, 0); assert.equal(context.stats().receipts.length, 0);
});
test('a wrong destination payload cannot pass using its metadata checksum alone', async () => {
  const context = copyFixture();
  context.destination.download = async () => Buffer.alloc(context.bytes.length, 0);
  await assert.rejects(copyVerifiedOriginal(context), /verificación completa/);
  assert.equal(context.stats().receipts.length, 0); assert.deepEqual(context.stats().backedUp, context.bytes);
});
test('a modified local backup or mismatched recording fails before any destination write', async () => {
  const context = copyFixture(), originalHash = sha256(context.bytes);
  context.setBackup(Buffer.from(context.bytes.toString().replace('private-frame', 'altered-frame')));
  await assert.rejects(copyVerifiedOriginal({ ...context, receipt: { path: context.item.path, bytes: context.item.bytes,
    sourceId: '1', sourceVersion: 2, sha256: originalHash } }), /respaldo cambió/);
  assert.equal(context.stats().puts, 0);
  const wrong = Buffer.from(JSON.stringify({ label: 'otro', frames: ['x'] }));
  assert.throws(() => verifyRecordingBytes({ ...context.item, bytes: wrong.length }, wrong), /no coincide/);
});
test('a cached backup without a receipt must still match the current source bytes', async () => {
  const context = copyFixture();
  context.setBackup(Buffer.from(context.bytes.toString().replace('private-frame', 'altered-frame')));
  await assert.rejects(copyVerifiedOriginal(context), /no coincide con el original/);
  assert.equal(context.stats().puts, 0); assert.equal(context.stats().receipts.length, 0);
});
test('approval changes detected after upload prevent a verified receipt', async () => {
  const context = copyFixture(); let checks = 0;
  context.source.assertCurrent = async () => { if (++checks === 4) throw Error('approval changed'); };
  await assert.rejects(copyVerifiedOriginal(context), /approval changed/);
  assert.equal(context.stats().receipts.length, 0); assert.deepEqual(context.stats().backedUp, context.bytes);
});
