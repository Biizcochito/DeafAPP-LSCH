const key = "deafapp-translator-settings-v1";
// Guarda la dirección del servidor del traductor (la API de LSCh) en este navegador.
export const translatorSettingsStore = {
  async load() { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; } },
  async save(value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Sin guardar: se vuelve a escribir la próxima vez. */ } },
};
