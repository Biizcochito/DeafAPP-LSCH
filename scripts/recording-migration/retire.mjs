import { sha256, verifyRecordingBytes } from './plan.mjs';

// Retire only a redundant source file. The recording row and variant parents
// are deliberately absent from the deletion adapter.
export async function retireVerifiedSource({ item, receipt, backup, source, destination, backend, integrity, remove, onRemoved }) {
  if (!receipt || receipt.path !== item.path || receipt.sourceId !== item.sourceId || receipt.sourceVersion !== item.sourceVersion ||
      receipt.bytes !== item.bytes || !/^[a-f0-9]{64}$/.test(receipt.sha256 || '')) throw Error('Falta un comprobante válido.');
  const local = await backup.read(item.path);
  if (!local || verifyRecordingBytes(item, local) !== receipt.sha256) throw Error('El respaldo privado no coincide.');
  await integrity();
  await source.assertCurrent(item);
  if (sha256(await source.download(item)) !== receipt.sha256) throw Error('El original cambió.');
  if (sha256(await destination.download(item.path, item.bytes)) !== receipt.sha256) throw Error('La copia R2 cambió.');
  const routed = await backend(item);
  if (routed.provider !== 'r2' || routed.bytes.length !== item.bytes || sha256(routed.bytes) !== receipt.sha256) throw Error('La aplicación no puede leer la copia activa.');
  await source.assertCurrent(item);
  await integrity();
  await remove(item.path);
  // Persist immediately: an interrupted postcheck can be resumed without
  // trying to register, reactivate, or delete this source a second time.
  await onRemoved({ path: item.path, bytes: item.bytes, sha256: receipt.sha256, removedAt: new Date().toISOString() });
  const after = await backend(item);
  if (after.provider !== 'r2' || sha256(after.bytes) !== receipt.sha256) throw Error('Revisar la lectura privada después del retiro.');
  await integrity();
}
