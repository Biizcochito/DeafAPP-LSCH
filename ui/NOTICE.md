# Componentes de terceros en `ui/`

Estos archivos se copiaron de **React Bits** (https://github.com/DavidHDev/react-bits, licencia *MIT + Commons Clause*, texto completo en `LICENSE-react-bits.md`) y se adaptaron para DeafApp:

| Archivo | Origen | Cambios |
| --- | --- | --- |
| `Aurora.jsx/.css` | `Backgrounds/Aurora` | Shader original. Pausa fuera de pantalla o con la pestaña oculta, un fotograma con movimiento reducido, `ResizeObserver` y salida limpia sin WebGL2. |
| `BlurText.jsx` | `TextAnimations/BlurText` | Admite encabezado semántico, varias líneas con estilo propio, no depende de Tailwind y aparece sin animar con movimiento reducido. |
| `RotatingText.jsx/.css` | `TextAnimations/RotatingText` | Sin cambios. |
| `CountUp.jsx` | `TextAnimations/CountUp` | Muestra el valor final directamente con movimiento reducido. |
| `SpotlightCard.jsx/.css` | `Components/SpotlightCard` | Sin cambios. |

`HandConstellation.jsx` y el resto de `ui/` son propios de DeafApp.

La licencia permite usar los componentes dentro de una aplicación o sitio, pero no venderlos ni redistribuirlos por separado.

Dependencias: `motion` (MIT) y `ogl` (Unlicense). La tipografía Bricolage Grotesque (SIL OFL 1.1) se aloja en `public/fonts/` con su licencia.
