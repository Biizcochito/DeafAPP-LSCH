import { PRIVACY_NOTICE, CONSENT_CHOICES, createConsentReceipt } from "../../src/privacy/privacyConsent.js";
// Valores ficticios exclusivos de pruebas. Nunca se usan como datos del responsable real.
export const testNotice = { ...PRIVACY_NOTICE, controller: "Responsable de prueba", contact: "privacidad@example.test", retention: "30 días (prueba)", approvedForPublication: true };
export const testChoices = { ...Object.fromEntries(CONSENT_CHOICES.map(({ id }) => [id, true])), authorizer: { role: "participant", ageDeclaration: "16-or-older" } };
export const testConsent = createConsentReceipt(testChoices, { notice: testNotice, id: "consent-test", now: 123456000 });
