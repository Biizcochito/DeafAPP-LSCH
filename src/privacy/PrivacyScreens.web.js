import { useEffect, useRef, useState } from "react";
import { AppIcon, InterpretationLink } from "../app/AppWorkspace";
import HandConstellation from "../ui/HandConstellation";
import { CONSENT_CHOICES, GUARDIAN_RELATIONSHIPS, PRIVACY_NOTICE, isConsentAuthorizer, privacyReady } from "./privacyConsent";
import { LEGAL_SOURCE, LEGAL_BILL_SOURCE, LEGAL_NEWS_SOURCE, LEGAL_STATUS, TERMS_SECTIONS, privacySections } from "./privacyDocuments";
import "../ui/theme.css";
import "./PrivacyScreens.css";

function Header({ onBack, onInterpret, busy }) {
  return <header className="privacy-header"><a className="privacy-brand" href="/app" onClick={event => { event.preventDefault(); onBack(); }}><img src="/brand/deafapp-mark.svg" alt="" width="35" height="35" /><span>Deaf<span>App</span></span><small>Beta</small></a><div className="privacy-header-actions"><button className="privacy-back" onClick={onBack}><AppIcon name="back" size={18} />Volver al catálogo</button><InterpretationLink onInterpret={onInterpret} disabled={busy}/></div></header>;
}
function PrivacyBanner({ preview }) {
  return <div className="privacy-draft" role="status"><span aria-hidden="true" />{preview ? "Vista de prueba local" : "Participación voluntaria"}<span className="privacy-draft-note">{preview ? "Sin cámara ni envío de grabaciones" : "Tú decides antes de grabar"}</span></div>;
}
function useHeading() {
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); window.scrollTo(0, 0); }, []);
  return heading;
}
function Links() {
  return <div className="privacy-links"><a href="/privacidad" target="_blank" rel="noreferrer">Aviso de privacidad<AppIcon name="arrow" size={15} /></a><a href="/terminos" target="_blank" rel="noreferrer">Términos y condiciones<AppIcon name="arrow" size={15} /></a></div>;
}

export function PrivacyConsent({ onAccept, onBack, onInterpret, preview, notice = PRIVACY_NOTICE }) {
  const [choices, setChoices] = useState({});
  const [authorizer, setAuthorizer] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const heading = useHeading();
  const complete = CONSENT_CHOICES.every(({ id }) => choices[id] === true) && isConsentAuthorizer(authorizer);
  const enabled = preview || privacyReady(notice);
  async function accept(event) {
    event.preventDefault();
    if (!complete || busy || !enabled) return;
    setBusy(true); setError("");
    try { await onAccept({ ...choices, authorizer }); } catch (cause) { setError(cause.message || "No se pudo guardar tu decisión. Inténtalo de nuevo."); }
    finally { setBusy(false); }
  }
  return <div className="deaf-app privacy-page"><Header onBack={onBack} onInterpret={onInterpret} busy={busy}/><main className="privacy-shell"><PrivacyBanner preview={preview} />
    <div className="privacy-grid">
      <section className="privacy-intro" aria-labelledby="privacy-consent-title">
        <p className="privacy-eyebrow"><AppIcon name="lock" size={17} />ANTES DE GRABAR</p>
        <h1 id="privacy-consent-title" tabIndex={-1} ref={heading}>Autorización<br /><span>para grabar.</span></h1>
        <p className="privacy-lead">Tu aporte puede ayudar a reconocer la Lengua de Señas Chilena. Tú decides si compartirlo y para qué.</p>
        <div className="privacy-facts">
          <div><span className="privacy-fact-icon"><AppIcon name="camera" /></span><div><h2>Qué contiene</h2><p>Imágenes de tu seña y puntos de manos y rostro. Tu cara puede permitir reconocerte.</p></div></div>
          <div><span className="privacy-fact-icon"><AppIcon name="users" /></span><div><h2>Para qué se usa</h2><p>Revisar aportes y entrenar y evaluar reconocimiento de LSCh en DeafApp.</p></div></div>
          <div><span className="privacy-fact-icon"><AppIcon name="heart" /></span><div><h2>Todas las edades pueden sumar</h2><p>Niños y niñas participan con la autorización de quien les representa. También puedes explorar sin autorizar una grabación.</p></div></div>
        </div>
        <Links />
      </section>
      <section className="privacy-choice-card" aria-labelledby="privacy-choice-title">
        <div className="privacy-card-top"><span className="privacy-step">01 / AUTORIZACIÓN</span><AppIcon name="lock" size={21} /></div>
        <h2 id="privacy-choice-title">Lee. Elige. Continúa.</h2>
        <p className="privacy-card-description">Cada casilla expresa una decisión distinta. Ninguna está marcada por ti.</p>
        <form onSubmit={accept}>
          <fieldset className="privacy-authorizers" disabled={busy}><legend>¿Quién autoriza este aporte?</legend>
            <label className="privacy-authorizer"><input type="radio" name="authorizer" checked={authorizer?.role === "participant"} onChange={() => { setAuthorizer({ role: "participant", ageDeclaration: "16-or-older" }); setChoices({}); }} /><span><strong>Yo, por mi propio aporte</strong><small>Participación directa desde los 16 años.</small></span></label>
            <label className="privacy-authorizer"><input type="radio" name="authorizer" checked={authorizer?.role === "representative"} onChange={() => { setAuthorizer({ role: "representative", ageDeclaration: "under-16", relationship: "", authorityConfirmed: false }); setChoices({}); }} /><span><strong>Su madre, padre o representante</strong><small>Para la participación de personas menores de 16 años.</small></span></label>
          </fieldset>
          {authorizer?.role === "representative" && <div className="privacy-guardian">
            <label htmlFor="privacy-guardian-relationship">Mi relación con quien participa</label>
            <select id="privacy-guardian-relationship" value={authorizer.relationship} onChange={event => setAuthorizer(value => ({ ...value, relationship: event.target.value, authorityConfirmed: false }))} disabled={busy}><option value="">Selecciona tu relación</option>{GUARDIAN_RELATIONSHIPS.map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select>
            <label className="privacy-check"><input type="checkbox" checked={authorizer.authorityConfirmed} onChange={event => setAuthorizer(value => ({ ...value, authorityConfirmed: event.target.checked }))} disabled={busy} /><span><strong>Declaro que tengo facultad legal para autorizar este aporte y que actúo en interés de quien participa.</strong></span></label>
            <p>{preview ? "Esta prueba solo muestra la declaración y no recoge imágenes de menores." : "Autoriza únicamente si tienes facultades para representar a quien participa. El responsable podrá solicitar su comprobación antes de utilizar el aporte."}</p>
          </div>}
          <fieldset disabled={busy}><legend className="privacy-sr-only">Autorizaciones para aportar una grabación</legend>
            {CONSENT_CHOICES.map(choice => <label className="privacy-check" key={choice.id}><input type="checkbox" name={choice.id} checked={choices[choice.id] === true} onChange={event => setChoices(value => ({ ...value, [choice.id]: event.target.checked }))} /><span><strong>{choice.title}</strong><small>{choice.detail}</small></span></label>)}
          </fieldset>
          <dl className="privacy-responsible"><div><dt>Responsable</dt><dd>{notice.controller}</dd></div><div><dt>Contacto de privacidad</dt><dd>{notice.contact || "Pendiente de definir"}</dd></div><div><dt>Conservación en la biblioteca privada</dt><dd>{notice.retention || "Pendiente de definir"}</dd></div></dl>
          <p className="privacy-small">Este aviso actualiza el plazo para nuevos aportes. Los que ya enviaste mantienen el plazo autorizado entonces. Para grabar de nuevo, revisa y autoriza esta versión.</p>
          <p className="privacy-preview-note">{preview ? "Estás probando el recorrido. La autorización se guardará solo en este navegador; no se activará la cámara ni se enviarán datos." : enabled ? "Primero se registra tu autorización. Después podrás permitir la cámara y revisar tu aporte antes de enviarlo." : "La recepción de nuevos aportes está pausada mientras se completa y revisa este aviso."}</p>
          {error && <p role="alert" className="privacy-error">{error}</p>}
          <button className="privacy-primary" type="submit" disabled={!complete || busy || !enabled}>{busy ? "Guardando tu decisión…" : preview ? "Probar autorización" : "Autorizar y continuar"}<AppIcon name="arrow" size={20} /></button>
          <button className="privacy-skip" type="button" onClick={onBack} disabled={busy}>Seguir explorando sin autorizar</button>
        </form>
        <p className="privacy-version">{notice.version} · Ley 21.719</p>
      </section>
    </div>
  </main></div>;
}

export function PrivacyDocument({ kind, onBack, onInterpret, onConsent, onWithdraw, consent, message, preview, notice = PRIVACY_NOTICE }) {
  const terms = kind === "terminos";
  const sections = terms ? TERMS_SECTIONS : privacySections(notice);
  const heading = useHeading();
  return <div className="deaf-app privacy-page"><Header onBack={onBack} onInterpret={onInterpret}/><main className="privacy-shell privacy-document"><PrivacyBanner preview={preview} />
    <p className="privacy-eyebrow">DEAFAPP · TUS DATOS Y TUS DERECHOS</p>
    <h1 tabIndex={-1} ref={heading}>{terms ? "Términos y condiciones." : "Privacidad y datos personales."}</h1>
    <p className="privacy-lead">{terms ? "Una participación voluntaria, con límites claros para tu aporte." : "Antes de compartir una seña, conoce qué contiene y qué puedes decidir."}</p>
    <div className="privacy-document-meta"><span>{notice.date}</span><span>{notice.version}</span><span>{preview ? "Prueba local" : "Versión vigente"}</span></div>
    <div className="privacy-document-layout">
      <aside className="privacy-document-nav"><h2>En este documento</h2><ol>{sections.map((section, index) => <li key={section.title}><a href={`#legal-${index}`}>{section.title}</a></li>)}</ol><Links /></aside>
      <article>{sections.map((section, index) => <section id={`legal-${index}`} className="privacy-document-section" key={section.title}><span>{String(index + 1).padStart(2, "0")}</span><div><h2>{section.title}</h2><p>{section.text}</p></div></section>)}
        <section className="privacy-manage" aria-labelledby="privacy-manage-title"><h2 id="privacy-manage-title">Tu decisión en este dispositivo</h2>
          {consent ? <><p>Tienes una autorización {consent.mode === "local-preview" ? "de prueba local" : "registrada"} del {new Date(consent.acceptedAt).toLocaleString("es-CL")}.</p><p className="privacy-receipt-id">Comprobante: {consent.id}</p><button className="privacy-secondary" onClick={onWithdraw}>Retirar autorización de este dispositivo</button><p className="privacy-small">Se borrará el comprobante local. Esto no solicita ni confirma la eliminación de aportes que se hayan enviado anteriormente.</p></> : <><p>No hay una autorización activa en este dispositivo. Puedes explorar el catálogo sin concederla.</p><button className="privacy-primary" onClick={onConsent}>Ver autorización<AppIcon name="arrow" size={18} /></button></>}
          {message && <p role="status" className="privacy-feedback">{message}</p>}
        </section>
        <p className="privacy-source">{terms && `${LEGAL_STATUS} `}Fuentes consultadas al 31 de octubre de 2026: <a href={LEGAL_SOURCE} target="_blank" rel="noreferrer">Ley 21.719 en la Biblioteca del Congreso Nacional</a>; <a href={LEGAL_BILL_SOURCE} target="_blank" rel="noreferrer">tramitación del boletín 18.623-07 en el Senado</a>; <a href={LEGAL_NEWS_SOURCE} target="_blank" rel="noreferrer">noticia de la aprobación en el Senado (28 de octubre)</a>.</p>
      </article>
    </div>
  </main></div>;
}

export function PrivacyPreviewComplete({ consent, onBack, onInterpret, onPrivacy }) {
  const heading = useHeading();
  return <div className="deaf-app privacy-page"><Header onBack={onBack} onInterpret={onInterpret}/><main className="privacy-shell"><PrivacyBanner preview /><section className="privacy-complete">
    <div className="privacy-complete-art" aria-hidden="true"><HandConstellation poses={["open", "soft"]} hold={2800} /></div>
    <p className="privacy-eyebrow"><AppIcon name="check" size={18} />DECISIÓN GUARDADA EN ESTE NAVEGADOR</p>
    <h1 tabIndex={-1} ref={heading}>Así empieza<br /><span>un aporte consciente.</span></h1>
    <p className="privacy-lead">La autorización de prueba quedó registrada. La cámara sigue apagada y no hemos enviado ninguna grabación.</p>
    <div className="privacy-complete-details"><span><AppIcon name="lock" size={18} />Sin captura de imagen</span><span><AppIcon name="check" size={18} />{consent?.authorizer?.role === "representative" ? "Autorización de representante (prueba)" : "Autorización personal (prueba)"}</span></div>
    <p className="privacy-receipt-id">Comprobante local: {consent?.id}</p>
    <div className="privacy-complete-actions"><button className="privacy-primary" onClick={onPrivacy}>Revisar o retirar mi autorización<AppIcon name="arrow" size={18} /></button><button className="privacy-secondary" onClick={onBack}>Volver al catálogo</button></div>
  </section></main></div>;
}
