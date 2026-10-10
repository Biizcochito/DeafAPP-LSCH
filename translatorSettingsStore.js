import { File, Paths } from "expo-file-system";
const file = () => new File(Paths.document, "deafapp-translator-settings.json");
// Guarda la dirección del servidor del traductor (la API de LSCh) en este dispositivo.
export const translatorSettingsStore = {
  async load() { try { const saved = file(); return saved.exists ? JSON.parse(await saved.text()) : null; } catch { return null; } },
  async save(value) { try { const saved = file(); if (!saved.exists) saved.create(); saved.write(JSON.stringify(value)); } catch { /* Sin guardar: se vuelve a escribir la próxima vez. */ } },
};
