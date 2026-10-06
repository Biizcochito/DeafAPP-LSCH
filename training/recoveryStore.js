import { validateRecoveredItem } from './legacyRecovery.js';

export async function openRecoveryStore() {
  if (!globalThis.indexedDB) throw new Error('Este navegador no permite guardar la recuperación local.');
  const database = await new Promise((resolve, reject) => {
    const request = indexedDB.open('deafapp-legacy-recovery-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('recovered', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('No se pudo abrir la recuperación local.'));
    request.onblocked = () => reject(new Error('Cierra otras pestañas del administrador e inténtalo nuevamente.'));
  });
  function request(mode, operation) {
    return new Promise((resolve, reject) => {
      const transaction = database.transaction('recovered', mode);
      let value;
      const query = operation(transaction.objectStore('recovered'));
      query.onsuccess = () => { value = query.result; };
      transaction.oncomplete = () => resolve(value);
      transaction.onerror = transaction.onabort = () => reject(new Error('No se pudo guardar la recuperación local.'));
    });
  }
  return { all: () => request('readonly', table => table.getAll()),
    put(item) { if (item.observations) validateRecoveredItem(item); return request('readwrite', table => table.put(item)); },
    close() { database.close(); } };
}
