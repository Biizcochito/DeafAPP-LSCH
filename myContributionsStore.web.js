const key = "deafapp-my-contributions-v1";
// Si el navegador bloquea el almacenamiento, el resumen simplemente no se guarda.
export const myContributionsStore = {
  async load() { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; } },
  async save(value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Los aportes ya se enviaron; esto es solo el resumen. */ } },
};
