import test from "node:test";
import assert from "node:assert/strict";
import { PRIVACY_NOTICE, CONSENT_CHOICES, privacyReady, recordingRetentionPeriod, isConsentAuthorizer, isLocalPrivacyPreview, createConsentReceipt, isConsentReceipt, assertRecordingConsent, createPrivacyPreviewFetch } from "../src/privacy/privacyConsent.js";
import { createRecordingDraft, isRecordingDraft, submitRecordingDraft } from "../src/recording/recordingSubmission.js";
import { testNotice, testChoices, testConsent } from "./fixtures/consent.mjs";
import {recordingPayload} from '../src/storage/recordingUploadServer.js';

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

test("la configuración publicada permite nuevos aportes autorizados con conservación de cuatro años", async () => {
  assert.equal(privacyReady(), true);
  assert.equal(PRIVACY_NOTICE.retentionMonths, 48);
  assert.match(PRIVACY_NOTICE.retention, /4 años desde el envío/);
  const receipt=createConsentReceipt(testChoices,{now:123456000,id:"production-consent"});
  const value=createRecordingDraft({id:"production-recording",label:"hola",category:"saludos",frames:["synthetic"],now:123456789,consent:receipt});
  let uploaded,registered=false;
  const client={from:()=>({select:()=>({eq:()=>({limit:async()=>({data:[]})})})}),functions:{invoke:async(_name,{body})=>{
    if(body.action==='stage')uploaded=recordingPayload(body.draft,'2026-11-01T12:00:00.000Z');else registered=true;
    return {data:{ok:true,provider:'r2',path:value.storagePath,token:'a'.repeat(64)}};
  }}};
  await submitRecordingDraft({draft:value,client});
  assert.equal(registered,true);assert.equal(uploaded.consent.mode,"contribution");
  assert.equal(uploaded.retention.months,48);
  assert.equal(uploaded.consent.notice.retentionMonths,48);
  assert.equal(uploaded.consent.noticeVersion,"2026-10-31-v2");
  assert.equal(Date.parse(uploaded.retention.expiresAt)>Date.parse(uploaded.retention.startsAt),true);
});

test("los cuatro años se cuentan por calendario y respetan meses y años bisiestos", () => {
  assert.deepEqual(recordingRetentionPeriod(Date.parse("2026-10-31T14:00:00Z")),{months:48,startsAt:"2026-10-31T14:00:00.000Z",expiresAt:"2030-10-31T14:00:00.000Z"});
  assert.equal(recordingRetentionPeriod(Date.parse("2024-02-29T14:00:00Z")).expiresAt,"2028-02-29T14:00:00.000Z");
  assert.equal(recordingRetentionPeriod(Date.parse("2096-02-29T14:00:00Z")).expiresAt,"2100-02-28T14:00:00.000Z");
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
test("una autorización anterior de 24 meses no se convierte en otra de cuatro años", async () => {
  const previousVersion="2026-10-17-v1";
  const previous={...testConsent,noticeVersion:previousVersion,notice:{...testConsent.notice,version:previousVersion,retention:"24 meses desde el envío del aporte",retentionMonths:24}};
  const value={...draft(),consent:previous,retention:{months:24,startsAt:"2026-10-17T14:00:00.000Z",expiresAt:"2028-10-17T14:00:00.000Z"}};
  const saved=JSON.stringify(value);
  let requests=0;
  const client={from(){requests++;throw new Error("No debería acceder a la red");}};
  assert.equal(isConsentReceipt(previous),false);
  await assert.rejects(submitRecordingDraft({draft:value,client}),/autorización vigente/);
  const renewed=createConsentReceipt(testChoices);
  await assert.rejects(submitRecordingDraft({draft:value,client,getCurrentConsent:()=>renewed}),/autorización vigente/);
  assert.equal(requests,0);
  assert.equal(JSON.stringify(value),saved);
});

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
    functions:{invoke:async()=>({data:{ok:true,provider:'r2',path:draft().storagePath,token:'a'.repeat(64)}})},
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
