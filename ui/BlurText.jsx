// Adaptado de React Bits (BlurText). Cambios: admite un encabezado semántico (`as`), varias
// líneas con estilo propio, palabras `inline-block` sin depender de Tailwind y aparición
// inmediata cuando la persona pidió reducir el movimiento.
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

export default function BlurText({
  as: Tag = 'p',
  lines = [],
  delay = 90,
  className = '',
  threshold = 0.1,
  stepDuration = 0.4,
  ...rest
}) {
  const reduced = useReducedMotion();
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setInView(true); observer.disconnect(); }
    }, { threshold });
    observer.observe(node);
    // Red de seguridad: el titular nunca debe quedar oculto si el observador no responde.
    const fallback = setTimeout(() => setInView(true), 1200);
    return () => { observer.disconnect(); clearTimeout(fallback); };
  }, [threshold]);

  let index = 0;
  const shown = reduced || inView;
  return (
    <Tag ref={ref} className={className} {...rest}>
      {lines.map(({ text, className: lineClass = '' }, lineIndex) => (
        <span key={lineIndex} className={`blur-line ${lineClass}`}>
          {text.split(' ').map((word, wordIndex, words) => {
            const order = index++;
            return (
              <motion.span
                key={wordIndex}
                className="blur-word"
                initial={reduced ? false : { filter: 'blur(12px)', opacity: 0, y: 36 }}
                animate={shown ? { filter: ['blur(12px)', 'blur(4px)', 'blur(0px)'], opacity: [0, 0.6, 1], y: [36, -4, 0] } : { filter: 'blur(12px)', opacity: 0, y: 36 }}
                transition={{ duration: stepDuration * 2, times: [0, 0.5, 1], delay: (order * delay) / 1000, ease: 'easeOut' }}
              >
                {word}{wordIndex < words.length - 1 ? ' ' : ''}
              </motion.span>
            );
          })}
        </span>
      ))}
    </Tag>
  );
}
