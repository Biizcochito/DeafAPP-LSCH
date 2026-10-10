// Mano de 21 puntos con la misma topología que usa el seguimiento de DeafApp (muñeca, pulgar y
// cuatro dedos de tres articulaciones). Es una ilustración: los dedos se mueven entre posturas
// genéricas con cinemática simple; no representa ninguna seña de la LSCh.
import { useEffect, useRef } from 'react';

const D2R = Math.PI / 180;
const WRIST = [110, 236];
const FINGERS = [
  { o: [-30, -92], a: -98, L: [40, 25, 19], flex: [75, 90, 60] },
  { o: [-6, -100], a: -91, L: [44, 27, 20], flex: [75, 90, 60] },
  { o: [19, -96], a: -83, L: [40, 25, 19], flex: [75, 90, 60] },
  { o: [40, -84], a: -72, L: [32, 20, 16], flex: [75, 90, 60] },
];
const THUMB = { cmc: [-26, -24], a: -148, L: [34, 27, 21], turn: [26, 38, 30] };
export const POSES = {
  open: [0, 0, 0, 0, 0],
  relaxed: [0.15, 0.12, 0.18, 0.24, 0.32],
  point: [0.55, 0, 0.95, 0.95, 0.95],
  peace: [0.8, 0, 0, 1, 1],
  soft: [0.3, 0.3, 0.25, 0.4, 0.45],
  fist: [0.85, 1, 1, 1, 1],
};
const CONNECTIONS = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];
const PALM = [0, 5, 9, 13, 17];
const TIPS = [4, 8, 12, 16, 20];

// curl: [pulgar, índice, medio, anular, meñique] entre 0 (abierto) y 1 (cerrado). sway: giro en grados.
export function handPoints(curl, sway = 0) {
  const pts = [WRIST.slice()];
  let p = [WRIST[0] + THUMB.cmc[0], WRIST[1] + THUMB.cmc[1]];
  pts.push(p);
  let angle = THUMB.a;
  for (let k = 0; k < 3; k++) {
    angle += THUMB.turn[k] * curl[0] * 0.5 + (k === 0 ? sway * 0.4 : 0);
    p = [p[0] + Math.cos(angle * D2R) * THUMB.L[k], p[1] + Math.sin(angle * D2R) * THUMB.L[k]];
    pts.push(p);
  }
  FINGERS.forEach((f, i) => {
    let q = [WRIST[0] + f.o[0], WRIST[1] + f.o[1]];
    pts.push(q);
    let flexed = 0;
    const base = f.a + sway * (0.6 + i * 0.1);
    for (let k = 0; k < 3; k++) {
      flexed += f.flex[k] * curl[i + 1];
      const length = f.L[k] * Math.cos(flexed * D2R);
      q = [q[0] + Math.cos(base * D2R) * length, q[1] + Math.sin(base * D2R) * length];
      pts.push(q);
    }
  });
  return pts;
}

const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

export default function HandConstellation({ poses = ['open', 'relaxed', 'point', 'soft'], mirror = false, hold = 2600, offset = 0, className = '', style }) {
  const lines = useRef([]);
  const dots = useRef([]);
  const palm = useRef(null);
  const root = useRef(null);

  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const sequence = poses.map(name => POSES[name] || POSES.open);
    const paint = (curl, sway) => {
      const pts = handPoints(curl, sway);
      CONNECTIONS.forEach(([a, b], i) => {
        const line = lines.current[i];
        if (!line) return;
        line.setAttribute('x1', pts[a][0].toFixed(1)); line.setAttribute('y1', pts[a][1].toFixed(1));
        line.setAttribute('x2', pts[b][0].toFixed(1)); line.setAttribute('y2', pts[b][1].toFixed(1));
      });
      pts.forEach((pt, i) => {
        const dot = dots.current[i];
        if (!dot) return;
        dot.setAttribute('cx', pt[0].toFixed(1)); dot.setAttribute('cy', pt[1].toFixed(1));
      });
      palm.current?.setAttribute('points', PALM.map(i => `${pts[i][0].toFixed(1)},${pts[i][1].toFixed(1)}`).join(' '));
    };
    if (reduced) { paint(sequence[0], 0); return undefined; }

    let raf = 0;
    let visible = true;
    const start = performance.now() - offset;
    const frame = now => {
      raf = requestAnimationFrame(frame);
      const elapsed = now - start;
      const cycle = hold + 1100;
      const index = Math.floor(elapsed / cycle) % sequence.length;
      const into = (elapsed % cycle) - hold;
      const t = into > 0 ? ease(Math.min(1, into / 1100)) : 0;
      const curl = mix(sequence[index], sequence[(index + 1) % sequence.length], t);
      paint(curl, Math.sin(elapsed / 900) * 4);
    };
    const run = () => { if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame); };
    const stop = () => { cancelAnimationFrame(raf); raf = 0; };
    const watcher = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; visible ? run() : stop(); });
    watcher.observe(root.current);
    const onVisibility = () => (document.hidden ? stop() : run());
    document.addEventListener('visibilitychange', onVisibility);
    paint(sequence[0], 0);
    run();
    return () => { stop(); watcher.disconnect(); document.removeEventListener('visibilitychange', onVisibility); };
  }, [poses.join('|'), hold, offset]);

  return (
    <svg ref={root} className={`hand-svg hand-glow${className ? ` ${className}` : ''}`} style={{ transform: mirror ? 'scaleX(-1)' : undefined, ...style }} viewBox="-10 0 240 260" aria-hidden="true" focusable="false">
      <polygon ref={palm} />
      {CONNECTIONS.map((_, i) => <line key={i} ref={el => (lines.current[i] = el)} />)}
      {Array.from({ length: 21 }, (_, i) => <circle key={i} ref={el => (dots.current[i] = el)} r={TIPS.includes(i) ? 4.6 : 3.1} />)}
    </svg>
  );
}
