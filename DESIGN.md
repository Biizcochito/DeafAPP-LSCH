---
name: DeafApp — web (bienvenida y app)
description: Sistema oscuro, vivo y de vidrio de la web de DeafApp: aurora, tipografía expresiva, tarjetas con el color de cada categoría y el visor de cámara como motivo de marca.
colors:
  ink: "#080c0a"
  ink-2: "#0d1410"
  surface: "#111a15"
  raised: "#18231d"
  cream: "#f5f2eb"
  muted: "#a9b5ad"
  lime: "#d6f36a"
  lime-hi: "#e6ff8f"
  coral: "#ff8e72"
  sky: "#78e0ff"
  iris: "#a99bff"
  mint: "#4ee0b5"
  line: "rgba(245, 242, 235, .10)"
  line-2: "rgba(245, 242, 235, .20)"
typography:
  display:
    fontFamily: "Bricolage Grotesque, Onest, sans-serif"
    fontSize: "clamp(54px, 6.7vw, 98px)"
    fontWeight: 800
    lineHeight: 0.95
    letterSpacing: "-0.045em"
  headline:
    fontFamily: "Bricolage Grotesque, Onest, sans-serif"
    fontSize: "clamp(36px, 5vw, 68px)"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.04em"
  title:
    fontFamily: "Bricolage Grotesque, Onest, sans-serif"
    fontSize: "clamp(26px, 2.4vw, 34px)"
    fontWeight: 650
    lineHeight: 1.1
    letterSpacing: "-0.03em"
  body:
    fontFamily: "Onest, sans-serif"
    fontSize: "15px"
    lineHeight: 1.55
  lead:
    fontFamily: "Onest, sans-serif"
    fontSize: "clamp(17px, 1.5vw, 20px)"
    lineHeight: 1.6
  label:
    fontFamily: "Onest, sans-serif"
    fontSize: "14px"
    fontWeight: 650
rounded:
  pill: "999px"
  viewfinder: "44px"
  tile: "32px"
  card: "28px"
  row: "26px"
  sticker: "14px"
components:
  button-primary:
    backgroundColor: "{colors.lime}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    height: "66px"
  button-primary-hover:
    backgroundColor: "{colors.lime-hi}"
  button-dark:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.cream}"
    rounded: "{rounded.pill}"
    height: "66px"
  chip-category:
    textColor: "{colors.cream}"
    rounded: "{rounded.pill}"
    padding: "11px 18px 11px 13px"
  tile:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.cream}"
    rounded: "{rounded.tile}"
    padding: "30px"
  category-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.cream}"
    rounded: "{rounded.card}"
    padding: "16px"
  word-row:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.cream}"
    rounded: "{rounded.row}"
    padding: "16px 16px 16px 20px"
  nav-glass:
    backgroundColor: "rgba(16, 25, 20, .84)"
    textColor: "{colors.muted}"
    rounded: "{rounded.pill}"
    padding: "8px"
---

# Design System: DeafApp — web (bienvenida y app)

## Overview

**Creative North Star: "El visor de cámara"**

DeafApp pide grabar señas con una cámara. El sistema convierte ese gesto en su motivo de marca: esquinas de enfoque, un indicador REC, puntos sobre las manos y un subtítulo que dice qué palabra toca grabar. Todo se entiende mirando, sin sonido, porque la comunidad a la que sirve se comunica con las manos y los ojos.

La base es casi negra con un velo verde; sobre ella viven una aurora de lima, turquesa y violeta, y acentos lima y coral. Cada categoría del catálogo recibe uno de siete tonos vivos de la marca, de modo que el mosaico se lee como una pared de color sobre el fondo oscuro. Las superficies son grandes y redondeadas, con un vidrio tenue donde flotan controles.

Este documento describe la implementación de `WelcomeScreen.web.js`, `AppWorkspace.web.js`, `RecordingScreens.web.js` y `ui/`. En la web, `/` es solo la información del proyecto, `/app` es la app y `/admin` la administración. Las pantallas nativas conservan su diseño anterior.

**Key Characteristics:**
- Fondo oscuro con aurora (WebGL con respaldo CSS) y grano sutil.
- Tipografía de titulares expresiva (Bricolage Grotesque) con texto de lectura en Onest.
- Tarjetas bento, bloques de color pleno por categoría y píldoras; barra lateral en escritorio.
- Navegación flotante de vidrio con indicador que se desliza.
- Movimiento con propósito y siempre sustituible por reposo (`prefers-reduced-motion`).

## Colors

Los valores normativos están en el frontmatter; los tokens viven como variables CSS en `ui/theme.css`.

### Primary
- **Lima vivo** (`lime`): acción principal, énfasis, progreso, número de paso, nav activa. **Lima luminoso** (`lime-hi`) en hover.

### Secondary
- **Coral** (`coral`): etiqueta de estado, mensajes honestos («todavía no está disponible»), foco, grabación y avisos.
- **Celeste** (`sky`), **iris** (`iris`) y **menta** (`mint`): acentos de apoyo para separar pasos, valores y el degradado del titular.

### Neutral
- **Tinta** (`ink`) como fondo; **superficie** y **elevado** para tarjetas; **crema** para texto; **salvia** (`muted`) para descripciones; `line` y `line-2` para divisores y bordes.

### Por categoría
Cada categoría recibe uno de siete tonos de la marca (coral, celeste, iris, menta, sol, rosa y mandarina), repartidos por posición para que dos contiguas nunca coincidan. Los colores que traía el catálogo se repetían entre categorías y varios eran oscuros, por eso no se usan. El tono se aplica con `--tone` como color pleno en el mosaico y la cabecera, y como relleno de puntos y barras en las listas. El texto sobre un tono siempre es tinta oscura.

**The Tone Rule.** Un tono de categoría es una superficie plena con texto de tinta, o un relleno de progreso; nunca el color de un texto.

## Typography

**Display y titulares:** Bricolage Grotesque (variable, alojada en `/fonts`, licencia OFL). **Texto:** Onest. Ambas con `font-display: swap`.

- **Display:** titular de la bienvenida; pesos 700–800 y espaciado negativo. La última línea lleva degradado lima → menta → celeste aplicado por palabra.
- **Headline:** cabeceras de sección; la última parte de la frase toma un acento (lima, coral o celeste según la sección).
- **Title:** nombres de pasos, tarjetas y palabras.
- **Body y lead:** Onest; descripciones en `muted`, énfasis en `cream`.

La marca escribe **Deaf** en peso 800 y **App** en 400.

## Layout

La bienvenida se desplaza dentro de una superficie de alto `100dvh`; el contenedor mide `min(1240px, 100% - 64px)` (36px de margen en móvil estrecho). Hero a dos columnas en escritorio, apilado hasta 999px con el visor bajo la acción. El bento usa 12 columnas: tres pasos de 4, y debajo cifra (3), foto (6) y meta (3). A 999px los pasos pasan a 6 columnas; a 640px las cifras quedan en dos columnas y todo lo demás a ancho completo.

La app tiene tres distribuciones. **Móvil:** una columna con cabecera de marca, mosaico de categorías en 2 columnas y navegación flotante de vidrio abajo (128px inferiores reservados). **Tableta (desde 700px):** mosaico de 3 columnas y listas de palabras en 2. **Escritorio (desde 1000px):** barra lateral de 288px con la marca, la navegación vertical y, al pie, sugerencias y ayuda; el contenido ocupa el resto con hasta 1240px y márgenes de 56px, el mosaico pasa a 4 columnas (5 desde 1500px) y el título comparte fila con el buscador.

La tarjeta «Empieza con un hola» es la primera pieza del mosaico: ocupa el ancho completo en móvil y un bloque de 2×2 desde tableta.

## Elevation & Depth

La profundidad se logra con tono, bordes finos, vidrio y brillo, no con sombras de interfaz tradicionales.

- **Vidrio:** navegación superior e inferior, píldora de estado y buscador usan fondo translúcido con `backdrop-filter`. La navegación inferior es más opaca para no mezclar el texto que pasa por debajo.
- **Aurora:** resplandor al inicio de la bienvenida y de la app, con máscara que lo desvanece.
- **Brillo:** las manos del visor, el botón principal en hover y el foco del buscador usan un halo del color de la acción.
- **Spotlight:** en las tarjetas del bento, una luz sigue al puntero y refuerza el borde cerca de él.

**The Glass Rule.** El vidrio solo se usa en controles flotantes; el contenido va sobre superficies sólidas.

## Shapes

Píldoras (999px) para botones, chips, buscador y navegación; 44px el visor; 32px las tarjetas del bento; 28px las tarjetas de categoría; 26px las filas; 14px la pegatina coral. La marca es `/brand/deafapp-mark.svg` (palma abierta con dos burbujas de conversación).

## Components

### Buttons
Píldoras de 66px (grandes) o 46px (compactas). El primario es lima con tinta oscura y un círculo con flecha que gira 45° al pasar el cursor; el oscuro invierte los colores y aparece sobre el bloque lima final. Hover eleva 2px con halo; el foco visible es coral de 3px.

### Visor de cámara (motivo)
Marco redondeado con cuadrícula tenue, cuatro esquinas de enfoque, chip REC, chip «21 puntos por mano» y un subtítulo «Te toca grabar» con palabras reales del catálogo que rotan. Dos manos de 21 puntos (`HandConstellation`) se mueven entre posturas genéricas; son ilustración, no enseñan ninguna seña. Se rotula como «Ilustración del seguimiento de manos de DeafApp».

### Marquesina
Dos filas de chips de categoría (emoji, nombre y número de señas) en sentidos opuestos, con máscara en los bordes. Se pausa al pasar el cursor; con movimiento reducido pasa a desplazamiento manual.

### Tarjetas bento
`SpotlightCard` con tinte lima, coral o celeste según el paso, mini-visuales alusivos (búsqueda, cuenta regresiva, estado Pendiente → Aprobada) y cifras reales calculadas desde el catálogo.

### Mosaico de categorías
Bloques de color pleno con un degradado suave. El nombre va arriba a la izquierda en tipografía display; el emoji de la categoría, grande y girado 14°, asoma abajo a la derecha detrás del texto y se mueve al pasar el cursor. Abajo, el número de señas y, solo si la persona ya grabó alguna, «n grabadas por ti» con una barra de su avance. La cabecera de cada categoría repite el bloque, con el emoji aún mayor.

### Seguimiento de la categoría
Tarjeta con un número grande (las señas que la persona ha grabado en esa categoría) y una celda por cada seña. Las celdas grabadas se encienden con el tono de la categoría y las pendientes quedan en borde punteado, de modo que se ve cuáles ya están y no solo cuántas. El mismo trazo compacto se usa en cada categoría de «Tus aportes».

### Filas de palabras
Tarjeta oscura con la palabra en display, «La grabaste n veces» o «Aún no la has grabado» y el botón lima **Grabar**. Las palabras ya grabadas toman borde y tinte lima. Los filtros son «Todas», «Por grabar» y «Ya grabadas». En tableta y escritorio se acomodan en 2 o 3 columnas.

### Tus aportes
Lo que la persona ha grabado desde este dispositivo: señas grabadas (lima), grabaciones enviadas (celeste) y categorías con aportes (coral), y debajo cada categoría con sus celdas y las palabras grabadas (con «×n» si fueron varias). Sin aportes muestra un estado vacío con la acción de elegir una seña. Los aportes se guardan solo en el dispositivo (`myContributions.js`): no identifican a nadie, no se suben y no dicen si una grabación fue revisada.

La interfaz pública no muestra cifras globales, metas ni estados de revisión; lo único que ve cada persona es lo suyo.


### Más (sobre DeafApp)
Página informativa con un bloque principal («Un proyecto en construcción»), un enlace a la bienvenida, el estado del proyecto (Disponible, Experimental, Objetivo) y los valores. Los textos del estado y los valores viven en `ui/projectInfo.js` y los comparten la bienvenida y la app.

### Navigation
**Móvil:** píldora flotante de vidrio con tres destinos (Grabar, Mis aportes, Más) e indicador lima que se desliza. **Escritorio:** la misma navegación pasa a una columna dentro de la barra lateral, con el indicador deslizándose en vertical. **Sugerencias** y **Ayuda para grabar** son acciones de cabecera: dos iconos arriba a la derecha en móvil y dos botones al pie de la barra lateral en escritorio. Al abrirlas se marcan como activas y la navegación principal no marca ningún destino. Administración no aparece en el menú público: se abre en `/admin`.

### Pantallas de grabación
Tres pantallas con el mismo lenguaje de visor: **cámara**, **revisión** y **enviada**. La cámara y sus avisos son los de React Native, sin cambios de lógica, dentro de un marco con esquinas de enfoque. Encabezan la pantalla el botón Volver y «Te toca grabar» con la palabra y el emoji de su categoría. Tres pasos (Prepara tus manos, Cuenta atrás, Haz la seña) marcan dónde va la persona: el siguiente, el activo y los hechos. En móvil la guía va encima de la cámara y la acción principal queda fija abajo; en escritorio la cámara va a la izquierda y la guía y los controles a la derecha. El trazado se activa con un interruptor y su leyenda usa los colores reales del trazado. La revisión muestra la vista previa en espejo, como la cámara, y la confirmación solo habla del envío.


### Inputs
Buscador y campos en píldora u 24px con borde `line-2`; el foco cambia a lima con un halo.

### Hoja de ruta y valores
Tres estados honestos: **Disponible** (lima), **Experimental** (coral) y **Objetivo** (borde discontinuo, «todavía no está disponible»). Los valores salen del compromiso ético del README: apoyo sin reemplazar intérpretes, variantes regionales y comprensión visual.

## Motion & Accessibility

- Titular con aparición por palabras (`BlurText`), recuentos (`CountUp`), caption rotativo, aurora, marquesina y manos en movimiento.
- `prefers-reduced-motion`: sin animaciones ni transiciones; el titular y las cifras aparecen directamente, la aurora se dibuja en un solo fotograma, las manos quedan en una postura y la marquesina se desplaza a mano.
- La aurora y las manos se pausan fuera de pantalla y con la pestaña oculta. La aurora se dibuja a media resolución.
- Foco visible en todos los controles, objetivos táctiles de al menos 44px, texto alternativo en la foto, enlace «Ir al contenido».
- Nada depende del sonido. Las cifras (531 señas, 28 categorías) se calculan del catálogo y los avances de cada persona salen de su propio dispositivo.

## Third-party components

Aurora, BlurText, RotatingText, CountUp y SpotlightCard provienen de React Bits (MIT + Commons Clause) y están adaptados en `ui/`. Detalle, licencia y cambios en `ui/NOTICE.md`.

## Do's and Don'ts

### Do:
- **Do** usar `--tone` como superficie plena con texto de tinta, o como relleno de progreso.
- **Do** mantener las limitaciones beta y de reconocimiento visibles con texto.
- **Do** respetar `prefers-reduced-motion` en cualquier animación nueva.
- **Do** rotular la foto y las manos como ilustraciones.

### Don't:
- **Don't** presentar las manos animadas ni la foto como referencia para ejecutar señas.
- **Don't** inventar cifras, testimonios ni resultados de reconocimiento.
- **Don't** usar vidrio sobre contenido que debe leerse con precisión.
- **Don't** mostrar a quien graba cifras globales, metas ni si un aporte fue aprobado: solo lo suyo.
- **Don't** usar los tonos de categoría como color de texto ni asignar el mismo a categorías contiguas.
