import { File, Paths } from "expo-file-system";
const file = () => new File(Paths.document, "deafapp-recording-profiles.json");
export const recordingProfilesStore = {
  async load() { const saved = file(); return saved.exists ? JSON.parse(await saved.text()) : null; },
  async save(value) { const saved = file(); if (!saved.exists) saved.create(); saved.write(JSON.stringify(value)); },
};
