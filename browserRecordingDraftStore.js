export function createBrowserRecordingDraftStore({ databaseName = "deafapp-recording-drafts", factory } = {}) {
  const open = () => new Promise((resolve, reject) => {
    const indexed = factory || (typeof indexedDB !== "undefined" ? indexedDB : null);
    if (!indexed) return reject(new Error("El navegador no permite guardar la grabación localmente."));
    const request = indexed.open(databaseName, 1);
    let expired = false;
    const timer = setTimeout(() => {
      expired = true;
      reject(new Error("No se pudo abrir el guardado local."));
    }, 5000);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("drafts")) request.result.createObjectStore("drafts");
    };
    request.onsuccess = () => {
      clearTimeout(timer);
      if (expired) request.result.close(); else resolve(request.result);
    };
    request.onerror = () => { clearTimeout(timer); reject(request.error); };
    request.onblocked = () => { clearTimeout(timer); expired = true; reject(new Error("Cierra la otra pestaña de DeafApp para guardar localmente.")); };
  });
  const transaction = async (mode, operation) => {
    const db = await open();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction("drafts", mode);
        let result;
        tx.oncomplete = () => resolve(result);
        tx.onabort = tx.onerror = () => reject(tx.error || new Error("No se pudo guardar la grabación localmente."));
        operation(tx.objectStore("drafts"), value => { result = value; });
      });
    } finally { db.close(); }
  };
  return {
    load: () => transaction("readonly", (store, result) => {
      const request = store.get("pending");
      request.onsuccess = () => result(request.result || null);
    }),
    save: draft => transaction("readwrite", store => { store.put(draft, "pending"); }),
    remove: id => transaction("readwrite", (store, result) => {
      const request = store.get("pending");
      request.onsuccess = () => {
        if (request.result?.id === id) { store.delete("pending"); result(true); }
        else result(false);
      };
    }),
  };
}
