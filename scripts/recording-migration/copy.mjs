import { sha256, verifyRecordingBytes } from './plan.mjs';

// Adapters deliberately expose no delete, database update, or overwrite method.
export async function copyVerifiedOriginal({ item, source, destination, backup, receipt, onReceipt = async () => {} }) {
  await source.assertCurrent(item);
  let bytes = await backup.read(item.path);
  if (bytes && !receipt) {
    const original = await source.download(item);
    if (verifyRecordingBytes(item, original) !== verifyRecordingBytes(item, bytes)) throw Error('El respaldo no coincide con el original.');
  }
  if (!bytes) {
    bytes = await source.download(item);
    verifyRecordingBytes(item, bytes);
    await source.assertCurrent(item);
    await backup.write(item.path, bytes);
  }
  const hash = verifyRecordingBytes(item, bytes);
  if (receipt && (receipt.path !== item.path || receipt.sha256 !== hash || receipt.bytes !== item.bytes ||
    receipt.sourceId !== item.sourceId || receipt.sourceVersion !== item.sourceVersion)) throw Error('El respaldo cambió respecto de su comprobante.');
  await source.assertCurrent(item);
  // A retry reads an existing copy in full. An unrelated existing object is
  // never overwritten, including when another process races this one.
  const existing = await destination.head(item.path);
  let uploaded = false;
  if (existing) {
    // Dashboard uploads have no custom checksum metadata. The full read-back
    // below remains authoritative; matching size alone never creates a receipt.
    if (existing.bytes !== item.bytes || existing.sha256 && existing.sha256 !== hash) throw Error('Existe otro contenido en el destino. Se conserva sin sobrescribir.');
  } else {
    await destination.putIfAbsent(item.path, bytes, { sha256: hash, sourceId: item.sourceId, sourceVersion: String(item.sourceVersion) });
    uploaded = true;
  }
  const copied = await destination.download(item.path, item.bytes);
  if (copied.byteLength !== item.bytes || sha256(copied) !== hash) throw Error('Falló la verificación completa de la copia R2. No se modifica el origen.');
  await source.assertCurrent(item);
  const result = { path: item.path, sourceId: item.sourceId, sourceVersion: item.sourceVersion, bytes: item.bytes,
    sha256: hash, verifiedAt: new Date().toISOString(), uploaded, sourceDeleted: false, databaseChanged: false };
  await onReceipt(result);
  return result;
}
