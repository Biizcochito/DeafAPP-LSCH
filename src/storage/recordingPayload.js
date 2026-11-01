import {recordingRetentionPeriod} from '../privacy/privacyConsent.js';

// Preserve the capture schema; storage location is separate from training data.
export function recordingPayload(draft,submittedAt){
  return {schemaVersion:2,recordingId:draft.id,language:'csg',label:draft.label,categoria:draft.category,
    frames:draft.frames,timestamp:draft.createdAt,n_frames:draft.frames.length,intervalMs:draft.intervalMs,
    frameAspectRatio:draft.frameAspectRatio,consent:draft.consent,
    ...(submittedAt?{retention:recordingRetentionPeriod(Date.parse(submittedAt))}:{}),...(draft.training?{training:draft.training}:{})};
}
