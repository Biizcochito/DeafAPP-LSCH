import { CameraView } from "expo-camera";
import { AppIcon } from "./AppWorkspace";
import { displayWord } from "./ui/signNames";
import useTranslator from "./useTranslator";
import { TOTAL_FOTOGRAMAS, titularDeResultado } from "./translator";
import "./ui/theme.css";
import "./TranslatorScreen.css";

// «Probar el traductor»: una seña por clip. Se cuenta 3, 2, 1, se capturan 30 fotogramas (igual que la grabación) y
// la API de LSCh responde con las 3 señas más probables. La API corre en el PC del proyecto (ver el README del backend).
export default function TranslatorScreen({ onBack }) {
  const t = useTranslator({ protocoloPagina: typeof window !== "undefined" ? window.location.protocol : "" });
  const { servidor, fase, resumen } = t;
  const sinPermiso = t.permission && !t.permission.granted;

  return <div className="deaf-app tr-stage">
    <header className="tr-top">
      <button className="tr-back" aria-label="Volver" onClick={onBack} disabled={t.ocupada}><AppIcon name="back" size={19} /><span>Volver</span></button>
      <div className="tr-title"><h1 tabIndex={-1}>Probar el traductor</h1><span className="tr-beta">Beta</span></div>
    </header>
    <main className="tr-main">
      <section className="tr-camera" aria-label="Cámara">
        <div className="tr-frame">
          {!t.permission ? <div className="tr-cover"><p>Comprobando la cámara…</p></div>
            : sinPermiso ? <div className="tr-cover"><AppIcon name="camera" size={40} /><p>Necesito la cámara para ver tus manos.</p><button className="app-button" onClick={t.requestPermission}>Permitir cámara<AppIcon name="arrow" size={19} /></button></div>
            : <CameraView ref={t.camara} facing="front" style={{ width: "100%", height: "100%" }} onCameraReady={() => t.setCamaraLista(true)} onMountError={t.falloDeCamara} />}
          {fase === "cuenta" && t.cuenta && <div className="tr-overlay" aria-live="assertive"><span className="tr-count">{t.cuenta}</span></div>}
          {fase === "capturando" && <div className="tr-progress" role="status"><span>Haz la seña</span><i><b style={{ "--p": `${(t.progreso / TOTAL_FOTOGRAMAS) * 100}%` }} /></i><span>{t.progreso}/{TOTAL_FOTOGRAMAS}</span></div>}
          {fase === "analizando" && <div className="tr-overlay tr-analizando" role="status"><span>Analizando…</span></div>}
          <span className="tr-corner tr-corner-tl" aria-hidden="true" /><span className="tr-corner tr-corner-tr" aria-hidden="true" /><span className="tr-corner tr-corner-bl" aria-hidden="true" /><span className="tr-corner tr-corner-br" aria-hidden="true" />
        </div>
      </section>

      <section className="tr-side">
        <p className="tr-status" data-state={servidor.fase} role="status">
          {servidor.fase === "comprobando" ? "Conectando con el servidor…" : servidor.fase === "ok" ? `Servidor conectado · ${servidor.clases.length} palabras` : "Sin conexión con el servidor"}
        </p>
        {servidor.fase === "error" && <p className="tr-error" role="alert">{servidor.mensaje} Revisa la dirección en «Servidor».</p>}
        {t.advertencia && <p className="tr-error" role="alert">{t.advertencia}</p>}

        {fase === "resultado" && resumen ? <section className="tr-result" aria-live="polite">
          <small>{resumen.sinManos ? "No pude verte las manos" : "Resultado"}</small>
          <h2>{titularDeResultado(resumen)}</h2>
          {!resumen.sinManos && <ol className="tr-bars">{resumen.candidatos.map(c => <li key={c.sena} data-main={c.principal || undefined}><span>{c.nombre}</span><i style={{ "--p": `${c.porcentaje}%` }} /><b>{c.porcentaje}%</b></li>)}</ol>}
          <div className="tr-actions">
            <button className="app-button" onClick={t.traducir} disabled={!t.listaParaTraducir}>Traducir otra seña<AppIcon name="refresh" size={19} /></button>
            {!resumen.sinManos && <button className="app-button app-button-secondary" onClick={t.escuchar}>Escuchar<AppIcon name="play" size={19} /></button>}
          </div>
          {!resumen.sinManos && <p className="tr-note">Con pocos datos el traductor puede equivocarse, por eso muestra tres opciones: la seña correcta suele estar entre ellas.</p>}
        </section> : <>
          <ol className="tr-guide">
            <li><b>1</b><span>Colócate de modo que se vean tus manos y tu cara.</span></li>
            <li><b>2</b><span>Pulsa «Traducir una seña» y espera la cuenta atrás.</span></li>
            <li><b>3</b><span>Haz una seña durante unos 3 segundos.</span></li>
          </ol>
          {fase === "error" && <p className="tr-error" role="alert">{t.error}</p>}
          <button className="app-button tr-cta" onClick={t.traducir} disabled={!t.listaParaTraducir}>{t.ocupada ? (fase === "analizando" ? "Analizando…" : "Un momento…") : "Traducir una seña"}<AppIcon name="camera" size={19} /></button>
        </>}

        {servidor.fase === "ok" && servidor.clases.length > 0 && <details className="tr-details">
          <summary>Palabras que reconoce ({servidor.clases.length})</summary>
          <p className="tr-chips">{servidor.clases.map(c => <span key={c}>{displayWord(c)}</span>)}</p>
        </details>}

        <details className="tr-details" open={servidor.fase === "error" || undefined}>
          <summary>Servidor</summary>
          <form className="tr-server" onSubmit={event => { event.preventDefault(); t.guardarServidor(); }}>
            <label htmlFor="tr-url">Dirección de la API de LSCh</label>
            <input id="tr-url" value={t.borrador} onChange={e => t.setBorrador(e.target.value)} inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="https://algo.trycloudflare.com" />
            {t.errorUrl && <p className="tr-error" role="alert">{t.errorUrl}</p>}
            <button className="app-button app-button-secondary" type="submit">Guardar y probar<AppIcon name="check" size={19} /></button>
          </form>
        </details>
      </section>
    </main>
  </div>;
}
