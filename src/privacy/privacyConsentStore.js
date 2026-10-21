// En la app nativa se pide nuevamente al iniciar una nueva sesión.
export const CONSENT_STORAGE_KEY = "deafapp-privacy-consent-v1";
let current = null;
export const privacyConsentStore = {
  async load() { return current; },
  async save(receipt) { current = receipt; },
  async remove() { current = null; },
};
