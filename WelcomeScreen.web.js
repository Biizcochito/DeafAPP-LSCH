import { useEffect } from "react";
import { motion, useReducedMotion } from "motion/react";
import Aurora from "./ui/Aurora";
import BlurText from "./ui/BlurText";
import CountUp from "./ui/CountUp";
import HandConstellation from "./ui/HandConstellation";
import RotatingText from "./ui/RotatingText";
import SpotlightCard from "./ui/SpotlightCard";
import { ROADMAP, VALUES } from "./ui/projectInfo";
import { CATEGORIAS } from "./signCatalog";
import "./ui/theme.css";
import "./WelcomeScreen.css";

const ROADMAP_CLASS = { now: "dw-now", test: "dw-test", goal: "dw-goal-step" };

const TOTAL_SEÑAS = CATEGORIAS.reduce((total, category) => total + category.señas.length, 0);
// Palabras reales del catálogo: es lo que la app le pide grabar a cada persona.
const PALABRAS = ["hola", "gracias", "por favor", "familia", "mucho gusto", "bienvenido"];
const AURORA = ["#d6f36a", "#2dd4bf", "#8b5cf6"];
const TILE_VARS = { "--spotlight-card-surface": "transparent", "--spotlight-card-shadow": "none", "--spotlight-card-border": "rgba(245,242,235,.12)" };

function Icon({ name, size = 22, ...props }) {
  const paths = {
    arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
    diagonal: <path d="M6 18 18 6M6 6h12v12" />,
    down: <path d="M12 5v14M6 13l6 6 6-6" />,
    camera: <><path d="M8 5l2-2h4l2 2h4a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" /><circle cx="12" cy="12" r="4" /></>,
    check: <><path d="m7 12 3 3 7-7" /><circle cx="12" cy="12" r="9" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m16 16 5 5" /></>,
    eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20v-1.5a6.5 6.5 0 0 1 13 0V20M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14a6.5 6.5 0 0 1 3.5 5.5V20" /></>,
    heart: <path d="M12 20.5 4.2 13A5 5 0 0 1 12 6.6 5 5 0 0 1 19.8 13Z" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}

function Brand({ onLogo, footer = false }) {
  const content = <><img src="/brand/deafapp-mark.svg" alt="" width="40" height="40" /><span className="dw-wordmark">Deaf<span>App</span></span></>;
  return footer || !onLogo ? <div className={`dw-brand${footer ? " dw-brand-footer" : ""}`}>{content}</div> : <button className="dw-brand" type="button" aria-label="DeafApp" onClick={onLogo}>{content}</button>;
}

function Reveal({ children, delay = 0, className = "" }) {
  const reduced = useReducedMotion();
  return <motion.div className={className} initial={reduced ? false : { opacity: 0, y: 32 }} whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: "0px 0px -10% 0px" }} transition={{ duration: 0.75, delay, ease: [0.16, 1, 0.3, 1] }}>{children}</motion.div>;
}

function Marquee({ items, reverse = false }) {
  const row = hidden => <ul className="dw-marquee-set" aria-hidden={hidden || undefined}>{items.map(cat => <li key={cat.id} className="dw-chip" style={{ "--c": cat.color }}><i aria-hidden="true">{cat.emoji}</i>{cat.nombre}<small>{cat.señas.length}</small></li>)}</ul>;
  return <div className={`dw-marquee${reverse ? " dw-marquee-reverse" : ""}`}><div className="dw-marquee-track">{row(false)}{row(true)}</div></div>;
}

function Tile({ tone, className = "", children }) {
  return <SpotlightCard className={`dw-tile dw-tile-${tone} ${className}`} style={TILE_VARS} spotlightColor="#f5f2eb" intensity={0.12} spotlightSize={320} borderGlow={0.7} theme="dark">{children}</SpotlightCard>;
}

// Enlace real a /app: abre en la misma pestaña sin recargar y en otra con Ctrl, Cmd o clic central.
function GoLink({ onBegin, className, children }) {
  return <a className={className} href="/app" onClick={event => {
    if (event.defaultPrevented || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onBegin();
  }}>{children}</a>;
}

export default function WelcomeScreen({ onBegin, onLogo }) {
  useEffect(() => {
    const previousColor = document.body.style.backgroundColor;
    document.body.style.backgroundColor = "#080c0a";
    return () => { document.body.style.backgroundColor = previousColor; };
  }, []);

  return (
    <div className="deaf-welcome">
      <a className="dw-skip" href="#bienvenida-contenido">Ir al contenido</a>
      <header className="dw-nav">
        <Brand onLogo={onLogo} />
        <nav aria-label="Navegación de bienvenida" className="dw-nav-links">
          <a href="#como-participar">Cómo participar</a>
          <a href="#el-proyecto">El proyecto</a>
          <a href="#comunidad">Comunidad</a>
        </nav>
        <GoLink className="dw-btn dw-btn-small" onBegin={onBegin}>Grabar<Icon name="diagonal" size={18} /></GoLink>
      </header>

      <main id="bienvenida-contenido" tabIndex={-1}>
        <section className="dw-hero grain" aria-labelledby="dw-title">
          <div className="dw-aurora" aria-hidden="true"><div className="dw-aurora-fallback" /><Aurora colorStops={AURORA} amplitude={0.9} blend={0.65} speed={0.8} /></div>
          <div className="dw-shell dw-hero-grid">
            <div className="dw-hero-copy">
              <p className="dw-eyebrow"><span aria-hidden="true" />LSCh · Beta comunitaria</p>
              <BlurText as="h1" id="dw-title" className="dw-title" lines={[{ text: "Tus manos." }, { text: "Un mundo" }, { text: "por conectar.", className: "dw-grad" }]} />
              <p className="dw-lead">La comunicación empieza contigo. Ayúdanos a construir el futuro de la <strong>Lengua de Señas Chilena.</strong></p>
              <div className="dw-actions">
                <GoLink className="dw-btn dw-btn-big" onBegin={onBegin}>Comenzar a grabar<span aria-hidden="true"><Icon name="diagonal" size={22} /></span></GoLink>
                <a className="dw-ghost" href="#como-participar"><span aria-hidden="true"><Icon name="down" size={18} /></span>Descubre cómo</a>
              </div>
              <dl className="dw-proof">
                <div><dt>señas</dt><dd>{TOTAL_SEÑAS}</dd></div>
                <div><dt>categorías</dt><dd>{CATEGORIAS.length}</dd></div>
                <div><dt>visual</dt><dd>100 %</dd></div>
              </dl>
            </div>

            <figure className="dw-visual">
              <div className="dw-finder">
                <div className="dw-finder-grid" aria-hidden="true" />
                <div className="dw-hand-wrap dw-hand-a" aria-hidden="true"><HandConstellation mirror poses={["relaxed", "point", "soft", "open"]} offset={900} /></div>
                <div className="dw-hand-wrap dw-hand-b" aria-hidden="true"><HandConstellation poses={["open", "soft", "peace", "relaxed"]} /></div>
                <span className="dw-corner dw-corner-tl" aria-hidden="true" /><span className="dw-corner dw-corner-tr" aria-hidden="true" />
                <span className="dw-corner dw-corner-bl" aria-hidden="true" /><span className="dw-corner dw-corner-br" aria-hidden="true" />
                <span className="dw-rec"><i aria-hidden="true" />REC</span>
                <span className="dw-points">21 puntos por mano</span>
                <div className="dw-caption"><span>Te toca grabar</span><RotatingText texts={PALABRAS} rotationInterval={2600} staggerDuration={0.025} mainClassName="dw-caption-word" /></div>
              </div>
              <div className="dw-sticker" aria-hidden="true"><span>Cada seña<br /><strong>nos acerca.</strong></span><Icon name="diagonal" size={30} /></div>
              <figcaption>Ilustración del seguimiento de manos de DeafApp.</figcaption>
            </figure>
          </div>
        </section>

        <section className="dw-band" aria-label="Categorías del catálogo">
          <Marquee items={CATEGORIAS} />
          <Marquee items={[...CATEGORIAS].reverse()} reverse />
        </section>

        <section id="como-participar" className="dw-section dw-shell" aria-labelledby="dw-process-title">
          <Reveal className="dw-heading"><h2 id="dw-process-title">De tus manos <span>al futuro.</span></h2><p>Participar es así de simple.</p></Reveal>
          <Reveal className="dw-bento">
            <Tile tone="lime" className="dw-step">
              <span className="dw-num">01</span>
              <h3>Elige una seña.</h3>
              <p>Explora el catálogo y encuentra la palabra que quieres aportar.</p>
              <div className="dw-mini-search" aria-hidden="true"><Icon name="search" size={19} /><span>Buscar una seña o categoría</span></div>
              <div className="dw-mini-words" aria-hidden="true">{PALABRAS.slice(0, 4).map(word => <span key={word}>{word}</span>)}</div>
            </Tile>
            <Tile tone="coral" className="dw-step">
              <span className="dw-num">02</span>
              <h3>Graba a tu ritmo.</h3>
              <p>Prepara tu cámara, realiza la seña y revisa tu video. Puedes repetirlo antes de enviar.</p>
              <div className="dw-mini-cam" aria-hidden="true"><span className="dw-corner dw-corner-tl" /><span className="dw-corner dw-corner-tr" /><span className="dw-corner dw-corner-bl" /><span className="dw-corner dw-corner-br" /><b>3</b><em><i />REC</em></div>
            </Tile>
            <Tile tone="sky" className="dw-step">
              <span className="dw-num">03</span>
              <h3>Comparte tu aporte.</h3>
              <p>Envía tu grabación. El equipo administrador la revisa antes de usarla.</p>
              <div className="dw-mini-status" aria-hidden="true"><span className="dw-ok"><Icon name="check" size={17} />Enviada</span></div>
            </Tile>
            <Tile tone="dark" className="dw-stat">
              <p className="dw-stat-number"><CountUp to={TOTAL_SEÑAS} duration={2.4} /></p>
              <h3>señas en el catálogo</h3>
              <p>Palabras y frases de la vida diaria.</p>
            </Tile>
            <Tile tone="photo" className="dw-photo-tile">
              <img src="/brand/deafapp-welcome.jpg" alt="Fotografía ilustrativa de dos manos expresándose, con mangas coral y crema sobre un fondo oscuro." loading="lazy" decoding="async" width="1122" height="1402" />
              <div><p>Una lengua.<br /><strong>Muchas formas de conectar.</strong></p><span>Imagen ilustrativa</span></div>
            </Tile>
            <Tile tone="dark" className="dw-stat">
              <p className="dw-stat-number dw-stat-sky"><CountUp to={CATEGORIAS.length} duration={1.8} /></p>
              <h3>categorías</h3>
              <p>De {CATEGORIAS[0].nombre} a {CATEGORIAS[CATEGORIAS.length - 1].nombre}.</p>
            </Tile>
          </Reveal>
        </section>

        <section id="el-proyecto" className="dw-section dw-shell" aria-labelledby="dw-project-title">
          <Reveal className="dw-heading"><h2 id="dw-project-title">Estamos construyendo <span>algo que nos conecta.</span></h2><p>Hoy recopilamos y revisamos señas. Nuestro objetivo es que, en el futuro, puedan convertirse en texto y voz para apoyar la comunicación cotidiana.</p></Reveal>
          <Reveal className="dw-roadmap">
            <ol>{ROADMAP.map(item => <li key={item.id} className={ROADMAP_CLASS[item.id]}><span className="dw-state">{item.state}</span><h3>{item.title}</h3><p>{item.text}{item.note && <> <strong>{item.note}</strong></>}</p></li>)}</ol>
          </Reveal>
        </section>

        <section id="comunidad" className="dw-section dw-shell" aria-labelledby="dw-values-title">
          <Reveal className="dw-heading"><h2 id="dw-values-title">Hecha <span>con la comunidad.</span></h2><p>Una herramienta de apoyo, construida con la comunidad sorda.</p></Reveal>
          <Reveal className="dw-values">
            {VALUES.map(item => <div key={item.title}><Icon name={item.icon} size={30} /><h3>{item.title}</h3><p>{item.text}</p></div>)}
          </Reveal>
        </section>

        <section className="dw-shell dw-cta-wrap" aria-labelledby="dw-invitation-title">
          <Reveal className="dw-cta grain">
            <div><h2 id="dw-invitation-title">La próxima seña <span>puede ser la tuya.</span></h2><p>Gracias por ser parte de lo que viene.</p></div>
            <GoLink className="dw-btn dw-btn-dark dw-btn-big" onBegin={onBegin}>Quiero participar<span aria-hidden="true"><Icon name="diagonal" size={22} /></span></GoLink>
          </Reveal>
        </section>
      </main>

      <footer className="dw-footer dw-shell"><Brand footer /><p>Lengua de Señas Chilena<span>Hecho con la comunidad, para la comunidad.</span></p><span className="dw-footer-country">LSCh · Chile</span></footer>
    </div>
  );
}
