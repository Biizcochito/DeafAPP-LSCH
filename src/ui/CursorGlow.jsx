import { useEffect, useRef } from 'react';

import './CursorGlow.css';

// Luz tenue que sigue al mouse sobre el fondo, con los colores de la aurora del inicio.
// Solo en equipos con mouse (pointer fino); en pantallas táctiles no se monta.
const FINE_POINTER = '(hover: hover) and (pointer: fine)';
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

const CursorGlow = ({ colors = ['#d6f36a', '#2dd4bf', '#8b5cf6'], size = 760, opacity = 0.13, smoothing = 0.12 }) => {
  const glowRef = useRef(null);

  useEffect(() => {
    const glow = glowRef.current;
    if (!glow || !window.matchMedia(FINE_POINTER).matches) return;

    const reduced = window.matchMedia(REDUCED_MOTION).matches;
    const target = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };
    let frame = 0;
    let visible = false;

    const render = () => {
      const ease = reduced ? 1 : smoothing;
      current.x += (target.x - current.x) * ease;
      current.y += (target.y - current.y) * ease;
      glow.style.transform = `translate3d(${current.x}px, ${current.y}px, 0)`;
      frame = Math.abs(target.x - current.x) + Math.abs(target.y - current.y) > 0.5 ? requestAnimationFrame(render) : 0;
    };

    const move = event => {
      if (event.pointerType && event.pointerType !== 'mouse') return;
      target.x = event.clientX;
      target.y = event.clientY;
      if (!visible) {
        // La primera vez aparece donde está el mouse, sin cruzar la pantalla.
        current.x = target.x;
        current.y = target.y;
        visible = true;
        glow.classList.add('cursor-glow--on');
      }
      if (!frame) frame = requestAnimationFrame(render);
    };

    const hide = event => {
      if (event.relatedTarget) return;
      visible = false;
      glow.classList.remove('cursor-glow--on');
    };

    window.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerout', hide);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', move);
      document.removeEventListener('pointerout', hide);
    };
  }, [smoothing]);

  const [a, b, c] = colors;
  const style = {
    '--cursor-glow-size': `${size}px`,
    '--cursor-glow-opacity': opacity,
    '--cursor-glow-a': a,
    '--cursor-glow-b': b,
    '--cursor-glow-c': c
  };

  return (
    <div ref={glowRef} className="cursor-glow" style={style} aria-hidden="true">
      <div className="cursor-glow__orb" />
    </div>
  );
};

export default CursorGlow;
