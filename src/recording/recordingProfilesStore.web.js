const key = "deafapp-recording-profiles-v1";
export const recordingProfilesStore = {
  async load() { return JSON.parse(localStorage.getItem(key) || "null"); },
  async save(value) { localStorage.setItem(key, JSON.stringify(value)); },
};
