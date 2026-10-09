import { useEffect, useRef, useState } from "react";
import CountUp from "./ui/CountUp";
import HandConstellation from "./ui/HandConstellation";
import { toneFor } from "./ui/categoryTones";
import { displayWord } from "./ui/signNames";
import { ROADMAP, VALUES } from "./ui/projectInfo";
import "./ui/theme.css";
import "./AppWorkspace.css";

const paths = {
  camera: ["M4 7h4l2-3h4l2 3h4v13H4Z", "M16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"],
  search: ["M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z", "m15 15 6 6"],
  arrow: ["M5 12h14", "m14 7 5 5-5 5"],
  back: ["m14 5-7 7 7 7"],
  chevron: ["m9 5 7 7-7 7"],
  more: ["M4 7h16", "M4 12h16", "M4 17h10"],
  close: ["m6 6 12 12M6 18 18 6"],
  check: ["m5 12 4 4L19 6"],
  lock: ["M6 11h12v10H6Z", "M8 11V7a4 4 0 0 1 8 0v4", "M12 15v2"],
  message: ["M21 3H3v14h5l4 4 4-4h5Z", "M7 8h10M7 12h6"],
  user: ["M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z", "M4 21v-2a8 8 0 0 1 16 0v2"],
  question: ["M9 7a3 3 0 0 1 6 1c0 3-3 3-3 6M12 18h.01", "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z"],
  home: ["m3 10 9-8 9 8v11H3Z", "M9 21v-8h6v8"],
  heart: ["M12 20.5 4.2 13A5 5 0 0 1 12 6.6 5 5 0 0 1 19.8 13Z"],
  eye: ["M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z", "M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"],
  users: ["M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z", "M6 21v-3a6 6 0 0 1 12 0v3", "M4 7a3 3 0 0 0 0 6M20 7a3 3 0 0 1 0 6M2 21v-4M22 21v-4"],
  play: ["m8 5 11 7-11 7Z"],
  pause: ["M7 5h3v14H7Z", "M14 5h3v14h-3Z"],
  refresh: ["M3 12a9 9 0 0 1 15.5-6.2L21 8", "M21 3v5h-5", "M21 12a9 9 0 0 1-15.5 6.2L3 16", "M3 21v-5h5"],
  repeat: ["M17 2l4 4-4 4", "M3 11V9a3 3 0 0 1 3-3h15", "m7 22-4-4 4-4", "M21 13v2a3 3 0 0 1-3 3H3"],
  send: ["M22 2 11 13", "M22 2l-7 20-4-9-9-4Z"],
};
export function AppIcon({ name, size = 22 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{(paths[name] || paths.question).map((d, i) => <path key={i} d={d} />)}</svg>;
}
const normalize = value => value.toLocaleLowerCase("es").normalize("NFD").replace(/[̀-ͯ]/g, "");

function Brand() { return <div className="app-brand"><img src="/brand/deafapp-mark.svg" alt="" width="36" height="36" /><span>Deaf<span>App</span></span><span className="app-beta">Beta</span></div>; }
function AppButton({ children, icon = "arrow", secondary = false, ...props }) { return <button className={`app-button${secondary ? " app-button-secondary" : ""}`} {...props}>{children}{icon && <AppIcon name={icon} size={19} />}</button>; }
// Una celda por seña de la categoría: se enciende con el color de la categoría cuando la persona la grabó.
function Cells({ category, timesOf }) {
  return <span className="app-cells" aria-hidden="true" style={{ "--n": category.señas.length }}>{category.señas.map((word, i) => <i key={word} data-on={timesOf(category, word) > 0 || undefined} style={{ "--i": i }} title={displayWord(word)} />)}</span>;
}
function Tracker({ category, timesOf, tone }) {
  const done = category.señas.filter(word => timesOf(category, word) > 0).length;
  return <section className="app-tracker" style={{ "--tone": tone }} data-complete={done === category.señas.length || undefined}>
    <p className="app-tracker-count"><strong>{done}</strong><span>de {category.señas.length}<small>señas que has grabado</small></span></p>
    <Cells category={category} timesOf={timesOf} />
  </section>;
}
function Search({ value, onChange, placeholder = "Buscar una seña o categoría" }) {
  return <div className="app-search"><AppIcon name="search" size={20} /><input aria-label={placeholder} placeholder={placeholder} type="search" value={value} onChange={e => onChange(e.target.value)} autoComplete="off" />{value && <button aria-label="Limpiar búsqueda" onClick={() => onChange("")}><AppIcon name="close" size={18} /></button>}</div>;
}
const feedbackTypes = [["sugerencia", "Sugerencia"], ["error", "Error"], ["seña_nueva", "Seña nueva"], ["otro", "Otro"]];
const navItems = [["home", "camera", "Grabar"], ["aportes", "user", "Mis aportes"], ["mas", "more", "Más"]];
const times = n => (n === 1 ? "1 vez" : `${n} veces`);

// `contributions` son los aportes de esta persona en este dispositivo ("categoría/seña" -> { n, last }).
// No hay cifras globales ni estado de revisión: cada quien ve solo lo que ha grabado.
export default function AppWorkspace({ screen, navigate, categories, category, contributions, pending, onResume, onCategory, onRecord, feedback }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const scrollRef = useRef(null);
  const headingRef = useRef(null);
  const previousScreen = useRef(screen);
  useEffect(() => {
    if (previousScreen.current !== screen) {
      setQuery(""); setFilter("all"); scrollRef.current?.scrollTo(0, 0);
      headingRef.current?.focus({ preventScroll: true }); previousScreen.current = screen;
    }
  }, [screen]);
  const toneOf = cat => toneFor(categories, cat);
  const timesOf = (cat, word) => contributions[`${cat.id}/${word}`]?.n || 0;
  const doneOf = cat => cat.señas.filter(word => timesOf(cat, word) > 0).length;
  const all = categories.flatMap(cat => cat.señas.map(word => ({ word, cat })));
  const recorded = all.filter(({ word, cat }) => timesOf(cat, word) > 0);
  const sent = recorded.reduce((sum, { word, cat }) => sum + timesOf(cat, word), 0);
  const touched = categories.filter(cat => doneOf(cat) > 0);
  // Ayuda y sugerencias viven en la cabecera: con ellas abiertas ningún destino de la barra queda activo.
  const nav = screen === "aportes" ? "aportes" : screen === "mas" ? "mas" : ["ayuda", "feedback"].includes(screen) ? null : "home";
  const navIndex = Math.max(0, navItems.findIndex(([id]) => id === nav));
  const matched = all.filter(({ word, cat }) => normalize(`${word} ${cat.nombre}`).includes(normalize(query.trim())));
  const categoryWords = (category?.señas || []).filter(word => normalize(displayWord(word)).includes(normalize(query.trim())) && (filter === "all" || (filter === "needed" ? timesOf(category, word) === 0 : timesOf(category, word) > 0)));
  const categoriesShown = categories.filter(cat => normalize(cat.nombre).includes(normalize(query.trim())));
  const title = { home: "¿Qué seña grabamos?", categoria: category?.nombre, aportes: "Tus aportes.", mas: "Más sobre DeafApp.", ayuda: "Antes de grabar.", feedback: "Te escuchamos." }[screen];
  const subtitle = { home: "Elige una palabra. Tu aporte cuenta.", categoria: "Elige la palabra que quieres aportar.", aportes: "Las señas que has grabado desde este dispositivo.", mas: "Cómo vamos y qué nos importa.", ayuda: "Unos minutos de preparación hacen la diferencia.", feedback: "Ayúdanos a mejorar la experiencia." }[screen];
  function WordRow({ word, cat }) {
    const n = timesOf(cat, word);
    return <li className="app-word-row" data-done={n > 0 || undefined} style={{ "--tone": toneOf(cat) }}>
      <div><h3>{displayWord(word)}</h3><p>{screen === "home" ? `${cat.nombre} · ` : ""}{n > 0 ? `La grabaste ${times(n)}` : "Aún no la has grabado"}</p></div>
      <button className="app-record-word" aria-label={`Grabar ${displayWord(word)}`} onClick={() => onRecord(word, cat)}><AppIcon name="camera" size={20} /><span>Grabar</span></button>
    </li>;
  }
  const heading = <><h1 tabIndex={-1} ref={headingRef}>{title}</h1><p>{subtitle}</p></>;
  return <div className="deaf-app has-side">
    <header className="app-topbar"><Brand /><div className="app-header-actions">
      <button className="app-icon-button" aria-label="Sugerencias" aria-current={screen === "feedback" ? "page" : undefined} onClick={() => navigate("feedback")}><AppIcon name="message" /><span className="app-icon-label">Sugerencias</span></button>
      <button className="app-icon-button" aria-label="Ayuda para grabar" aria-current={screen === "ayuda" ? "page" : undefined} onClick={() => navigate("ayuda")}><AppIcon name="question" /><span className="app-icon-label">Ayuda para grabar</span></button>
    </div></header>
    <main className="app-scroll" ref={scrollRef} id="app-content"><div className="app-content" key={screen}>
      {["categoria", "ayuda", "feedback"].includes(screen) && <button className="app-back" onClick={() => navigate("home")}><AppIcon name="back" size={19} />{screen === "categoria" ? "Categorías" : "Inicio"}</button>}
      {screen === "home"
        ? <div className="app-home-top"><div className="app-page-heading">{heading}</div><Search value={query} onChange={setQuery} /></div>
        : screen === "categoria" && category
          ? <div className="app-cat-banner" style={{ "--tone": toneOf(category) }}><div className="app-page-heading">{heading}<span className="app-cat-count">{category.señas.length} señas</span></div><span className="app-cat-emoji" aria-hidden="true">{category.emoji}</span></div>
          : <div className="app-page-heading">{heading}</div>}
      {screen === "home" && <>
        {pending && <section className="app-draft"><AppIcon name="camera" /><div><h2>Tu grabación está pendiente</h2><p>«{displayWord(pending.label)}» · Revisa antes de enviar.</p></div><button aria-label="Revisar grabación pendiente" onClick={onResume}><AppIcon name="arrow" /></button></section>}
        <div className="app-section-heading"><h2>{query.trim() ? "Resultados" : "Explora las categorías"}</h2><span>{query.trim() ? `${matched.length} ${matched.length === 1 ? "seña" : "señas"}` : `${categories.length} categorías`}</span></div>
        {query.trim() ? <>
          {categoriesShown.length > 0 && <div className="app-matched-categories">{categoriesShown.map(cat => <button key={cat.id} style={{ "--tone": toneOf(cat) }} onClick={() => onCategory(cat)}><i aria-hidden="true">{cat.emoji}</i>{cat.nombre}<AppIcon name="chevron" size={16} /></button>)}</div>}
          <ul className="app-word-list">{matched.map(({ word, cat }) => <WordRow key={`${cat.id}-${word}`} word={word} cat={cat} />)}</ul>
          {matched.length === 0 && <div className="app-empty"><AppIcon name="search" size={32} /><h2>No encontramos esa seña.</h2><p>Prueba con otra palabra o sugiere una seña para el catálogo.</p><AppButton secondary onClick={() => navigate("feedback")}>Sugerir una seña</AppButton></div>}
        </> : <div className="app-tiles">
          <section className="app-tile-featured grain" aria-label="Empieza con un hola">
            <div><h2>Empieza con un hola.</h2><p>Encuentra tu primera palabra en Saludos.</p><button onClick={() => onCategory(categories[0])}>Elegir una seña <AppIcon name="arrow" size={18} /></button></div>
            <div className="app-start-art" aria-hidden="true"><HandConstellation poses={["open", "soft", "relaxed", "point"]} hold={2200} /></div>
          </section>
          {categories.map(cat => {
            const done = doneOf(cat);
            return <button className="app-tile" key={cat.id} style={{ "--tone": toneOf(cat) }} aria-label={`${cat.nombre}: ${cat.señas.length} señas${done ? `, ${done} grabadas por ti` : ""}`} onClick={() => onCategory(cat)}>
              <span className="app-tile-name">{cat.nombre}</span>
              <span className="app-tile-emoji" aria-hidden="true">{cat.emoji}</span>
              <span className="app-tile-bottom" aria-hidden="true">
                <span className="app-tile-text"><b>{cat.señas.length} señas</b>{done > 0 && <span>{done === 1 ? "1 grabada por ti" : `${done} grabadas por ti`}</span>}</span>
                {done > 0 && <span className="app-tile-bar"><i style={{ width: `${(done / cat.señas.length) * 100}%` }} /></span>}
              </span>
            </button>;
          })}
        </div>}
      </>}
      {screen === "categoria" && category && <>
        <Search value={query} onChange={setQuery} placeholder={`Buscar en ${category.nombre}`} />
        <Tracker category={category} timesOf={timesOf} tone={toneOf(category)} />
        <div className="app-filter" aria-label="Filtrar señas">{[["all", "Todas"], ["needed", "Por grabar"], ["done", "Ya grabadas"]].map(([id, label]) => <button key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}</div>
        <ul className="app-word-list">{categoryWords.map(word => <WordRow key={word} word={word} cat={category} />)}</ul>
        {categoryWords.length === 0 && <div className="app-empty"><h2>No hay señas con este filtro.</h2><p>Cambia la búsqueda o vuelve a «Todas».</p><AppButton secondary onClick={() => { setQuery(""); setFilter("all"); }}>Ver todas</AppButton></div>}
        <p className="app-footnote">Tus aportes se guardan solo en este dispositivo. Puedes volver a grabar una seña cuando quieras.</p>
      </>}
      {screen === "aportes" && (recorded.length > 0 ? <>
        <dl className="app-stats app-stats-mine">
          <div className="app-stat app-stat-lime"><dt>Señas grabadas</dt><dd>{recorded.length < 20 ? recorded.length : <CountUp to={recorded.length} duration={1.2} />}</dd></div>
          <div className="app-stat app-stat-sky"><dt>Grabaciones enviadas</dt><dd>{sent}</dd></div>
          <div className="app-stat app-stat-coral"><dt>Categorías con aportes</dt><dd>{touched.length} de {categories.length}</dd></div>
        </dl>
        <div className="app-section-heading"><h2>Tus señas</h2></div>
        <ul className="app-progress-list">{touched.map(cat => <li key={cat.id} style={{ "--tone": toneOf(cat) }}><button onClick={() => onCategory(cat)}>
          <span className="app-progress-name"><i aria-hidden="true">{cat.emoji}</i>{cat.nombre}<AppIcon name="chevron" size={17} /></span>
          <span className="app-row-cells"><Cells category={cat} timesOf={timesOf} /><b>{doneOf(cat)}/{cat.señas.length}</b></span>
          <span className="app-mine-words">{cat.señas.filter(word => timesOf(cat, word) > 0).map(word => <span key={word}>{displayWord(word)}{timesOf(cat, word) > 1 && <b>×{timesOf(cat, word)}</b>}</span>)}</span>
        </button></li>)}</ul>
        <p className="app-footnote">Tus aportes se guardan solo en este dispositivo. Si borras los datos del navegador, este resumen empieza de nuevo.</p>
      </> : <div className="app-empty"><AppIcon name="camera" size={32} /><h2>Todavía no has grabado ninguna seña.</h2><p>Cuando envíes una, aparecerá aquí. Tus aportes se guardan solo en este dispositivo.</p><AppButton onClick={() => navigate("home")}>Elegir una seña</AppButton></div>)}
      {screen === "mas" && <>
        <div className="app-about-grid">
          <section className="app-about-hero grain">
            <div><h2>Un proyecto en construcción.</h2><p>Estamos reuniendo grabaciones para preparar un futuro reconocimiento de Lengua de Señas Chilena. La traducción en tiempo real aún no está disponible.</p><p>DeafApp es una herramienta de apoyo. No busca reemplazar a los intérpretes.</p><span className="app-version">DeafApp · LSCh · Beta</span></div>
            <div className="app-start-art" aria-hidden="true"><HandConstellation poses={["relaxed", "open", "soft", "point"]} hold={2400} /></div>
          </section>
          <button className="app-about-link" onClick={() => navigate("traductor")}><span className="app-menu-icon"><AppIcon name="camera" /></span><span><strong>Probar el traductor (beta)</strong><small>Haz una seña y mira qué cree el sistema. Reconoce pocas palabras: es una prueba.</small></span><span className="app-about-arrow"><AppIcon name="arrow" size={20} /></span></button>
          <button className="app-about-link" onClick={() => navigate("bienvenida")}><span className="app-menu-icon"><AppIcon name="home" /></span><span><strong>Ver la bienvenida</strong><small>Conoce el proyecto y su propósito.</small></span><span className="app-about-arrow"><AppIcon name="arrow" size={20} /></span></button>
          <div className="app-section-heading app-about-title"><h2>Estado del proyecto</h2></div>
          <ol className="app-roadmap">{ROADMAP.map(item => <li key={item.id} data-step={item.id}><span className="app-state">{item.state}</span><h3>{item.title}</h3><p>{item.text}{item.note && <> <strong>{item.note}</strong></>}</p></li>)}</ol>
          <div className="app-section-heading app-about-title"><h2>Hecha con la comunidad</h2></div>
          <ul className="app-values">{VALUES.map(item => <li key={item.title}><AppIcon name={item.icon} size={26} /><h3>{item.title}</h3><p>{item.text}</p></li>)}</ul>
        </div>
      </>}
      {screen === "ayuda" && <>
        <ol className="app-guide"><li><h2>Elige una palabra que conozcas.</h2><p>Este catálogo recopila señas; no es una guía para aprender a realizarlas.</p></li><li><h2>Busca buena luz.</h2><p>Apoya el celular, deja espacio para tus manos y evita una luz fuerte detrás de ti.</p></li><li><h2>Prepara la grabación.</h2><p>Permite la cámara cuando se solicite. Al empezar, coloca ambas manos visibles; después puedes hacer la seña con una o dos manos.</p></li><li><h2>Revisa y comparte.</h2><p>Mira tu grabación antes de enviarla. Puedes repetirla; el equipo administrador revisa cada aporte.</p></li></ol>
        <AppButton onClick={() => navigate("home")}>Elegir una seña</AppButton>
      </>}
      {screen === "feedback" && <form className="app-feedback" onSubmit={event => { event.preventDefault(); feedback.send(); }}>
        <fieldset disabled={feedback.busy}><legend>¿Qué quieres compartir?</legend><div className="app-filter app-feedback-types">{feedbackTypes.map(([id, label]) => <button type="button" key={id} aria-pressed={feedback.type === id} onClick={() => feedback.setType(id)}>{label}</button>)}</div></fieldset>
        <label htmlFor="app-feedback-message">Tu mensaje</label><textarea id="app-feedback-message" placeholder="Cuéntanos tu idea o describe lo que ocurrió…" rows={6} maxLength={3000} value={feedback.message} onChange={event => feedback.setMessage(event.target.value)} disabled={feedback.busy} required /><p className="app-footnote">Evita compartir contraseñas o datos personales.</p>
        {feedback.error && <div role="alert" className="app-notice">{feedback.error}</div>}{feedback.success && <div role="status" className="app-success"><AppIcon name="check" size={20} />Gracias. Recibimos tu sugerencia.</div>}
        <AppButton type="submit" disabled={!feedback.message.trim() || feedback.busy} icon="message">{feedback.busy ? "Enviando…" : "Enviar sugerencia"}</AppButton>
      </form>}
    </div></main>
    <nav className="app-bottom-nav" aria-label="Navegación de la app" style={{ "--i": navIndex }} data-idle={nav ? undefined : ""}><span className="app-nav-pill" aria-hidden="true" />{navItems.map(([id, icon, label]) => <button key={id} aria-current={nav === id ? "page" : undefined} onClick={() => navigate(id)}><span><AppIcon name={icon} /></span>{label}</button>)}</nav>
  </div>;
}

export function CameraPermission({ onAllow, onBack, pending, onResume, loading }) {
  return <div className="deaf-app"><header className="app-topbar"><Brand /></header><main className="app-permission"><div className="app-permission-icon"><span className="dw-corner dw-corner-tl" /><span className="dw-corner dw-corner-tr" /><span className="dw-corner dw-corner-bl" /><span className="dw-corner dw-corner-br" /><AppIcon name="camera" size={42} /></div><h1>Tu cámara, tu aporte.</h1><p>DeafApp necesita acceso a la cámara para grabar tu seña. Podrás revisar la grabación antes de enviarla.</p><AppButton disabled={loading} onClick={onAllow}>{loading ? "Comprobando cámara…" : "Permitir cámara"}</AppButton>{pending && <AppButton secondary onClick={onResume}>Revisar grabación pendiente</AppButton>}<button className="app-text-button" onClick={onBack}>Volver a las señas</button></main></div>;
}

export function AdminLogin({ password, setPassword, login, exit, busy, error }) {
  return <div className="deaf-app app-admin-entry"><header className="app-topbar"><Brand /><button className="app-text-button" onClick={exit} disabled={busy}>Volver a la app</button></header><main className="app-admin-login"><span className="app-menu-icon"><AppIcon name="lock" size={28} /></span><h1>Administración</h1><p>Acceso reservado al equipo de DeafApp.</p><form onSubmit={event => { event.preventDefault(); login(); }}><label htmlFor="admin-password">Contraseña</label><input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} maxLength={72} disabled={busy} required />{error && <p role="alert" className="app-login-error">{error}</p>}<AppButton type="submit" icon="lock" disabled={busy || !password}>{busy ? "Ingresando…" : "Entrar al panel"}</AppButton></form></main></div>;
}
