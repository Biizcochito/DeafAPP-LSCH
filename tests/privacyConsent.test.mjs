import test from "node:test";
import assert from "node:assert/strict";
import { PRIVACY_NOTICE, CONSENT_CHOICES, privacyReady, recordingRetentionPeriod, isConsentAuthorizer, isLocalPrivacyPreview, createConsentReceipt, isConsentReceipt, assertRecordingConsent, createPrivacyPreviewFetch } from "../src/privacy/privacyConsent.js";
import { createRecordingDraft, isRecordingDraft, submitRecordingDraft } from "../src/recording/recordingSubmission.js";
import { testNotice, testChoices, testConsent } from "./fixtures/consent.mjs";

test("cada finalidad exige una acción afirmativa separada; aceptar términos no basta", () => {
  assert.throws(() => createConsentReceipt({}, { preview: true }), /cada autorización/);
  assert.throws(() => createConsentReceipt({ terms: true }, { preview: true }), /cada autorización/);
  for (const { id } of CONSENT_CHOICES) {
    for (const value of [false, undefined, "true"]) {
      assert.throws(() => createConsentReceipt({ ...testChoices, [id]: value }, { preview: true }), /cada autorización/);
    }
  }
});

test("el aviso incompleto no habilita una autorización de producción", () => {
  assert.equal(PRIVACY_NOTICE.controller, "Diego Padilla");
  assert.throws(() => createConsentReceipt(testChoices, { notice: { ...testNotice, retention: "" } }), /aviso está en revisión/);
  assert.equal(privacyReady(testNotice), true);
  assert.equal(privacyReady({ ...testNotice, contact: "" }), false);
  assert.equal(privacyReady({ ...testNotice, retention: "" }), false);
  assert.equal(privacyReady({ ...testNotice, approvedForPublication: false }), false);
});

test("la configuración publicada permite nuevos aportes autorizados con conservación de 24 meses", async () => {
  assert.equal(privacyReady(), true);
  assert.equal(PRIVACY_NOTICE.retentionMonths, 24);
  assert.match(PRIVACY_NOTICE.retention, /24 meses desde el envío/);
  const receipt=createConsentReceipt(testChoices,{now:123456000,id:"production-consent"});
  const value=createRecordingDraft({id:"production-recording",label:"hola",category:"saludos",frames:["synthetic"],now:123456789,consent:receipt});
  let uploaded,registered=false;
  const client={from:()=>({select:()=>({eq:()=>({limit:async()=>({data:[]})})}),insert:async()=>{registered=true;return {error:null};}}),storage:{from:()=>({upload:async(_path,blob)=>{uploaded=JSON.parse(await blob.text());return {error:null};}})}};
  await submitRecordingDraft({draft:value,client});
  assert.equal(registered,true);assert.equal(uploaded.consent.mode,"contribution");
  assert.equal(uploaded.retention.months,24);
  assert.equal(Date.parse(uploaded.retention.expiresAt)>Date.parse(uploaded.retention.startsAt),true);
});

test("los 24 meses se cuentan por calendario y respetan los días de febrero", () => {
  assert.deepEqual(recordingRetentionPeriod(Date.parse("2026-10-17T14:00:00Z")),{months:24,startsAt:"2026-10-17T14:00:00.000Z",expiresAt:"2028-10-17T14:00:00.000Z"});
  assert.equal(recordingRetentionPeriod(Date.parse("2024-02-29T14:00:00Z")).expiresAt,"2026-02-28T14:00:00.000Z");
  assert.throws(()=>recordingRetentionPeriod(NaN),/Fecha/);
});

test("pueden participar menores con autorización de quien les representa; no se confunde con autorización personal", () => {
  assert.equal(isConsentAuthorizer(null), false);
  assert.equal(isConsentAuthorizer({ role: "participant", ageDeclaration: "under-16" }), false);
  assert.throws(() => createConsentReceipt({ ...testChoices, authorizer: null }, { preview: true }), /quién autoriza/);
  for (const relationship of ["mother", "father", "legal-representative", "personal-care"]) {
    const authorizer = { role: "representative", ageDeclaration: "under-16", relationship, authorityConfirmed: true };
    assert.ok(isConsentAuthorizer(authorizer));
    assert.equal(isConsentAuthorizer({ ...authorizer, authorityConfirmed: false }), false);
    const receipt = createConsentReceipt({ ...testChoices, authorizer }, { preview: true });
    assert.equal(receipt.authorizer.relationship, relationship);
    assert.ok(isConsentReceipt(receipt, { allowPreview: true }));
    authorizer.relationship = "other";
    assert.equal(receipt.authorizer.relationship, relationship);
  }
  assert.equal(isConsentAuthorizer({ role: "representative", ageDeclaration: "under-16", relationship: "friend", authorityConfirmed: true }), false);
});

test("la simulación se limita al entorno local; su comprobante no autoriza envíos reales", () => {
  for (const hostname of ["localhost", "127.0.0.1", "[::1]"]) assert.ok(isLocalPrivacyPreview({ enabled: "1", hostname }));
  for (const hostname of ["deafapps.com", "localhost.evil.test", "192.168.1.3"]) assert.equal(isLocalPrivacyPreview({ enabled: "1", hostname }), false);
  assert.equal(isLocalPrivacyPreview({ enabled: "0", hostname: "localhost" }), false);
  const receipt = createConsentReceipt(testChoices, { preview: true });
  assert.equal(isConsentReceipt(receipt), false);
  assert.ok(isConsentReceipt(receipt, { allowPreview: true }));
});

test("el comprobante registra versión, finalidades, responsable y momento; los cambios posteriores no lo alteran", () => {
  const choices = { ...testChoices }; const notice = { ...testNotice };
  const receipt = createConsentReceipt(choices, { notice, now: 123456000, id: "recorded-choice" });
  choices.capture = false; notice.retention = "otro plazo";
  assert.equal(receipt.acceptedAt, 123456000);
  assert.equal(receipt.choices.capture, true);
  assert.equal(receipt.notice.retention, testNotice.retention);
  assert.ok(isConsentReceipt(receipt));
  assert.equal(isConsentReceipt({ ...receipt, noticeVersion: "anterior" }), false);
  assert.equal(isConsentReceipt({ ...receipt, acceptedAt: Date.now() + 5000 }), false);
});

const draft = () => createRecordingDraft({ id: "privacy-test", label: "hola", category: "saludos", frames: ["synthetic-test-frame"], now: 123456789, consent: testConsent });
test("una autorización posterior, retirada o distinta nunca habilita la toma existente", () => {
  const value = draft();
  assert.doesNotThrow(() => assertRecordingConsent(value, testConsent));
  assert.throws(() => assertRecordingConsent(value, null), /autorización vigente/);
  assert.throws(() => assertRecordingConsent(value, { ...testConsent, id: "otra" }), /autorización vigente/);
  assert.throws(() => assertRecordingConsent({ ...value, createdAt: testConsent.acceptedAt - 1 }), /antes de capturar/);
  assert.throws(() => assertRecordingConsent({ ...value, consent: { ...testConsent, choices: { ...testChoices, training: false } } }), /autorización vigente/);
});

test("las tomas anteriores se pueden recuperar pero no enviar sin evidencia previa", async () => {
  const old = draft(); delete old.consent;
  assert.ok(isRecordingDraft(old));
  let requests = 0;
  const client = { from() { requests++; throw new Error("No debería acceder a la red"); } };
  await assert.rejects(submitRecordingDraft({ draft: old, client }), /autorización vigente/);
  await assert.rejects(submitRecordingDraft({ draft: { ...draft(), consent: createConsentReceipt(testChoices, { preview: true }) }, client }), /autorización vigente/);
  assert.equal(requests, 0);
});

test("retirar entre la consulta y la subida detiene la transferencia", async () => {
  let current = testConsent; let uploads = 0;
  const client = {
    from: () => ({ select: () => ({ eq: () => ({ limit: async () => { current = null; return { data: [], error: null }; } }) }) }),
    storage: { from: () => ({ upload: () => { uploads++; } }) },
  };
  await assert.rejects(submitRecordingDraft({ draft: draft(), client, getCurrentConsent: () => current }), /autorización vigente/);
  assert.equal(uploads, 0);
});

test("la retirada durante una consulta no informa éxito ni siquiera en un reintento", async () => {
  let current = testConsent;
  const client = { from: () => ({ select: () => ({ eq: () => ({ limit: async () => {
    current = null; return { data: [{ id: 1 }] };
  } }) }) }) };
  await assert.rejects(submitRecordingDraft({ draft: draft(), client, getCurrentConsent: () => current }), /autorización vigente/);
});

test("la retirada durante una subida impide registrar el aporte como recibido", async () => {
  let current = testConsent; let inserts = 0;
  const client = {
    from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: [] }) }) }), insert: () => { inserts++; } }),
    storage: { from: () => ({ upload: async () => ({ error: null }) }) },
  };
  await assert.rejects(submitRecordingDraft({ draft: draft(), client, getCurrentConsent: () => current, onUploaded: async () => { current = null; } }), /autorización vigente/);
  assert.equal(inserts, 0);
});

test("la prueba local bloquea escrituras aunque se acceda a un formulario anterior", async () => {
  const seen = [];
  const fetcher = createPrivacyPreviewFetch(async (input, options) => { seen.push(options?.method || "GET"); return new Response("ok"); }, true);
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "post"]) await assert.rejects(fetcher("https://example.test", { method }), /Prueba local/);
  await assert.rejects(fetcher(new Request("https://example.test", { method: "POST" })), /Prueba local/);
  assert.equal(seen.length, 0);
  assert.equal((await fetcher("https://example.test")).status, 200);
  assert.deepEqual(seen, ["GET"]);
});
