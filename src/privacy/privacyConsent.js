// Aviso y plazo autorizados por el responsable para la publicación.
export const PRIVACY_NOTICE = Object.freeze({
  version: "2026-10-31-v2",
  date: "31 de octubre de 2026",
  controller: "Diego Padilla",
  contact: "diego0padilla1717@gmail.com",
  retention: "4 años desde el envío del aporte",
  retentionMonths: 48,
  approvedForPublication: true,
  system: "DeafApp: cámara del dispositivo y MediaPipe para detectar puntos de manos y rostro",
  purpose: "Recopilar y revisar aportes voluntarios de LSCh, y entrenar y evaluar modelos de reconocimiento de señas",
});

export const CONSENT_CHOICES = Object.freeze([
  { id: "person", title: "La grabación corresponde a la persona que participa en este aporte.", detail: "Puede participar una persona de cualquier edad, con la autorización que corresponda. Evita que aparezcan otras personas." },
  { id: "terms", title: "He leído y acepto los términos de participación.", detail: "Participar es voluntario. Puedes explorar el catálogo sin autorizar una grabación." },
  { id: "capture", title: "Autorizo expresamente captar la imagen y los puntos de manos y rostro de quien participa.", detail: "Para preparar, guardar y revisar el aporte que se decida enviar. La imagen puede identificar a la persona, aunque se use un identificador aleatorio." },
  { id: "training", title: "Autorizo expresamente usar ese aporte para entrenar y evaluar reconocimiento de LSCh.", detail: "La autorización se limita a esta finalidad. No incluye publicidad, venta de los datos ni publicación abierta de la imagen de quien participa." },
]);

export const GUARDIAN_RELATIONSHIPS = Object.freeze([
  ["mother", "Madre"], ["father", "Padre"], ["legal-representative", "Representante legal"], ["personal-care", "Tengo a mi cargo su cuidado personal"],
]);

export function isConsentAuthorizer(authorizer) {
  return authorizer?.role === "participant" && authorizer.ageDeclaration === "16-or-older" ||
    authorizer?.role === "representative" && authorizer.ageDeclaration === "under-16" &&
    GUARDIAN_RELATIONSHIPS.some(([id]) => id === authorizer.relationship) && authorizer.authorityConfirmed === true;
}

export function privacyReady(notice = PRIVACY_NOTICE) {
  return notice.approvedForPublication === true && !!notice.controller?.trim() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notice.contact || "") && !!notice.retention?.trim();
}

export function recordingRetentionPeriod(submittedAt = Date.now()) {
  const start = new Date(submittedAt);
  if (!Number.isFinite(submittedAt) || !Number.isFinite(start.getTime())) throw new Error("Fecha de envío no válida.");
  const end = new Date(submittedAt), day = end.getUTCDate();
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + PRIVACY_NOTICE.retentionMonths);
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(day, lastDay));
  return { months: PRIVACY_NOTICE.retentionMonths, startsAt: start.toISOString(), expiresAt: end.toISOString() };
}

export function isLocalPrivacyPreview({ enabled, hostname } = {}) {
  return enabled === "1" && ["localhost", "127.0.0.1", "[::1]", "::1"].includes(hostname);
}

export function createConsentReceipt(choices, { preview = false, notice = PRIVACY_NOTICE, now = Date.now(), id } = {}) {
  if (!CONSENT_CHOICES.every(({ id: key }) => choices?.[key] === true)) {
    throw new Error("Revisa y marca cada autorización antes de continuar.");
  }
  if (!isConsentAuthorizer(choices.authorizer)) throw new Error("Indica quién autoriza y, si corresponde, su relación y facultad para representar a quien participa.");
  if (!preview && !privacyReady(notice)) {
    throw new Error("El aviso está en revisión: faltan el contacto, el plazo de conservación o su aprobación.");
  }
  const receipt = {
    id: id || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `consent-${now}-${Math.random().toString(36).slice(2)}`),
    noticeVersion: notice.version,
    acceptedAt: now,
    mode: preview ? "local-preview" : "contribution",
    authorizer: { ...choices.authorizer },
    choices: Object.fromEntries(CONSENT_CHOICES.map(({ id: key }) => [key, true])),
    notice: { ...notice },
  };
  if (!isConsentReceipt(receipt, { allowPreview: preview, now })) throw new Error("No se pudo registrar la autorización.");
  return receipt;
}

export function isConsentReceipt(receipt, { allowPreview = false, now = Date.now() } = {}) {
  return !!receipt && typeof receipt.id === "string" && /^[\w-]{1,120}$/.test(receipt.id) &&
    receipt.noticeVersion === PRIVACY_NOTICE.version && receipt.notice?.version === receipt.noticeVersion &&
    Number.isFinite(receipt.acceptedAt) && receipt.acceptedAt > 0 && receipt.acceptedAt <= now &&
    CONSENT_CHOICES.every(({ id }) => receipt.choices?.[id] === true) &&
    isConsentAuthorizer(receipt.authorizer) &&
    (receipt.mode === "contribution" && privacyReady(receipt.notice) || allowPreview && receipt.mode === "local-preview");
}

export function assertRecordingConsent(draft, currentConsent = draft?.consent) {
  if (!isConsentReceipt(draft?.consent) || !isConsentReceipt(currentConsent) ||
      draft.consent.id !== currentConsent.id || draft.consent.acceptedAt > draft.createdAt) {
    throw new Error("Esta toma no tiene una autorización vigente registrada antes de capturar. Graba un aporte nuevo después de autorizar.");
  }
}

// La vista local no puede escribir en el backend real, ni siquiera al reutilizar un formulario existente.
export function createPrivacyPreviewFetch(fetcher, preview) {
  return (input, options = {}) => {
    const method = (options.method || input?.method || "GET").toUpperCase();
    if (preview && !["GET", "HEAD"].includes(method)) {
      return Promise.reject(new Error("Prueba local: el envío de datos reales está deshabilitado."));
    }
    return fetcher(input, options);
  };
}
