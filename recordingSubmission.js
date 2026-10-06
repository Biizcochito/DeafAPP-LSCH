import { isTrainingCapture } from "./trainingCapture.js";

export function createRecordingDraft({ label, category, frames, intervalMs = 100, frameAspectRatio = 4 / 3, now = Date.now(), id, training }) {
  const draftId = id || (typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID() : `${now}-${Math.random().toString(36).slice(2)}`);
  const draft = {
    version: 1, id: draftId, label, category, frames: [...frames], intervalMs, frameAspectRatio,
    createdAt: now, uploaded: false,
    storagePath: `${category}/${label}/${label}_${draftId}.json`,
    ...(training ? { training } : {}),
  };
  if (!isRecordingDraft(draft)) throw new Error("La grabación no está completa. Vuelve a grabar.");
  return draft;
}

export function isRecordingDraft(draft) {
  return !!draft && draft.version === 1 && typeof draft.id === "string" && /^[\w-]+$/.test(draft.id) &&
    typeof draft.category === "string" && /^[a-z_]+$/.test(draft.category) &&
    typeof draft.label === "string" && draft.label.length > 0 && !/[\/\\]/.test(draft.label) &&
    Number.isFinite(draft.createdAt) && draft.intervalMs >= 30 && draft.intervalMs <= 1000 &&
    (draft.frameAspectRatio == null || (Number.isFinite(draft.frameAspectRatio) && draft.frameAspectRatio > 0)) &&
    Array.isArray(draft.frames) && draft.frames.length > 0 && draft.frames.length <= 120 &&
    draft.frames.every(frame => typeof frame === "string" && frame.length > 0) &&
    (draft.training == null || isTrainingCapture(draft.training, draft.frames.length)) &&
    draft.storagePath === `${draft.category}/${draft.label}/${draft.label}_${draft.id}.json`;
}

function assetAlreadyExists(error) {
  return ["ResourceAlreadyExists", "KeyAlreadyExists", "Duplicate"].includes(error?.code || error?.error) ||
    /(?:asset|resource|object|key).*already exists/i.test(error?.message || "");
}

// One stable path per recording makes interrupted uploads safe to retry.
// Check the registration too: an uploaded object alone is not a saved sign.
export async function submitRecordingDraft({ draft, client, onUploaded = async () => {} }) {
  if (!isRecordingDraft(draft)) throw new Error("No se pudo recuperar la grabación.");
  const existing = await client.from("grabaciones").select("id").eq("archivo_path", draft.storagePath).limit(1);
  if (existing.error) throw new Error(existing.error.message || "No se pudo comprobar el envío anterior.");
  if (existing.data?.length) return { alreadySubmitted: true };
  if (!draft.uploaded) {
    const payload = JSON.stringify({
      schemaVersion: 2, recordingId: draft.id, language: "csg",
      label: draft.label, categoria: draft.category, frames: draft.frames,
      timestamp: draft.createdAt, n_frames: draft.frames.length,
      intervalMs: draft.intervalMs, frameAspectRatio: draft.frameAspectRatio,
      ...(draft.training ? { training: draft.training } : {}),
    });
    const uploaded = await client.storage.from("contribuciones").upload(
      draft.storagePath, new Blob([payload], { type: "application/json" }),
      { contentType: "application/json", upsert: false },
    );
    if (uploaded.error && !assetAlreadyExists(uploaded.error)) {
      throw new Error(uploaded.error.message || "No se pudo subir la grabación.");
    }
    await onUploaded({ ...draft, uploaded: true });
  }
  const registered = await client.from("grabaciones").insert({
    label: draft.label, categoria: draft.category, archivo_path: draft.storagePath,
  });
  if (registered.error) throw new Error(registered.error.message || "No se pudo registrar la seña.");
  return { alreadySubmitted: false };
}

export function createTimedFetch(fetcher, timeoutMs = 30000) {
  return async (input, options = {}) => {
    const controller = new AbortController();
    const signal = options.signal || input?.signal;
    const abort = () => controller.abort(signal?.reason);
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetcher(input, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  };
}

export async function withRecordingSendLock(id, task) {
  if (typeof navigator !== "undefined" && navigator.locks?.request) {
    return navigator.locks.request(`deafapp-recording-${id}`, { ifAvailable: true }, lock => {
      if (!lock) throw new Error("Esta grabación ya se está enviando desde otra pestaña.");
      return task();
    });
  }
  return task();
}
