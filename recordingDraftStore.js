import { File, Paths } from "expo-file-system";

const file = () => new File(Paths.document, "deafapp-recording-pending.json");
export const recordingDraftStore = {
  async load() {
    const pending = file();
    return pending.exists ? JSON.parse(await pending.text()) : null;
  },
  async save(draft) {
    const pending = file();
    if (!pending.exists) pending.create();
    pending.write(JSON.stringify(draft));
  },
  async remove(id) {
    const pending = file();
    if (!pending.exists) return false;
    const draft = JSON.parse(await pending.text());
    if (draft.id !== id) return false;
    pending.delete();
    return true;
  },
};
