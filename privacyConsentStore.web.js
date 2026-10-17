export const CONSENT_STORAGE_KEY = "deafapp-privacy-consent-v1";
export const privacyConsentStore = {
  async load() {
    try { return JSON.parse(localStorage.getItem(CONSENT_STORAGE_KEY) || "null"); } catch { return null; }
  },
  async save(receipt) { localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(receipt)); },
  async remove() { localStorage.removeItem(CONSENT_STORAGE_KEY); },
};
