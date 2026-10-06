import { makeParticipantId } from "./trainingCapture.js";

const validId = value => typeof value === "string" && /^[\w-]{1,100}$/.test(value);

export async function loadRecordingSource(store, createId = makeParticipantId) {
  let saved;
  try { saved = await store.load(); } catch { /* A session-only code still allows recording. */ }
  const previousId = saved?.version === 1 && Array.isArray(saved.profiles)
    ? saved.profiles.find(profile => profile?.id === saved.selectedId)?.id : null;
  const id = saved?.version === 2 && validId(saved.sourceId) ? saved.sourceId
    : validId(previousId) ? previousId : createId();
  // Keep old profiles for compatibility without displaying or selecting them.
  const value = { ...(saved?.version === 1 || saved?.version === 2 ? saved : {}), version: 2, sourceId: id };
  let persistent = true;
  try { await store.save(value); } catch { persistent = false; }
  return { id, participantIdentity: "anonymous-local-source", persistent };
}
