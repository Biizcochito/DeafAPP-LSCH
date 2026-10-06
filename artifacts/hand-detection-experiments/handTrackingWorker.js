// A dedicated worker avoids both rendering stalls and shared WASM globals.
export async function createHandWorker(options = {}) {
  // This is an exported public asset, not a Metro worker module.
  const workerUrl = new URL("hand-tracking-worker.js", document.baseURI);
  const worker = new Worker(workerUrl);
  const pending = new Map();
  let sequence = 0;
  let closed = false;
  const failAll = error => {
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(error); }
    pending.clear();
  };
  worker.onerror = event => failAll(new Error(event.message || "No se pudo cargar el detector de manos."));
  worker.onmessage = ({ data }) => {
    const request = pending.get(data.id);
    if (!request) return;
    clearTimeout(request.timer);
    pending.delete(data.id);
    if (data.type === "error") request.reject(new Error(data.message));
    else request.resolve(data.result);
  };
  const request = (message, transfer = []) => new Promise((resolve, reject) => {
    if (closed) { reject(new Error("Detector de manos cerrado.")); return; }
    const id = ++sequence;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("El detector de manos tardó demasiado. Vuelve a activar el trazado."));
    }, message.type === "init" ? 45000 : 10000);
    pending.set(id, { resolve, reject, timer });
    try { worker.postMessage({ ...message, id }, transfer); }
    catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
  });
  const close = () => {
    closed = true;
    worker.terminate();
    failAll(new Error("Detector de manos cerrado."));
  };
  try { await request({ type: "init", options }); }
  catch (error) { close(); throw error; }
  return {
    async detect(image, timestamp) {
      const bitmap = await createImageBitmap(image);
      try { return await request({ type: "frame", image: bitmap, timestamp }, [bitmap]); }
      finally { bitmap.close(); }
    },
    close,
  };
}
