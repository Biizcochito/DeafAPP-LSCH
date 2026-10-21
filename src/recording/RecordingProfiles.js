import { useEffect, useState } from "react";
import { recordingProfilesStore } from "./recordingProfilesStore";
import { loadRecordingSource } from "./recordingSource";

// This groups recordings by local origin; it does not identify a person.
export function useRecordingSource() {
  const [source, setSource] = useState(null);
  useEffect(() => {
    let active = true;
    loadRecordingSource(recordingProfilesStore).then(value => {
      if (active) setSource(value);
    });
    return () => { active = false; };
  }, []);
  return source;
}
