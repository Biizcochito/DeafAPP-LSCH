import { isTrainingCapture } from "./trainingCapture.js";
import { assertRecordingConsent } from "../privacy/privacyConsent.js";

export function createRecordingDraft({ label, category, frames, intervalMs = 100, frameAspectRatio = 4 / 3, now = Date.now(), id, training, consent }) {
  const draftId = id || (typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID() : `${now}-${Math.random().toString(36).slice(2)}`);
  const draft = {
    version: 1, id: draftId, label, category, frames: [...frames], intervalMs, frameAspectRatio,
    createdAt: now, uploaded: false,
    storagePath: `${category}/${label}/${label}_${draftId}.json`,
    ...(training ? { training } : {}),
    ...(consent ? { consent: JSON.parse(JSON.stringify(consent)) } : {}),
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

// One stable path per recording makes interrupted uploads safe to retry.
// Check the registration too: an uploaded object alone is not a saved sign.
export async function submitRecordingDraft({ draft, client, onUploaded = async () => {}, getCurrentConsent = () => draft?.consent }) {
  if (!isRecordingDraft(draft)) throw new Error("No se pudo recuperar la grabación.");
  assertRecordingConsent(draft, getCurrentConsent());
  const existing = await client.from("grabaciones").select("id").eq("archivo_path", draft.storagePath).limit(1);
  if (existing.error) throw new Error(existing.error.message || "No se pudo comprobar el envío anterior.");
  assertRecordingConsent(draft, getCurrentConsent());
  if (existing.data?.length) return { alreadySubmitted: true };
  async function invoke(body) {
    const response=await client.functions.invoke('recording-upload',{body});
    if(response.error||response.data?.ok!==true||response.data.provider!=='r2'||response.data.path!==draft.storagePath){
      const details=await response.error?.context?.json?.().catch(()=>null);
      throw new Error(details?.error||response.data?.error||response.error?.message||'No se pudo guardar la grabación. Conserva la toma y vuelve a intentarlo.');
    }
    return response.data;
  }
  let receipt=draft.uploadProvider==='r2'&&draft.uploadReceipt?.path===draft.storagePath&&/^[a-f0-9]{64}$/.test(draft.uploadReceipt.token||'')?draft.uploadReceipt:null;
  if(!receipt){
    const staged=await invoke({action:'stage',draft});
    assertRecordingConsent(draft,getCurrentConsent());
    if(staged.alreadySubmitted)return {alreadySubmitted:true};
    if(!/^[a-f0-9]{64}$/.test(staged.token||''))throw new Error('No se pudo verificar el envío. Conserva la toma y vuelve a intentarlo.');
    receipt={path:staged.path,token:staged.token};
    await onUploaded({...draft,uploaded:true,uploadProvider:'r2',uploadReceipt:receipt});
  }
  assertRecordingConsent(draft, getCurrentConsent());
  const registered=await invoke({action:'complete',...receipt});
  assertRecordingConsent(draft,getCurrentConsent());
  return {alreadySubmitted:!!registered.alreadySubmitted};
}

export function createTimedFetch(fetcher, timeoutMs = 30000) {
  return async (input, options = {}) => {
    const controller = new AbortController();
    const signal = options.signal || input?.signal;
    const abort = () => controller.abort(signal?.reason);
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
    const url=typeof input==='string'?input:input?.url;
    const uploadRequest=typeof url==='string'&&/\/functions\/v1\/recording-upload(?:\?|$)/.test(url);
    const timer = setTimeout(() => controller.abort(), uploadRequest?Math.max(timeoutMs,150000):timeoutMs);
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
