import { File, Paths } from "expo-file-system";
const file = () => new File(Paths.document, "deafapp-my-contributions.json");
export const myContributionsStore = {
  async load() { try { const saved = file(); return saved.exists ? JSON.parse(await saved.text()) : null; } catch { return null; } },
  async save(value) { try { const saved = file(); if (!saved.exists) saved.create(); saved.write(JSON.stringify(value)); } catch { /* Los aportes ya se enviaron; esto es solo el resumen. */ } },
};
