import { AppIcon } from "./AppWorkspace";
import "./ui/theme.css";
import "./RecordingScreens.css";

const STEPS = ["Prepara tus manos", "Cuenta atrás", "Haz la seña"];
// Los colores del trazado sobre la cámara (ver landmarkTracking.js) para que la leyenda coincida.
const LEGEND = [["#F7DC6F", "Amarillo: cara"], ["#4ECDC4", "Verde: mano derecha"], ["#79B8FF", "Azul: mano izquierda"]];

function Top({ word, category, kicker, onBack, backDisabled }) {
  return <header className="rs-top">
    <button className="rs-back" aria-label="Volver a la lista" onClick={onBack} disabled={backDisabled}><AppIcon name="back" size={19} /><span>Volver</span></button>
    <div className="rs-word"><span className="rs-cat" aria-hidden="true">{category?.emoji}</span><div><small>{kicker}</small><h1 tabIndex={-1}>{word}</h1></div></div>
  </header>;
}

function Frame({ max, children }) {
  return <section className="rs-camera"><div className="rs-frame" style={{ maxWidth: max }}>{children}
    <span className="rs-corner rs-corner-tl" aria-hidden="true" /><span className="rs-corner rs-corner-tr" aria-hidden="true" /><span className="rs-corner rs-corner-bl" aria-hidden="true" /><span className="rs-corner rs-corner-br" aria-hidden="true" />
  </div></section>;
}

// En móvil la guía (pasos e instrucción) va encima de la cámara y los controles debajo;
// en escritorio ambos forman una columna a la derecha de la cámara.
// Pantalla de cámara. `camera` es el contenedor de React Native con la cámara y sus avisos, sin cambios.
export function RecordingStage({ word, category, tone, onBack, camera, camMax, step, instruction, repeating, help, error, tracing, onRestartCamera, locked, primary, canCancel, onCancel, busy }) {
  return <div className="deaf-app rs-stage" style={{ "--tone": tone }}>
    <Top word={word} category={category} kicker="Te toca grabar" onBack={onBack} />
    <main className="rs-main">
      <Frame max={camMax}>{camera}</Frame>
      <div className="rs-side">
        <div className="rs-guide">
          <ol className="rs-steps" aria-label="Pasos de la grabación">{STEPS.map((label, i) => <li key={label} data-state={step > i + 1 ? "done" : step === i + 1 ? "active" : step === 0 && i === 0 ? "next" : "idle"} aria-current={step === i + 1 ? "step" : undefined}><span>{step > i + 1 ? <AppIcon name="check" size={15} /> : i + 1}</span><b>{label}</b></li>)}</ol>
          <p className="rs-instruction" aria-live="polite">{instruction}</p>
          {repeating && <p className="rs-note">Conservaremos tu grabación anterior hasta que termines una nueva.</p>}
          {help && <p className="rs-help" role="status">{help}</p>}
          {error && <p className="rs-error" role="alert">{error}</p>}
        </div>
        <div className="rs-controls">
          <div className="rs-tools">
            <button className="rs-switch" role="switch" aria-checked={tracing.on} aria-label="Mostrar trazado de cara y manos" disabled={locked} onClick={tracing.toggle}><span className="rs-switch-track"><i /></span><span>{tracing.on ? "Ocultar trazado" : "Mostrar trazado"}</span></button>
            {tracing.on && <p className="rs-tracking-status">{tracing.status}</p>}
            {tracing.on && <ul className="rs-legend">{LEGEND.map(([color, text]) => <li key={text}><i style={{ background: color }} aria-hidden="true" />{text}</li>)}</ul>}
            <button className="rs-tool" aria-label="Reiniciar cámara" disabled={locked} onClick={onRestartCamera}><AppIcon name="refresh" size={18} />Reiniciar cámara</button>
          </div>
          <div className="rs-actions">
            {busy && <p className="rs-busy" role="status"><i className="rs-spin" aria-hidden="true" />{busy}</p>}
            {primary && <button className="rs-primary" aria-label={primary.label} disabled={primary.disabled} onClick={primary.onPress}><i className="rs-rec" aria-hidden="true" /><span>{primary.label}</span></button>}
            {canCancel && <button className="rs-secondary" aria-label="Cancelar grabación" onClick={onCancel}>Cancelar grabación</button>}
          </div>
        </div>
      </div>
    </main>
  </div>;
}

// Revisión de la grabación antes de enviarla.
export function RecordingReview({ word, category, tone, camMax, ratio, frameUri, index, total, playing, seconds, onTogglePlay, onBack, onSend, onRepeat, onLater, sending, failed, saved, localMessage, error }) {
  const note = saved ? "Tu grabación está guardada en este dispositivo. Podrás recuperarla al volver a abrir esta misma web." : localMessage;
  return <div className="deaf-app rs-stage" style={{ "--tone": tone }}>
    <Top word={word} category={category} kicker="Revisa tu seña" onBack={onBack} backDisabled={sending} />
    <main className="rs-main">
      <Frame max={camMax}>
        <div className="rs-preview" style={{ aspectRatio: ratio }}>
          <img alt={`Vista previa de la seña ${word}`} src={frameUri} />
          <span className="rs-chip">Vista previa</span>
          <span className="rs-playbar"><i style={{ width: `${((index + 1) / total) * 100}%` }} /></span>
        </div>
      </Frame>
      <div className="rs-side">
        <div className="rs-guide">
          <p className="rs-instruction">Comprueba que la seña se vea completa. Puedes repetirla o enviarla cuando estés conforme.</p>
        </div>
        <div className="rs-controls">
          <div className="rs-playrow">
            <button className="rs-tool" aria-label={playing ? "Pausar vista previa" : "Reproducir vista previa"} disabled={sending} onClick={onTogglePlay}><AppIcon name={playing ? "pause" : "play"} size={18} />{playing ? "Pausar" : "Reproducir"}</button>
            <span>{seconds} segundos</span>
          </div>
          {note && <p className="rs-help" role="status">{note}</p>}
          {error && <p className="rs-error" role="alert">{error}</p>}
          <div className="rs-actions">
            <button className="rs-primary" aria-label={failed ? "Reintentar envío" : "Enviar seña"} disabled={sending} onClick={onSend}>{sending ? <><i className="rs-spin" aria-hidden="true" />Enviando tu seña…</> : <><AppIcon name="send" size={20} />{failed ? "Reintentar envío" : "Enviar seña"}</>}</button>
            <button className="rs-secondary" aria-label="Repetir grabación" disabled={sending} onClick={onRepeat}><AppIcon name="repeat" size={18} />Repetir grabación</button>
            <button className="rs-link" aria-label={saved ? "Guardar para después" : "Volver a la lista"} disabled={sending} onClick={onLater}>{saved ? "Guardar para después" : "Volver a la lista"}</button>
          </div>
        </div>
      </div>
    </main>
  </div>;
}

// Confirmación después de enviar. Solo habla del envío: no hay estado de revisión que mostrar.
export function RecordingDone({ word, tone, times, onAgain, onMine, onBack }) {
  return <div className="deaf-app rs-stage" style={{ "--tone": tone }}>
    <main className="rs-done">
      <div className="rs-done-badge" aria-hidden="true"><AppIcon name="check" size={58} /></div>
      <h1 tabIndex={-1}>¡Gracias!</h1>
      <p>Tu seña «{word}» fue enviada.</p>
      {times > 1 && <p className="rs-done-times">Ya van {times} grabaciones tuyas de esta seña.</p>}
      <div className="rs-actions">
        <button className="rs-primary" aria-label="Grabar otra vez" onClick={onAgain}><AppIcon name="camera" size={22} />Grabar otra vez</button>
        <button className="rs-secondary" aria-label="Ver mis aportes" onClick={onMine}><AppIcon name="user" size={18} />Ver mis aportes</button>
        <button className="rs-link" aria-label="Volver a la lista" onClick={onBack}>Volver a la lista</button>
      </div>
    </main>
  </div>;
}
