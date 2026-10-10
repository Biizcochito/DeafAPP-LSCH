<div align="center">

# DeafApp 🤟

### Reconocimiento de Lengua de Señas Chilena

![Estado beta](https://img.shields.io/badge/Estado-BETA-E94560?style=flat-square)
![Lengua de Señas Chilena](https://img.shields.io/badge/Lengua-LSCh-18C8D8?style=flat-square)
![Expo SDK 57](https://img.shields.io/badge/Expo-SDK_57-111827?style=flat-square)
![Supabase](https://img.shields.io/badge/Datos-Supabase-3ECF8E?style=flat-square)
![Cloudflare Workers](https://img.shields.io/badge/Web-Cloudflare_Workers-F38020?style=flat-square)

**[Abrir DeafApp](https://deafapp-lsch.deafapp-lsch.workers.dev)** · **[Funciones](#funciones)** · **[Instalación](#desarrollo-local)** · **[Administración](#panel-de-administración)**

</div>

DeafApp es una plataforma comunitaria para recolectar, validar y reconocer señas de la **Lengua de Señas Chilena (LSCh)**, desarrollada como proyecto de título de Ingeniería en Informática (Duoc UC). El proyecto nace de la experiencia de ver a un amigo sordo enfrentar barreras de comunicación en el día a día, y busca construir —con la propia comunidad sorda— una base de datos y un sistema de reconocimiento en tiempo real que ayuden a reducir esas barreras.

> ⚠️ **Proyecto en fase BETA.** Puede presentar cambios y errores mientras se sigue desarrollando.

La versión actual permite recopilar, revisar y preparar grabaciones, y entrenar candidatos desde el administrador. El traductor completo en tiempo real entre LSCh, voz y texto sigue siendo el objetivo del proyecto; todavía no está disponible como función pública.

| Vocabulario | Organización | Acceso público | Acceso privado |
| :---: | :---: | :---: | :---: |
| **531 entradas** | **28 categorías** | Catálogo y grabación | Revisión, material y entrenamiento |

### Navegación

| Para conocer la app | Para desarrollar | Para revisar datos |
| --- | --- | --- |
| [Funciones](#funciones) | [Stack técnico](#stack-técnico) | [Panel de administración](#panel-de-administración) |
| [Flujo de grabación](#flujo-de-grabación) | [Estructura relevante](#estructura-relevante) | [Base de datos](#base-de-datos-supabase) |
| [Estado del proyecto](#estado-del-proyecto) | [Desarrollo local](#desarrollo-local) | [Modelo y resultados](#sobre-el-modelo-de-reconocimiento) |
| [Autores](#autores) | [Build y despliegue](#build-y-despliegue) | [Pruebas](#pruebas) |

---

## Funciones

| Función | Qué permite |
| --- | --- |
| 🤟 **Catálogo comunitario** | Grabar señas desde celular o computador para las 531 entradas del vocabulario. |
| 🎥 **Grabación guiada** | Preparar la cámara, confirmar las manos y comenzar con una cuenta regresiva. |
| ✋ **Trazados en vivo** | Mostrar u ocultar puntos de cara y manos, consultar su estado y recibir mensajes de ayuda. |
| 📱 **Encuadre adaptable** | Utilizar una vista horizontal en computador y vertical en celular. |
| ▶️ **Vista previa** | Reproducir, repetir o descartar la grabación antes de enviarla. |
| 💾 **Borrador local** | Recuperar una toma pendiente y reintentar su envío sin duplicarla, cuando hay almacenamiento disponible. |
| 🔐 **Revisión administrativa** | Aprobar, rechazar o devolver a pendientes las contribuciones recibidas. |
| 🛑 **Control de gesto** | Bloquear la configuración específica del dedo medio levantado cuando el detector la confirma. |
| 🧪 **Entrenamiento experimental** | Recuperar grabaciones antiguas, revisar etiquetas y entrenar grupos pequeños desde el administrador. |

La cara y las manos se procesan por separado para actualizar sus resultados. El botón **Reiniciar cámara** permite volver a iniciar la captura. El control del dedo medio es específico: no clasifica todos los gestos obscenos ni reemplaza la revisión administrativa.

### Flujo de grabación

| Paso | Acción | Resultado |
| :---: | --- | --- |
| **1** | Elegir una categoría y una seña. | Se abre su pantalla de grabación. |
| **2** | Pulsar **Preparar grabación** y mostrar ambas manos. | Se comprueba la detección inicial. |
| **3** | Esperar la cuenta regresiva. | Se puede retirar una mano después de la confirmación inicial. |
| **4** | Realizar la seña con una o dos manos. | Debe mantenerse al menos una mano detectada durante la captura. |
| **5** | Revisar la vista previa y enviar o repetir. | La contribución enviada queda pendiente de revisión. |

Los votos públicos ya no conceden aprobación. Los candidatos de entrenamiento se guardan en el navegador y no activan automáticamente reconocimiento público.

### Encuadre por dispositivo

| Dispositivo | Proporción | Ancho máximo |
| --- | :---: | :---: |
| 💻 Computador | **4:3** | **600 px** |
| 📱 Celular | **9:16** | **450 px** |

El tamaño se adapta al espacio disponible. Tener una entrada en el catálogo no significa que ya exista un modelo capaz de reconocerla.

### Traductor de prueba (beta)

Pantalla **«Probar el traductor»** (web: Más → Probar el traductor; celular: inicio). Traduce **una seña por clip**: cuenta
atrás 3-2-1, captura de 30 fotogramas (igual que la grabación) y consulta a la API de LSCh, que responde con las **3 señas más
probables** y sus porcentajes (y un aviso si no se ven las manos). Hoy solo reconoce las **19 palabras de alimentos** con que
se entrenó el modelo del backend, y con pocos datos puede equivocarse: por eso muestra tres opciones.

| Pieza | Archivo |
| --- | --- |
| Lógica (captura, consulta, mensajes de error, resumen del resultado) | `translator.js`, probada con `tests/translator.test.mjs` |
| Estado compartido web/celular | `useTranslator.js` |
| Pantalla web (DOM + CSS) y pantalla nativa | `TranslatorScreen.web.js` + `TranslatorScreen.css`, `TranslatorScreen.js` |
| Dirección de la API guardada en el dispositivo | `translatorSettingsStore.js` / `.web.js` |

La API no vive en la web (es Python con TensorFlow): corre en el PC del proyecto (`iniciar_api.bat` en el repo del backend,
`Biizcochito/Proyecto_LSCh`, rama `puente-deafapp`) y se expone con un túnel HTTPS. La pantalla tiene un apartado **Servidor**
para escribir su dirección (`https://algo.trycloudflare.com`); se guarda en el dispositivo y puede fijarse al compilar con
`EXPO_PUBLIC_LSCH_API`. Una página HTTPS no puede llamar a una API `http://` ajena, por eso se usa el túnel. El celular manda
los fotogramas y el servidor calcula los puntos con el mismo MediaPipe con que se armó el dataset; los fotogramas con tu cara
viajan hasta ese servidor, así que conviene avisarlo en una demo.

### Estado del proyecto

| Área | Estado | Alcance actual |
| --- | --- | --- |
| Captura y revisión de grabaciones | **Implementadas** | Cámara, trazados, vista previa y moderación administrativa. |
| Material de LSCh | **Disponible en administración** | Referencias y catálogo para consulta y preparación posterior. |
| Entrenamiento de señas aisladas | **Experimental** | Candidatos locales y primer experimento con “cerdo” y “día”. |
| Reconocimiento para distintas personas | **Pendiente de validar** | Requiere más originales y evaluación con personas independientes. |
| Traductor de una seña por clip | **Prueba (beta)** | 19 palabras de alimentos; muestra las 3 señas más probables. Necesita la API del backend encendida. |
| Traducción continua entre LSCh, voz y texto | **Objetivo del proyecto** | Todavía no es una función pública. |

**Este proyecto NO busca reemplazar a los intérpretes de lengua de señas.** Es una herramienta de apoyo y aprendizaje.

---

## Stack técnico

| Capa | Tecnología |
|---|---|
| Frontend | React Native 0.86 + React 19.2 + Expo SDK 57, exportado a web |
| Cámara | Expo Camera, trazados sobre la imagen y ajustes de compatibilidad web |
| Despliegue | Cloudflare Workers con archivos estáticos |
| Backend / datos | Supabase (PostgreSQL + Storage + RLS + RPC de administración) |
| Seguimiento de cara | MediaPipe Face Mesh, cargado desde CDN |
| Seguimiento de manos | TensorFlow.js + MediaPipe Hands en un Web Worker, con modelos incluidos en los archivos web y una alternativa de compatibilidad |
| Modelo experimental actual | Red temporal Conv1D en TensorFlow.js; entrenamiento y evaluación desde el administrador |
| Persistencia local | IndexedDB para borradores, recuperaciones y candidatos de entrenamiento en la versión web |

La implementación actual de entrenamiento utiliza cara y manos. El código conserva utilidades de Holistic para funciones opcionales, pero no se necesita pose para mostrar los trazados de grabación.

---

## Estructura relevante

<details>
<summary><strong>Ver archivos y carpetas principales</strong></summary>

```text
DeafAPP-LSCH-master/
├── App.js                       # Navegación, catálogo y flujo de grabación
├── signCatalog.js               # Categorías y vocabulario
├── CameraLandmarks.web.js       # Trazados sobre la cámara web
├── landmarkTracking.js          # Detectores y resultados de seguimiento
├── handTrackingWorker.js        # Comunicación con el detector de manos
├── cameraLayout.js              # Encuadre según dispositivo
├── cameraStartup.js             # Mensajes de errores de cámara
├── recordingHandGuard.js        # Requisitos iniciales y control de captura
├── gestureModeration.js         # Bloqueo del gesto específico
├── recordingSubmission.js       # Borradores y envío sin duplicados
├── trainingCapture.js           # Datos de seguimiento asociados a cada toma
├── AdminPanel.js                # Acceso y revisión de grabaciones
├── TrainingWorkbench.web.js     # Preparación y entrenamiento privados
├── admin/                       # SQL, catálogo privado y documentación
├── training/                    # Fuentes, preparación, recuperación y entrenamiento
├── public/
│   ├── hand-model/              # Librerías y modelos del detector de manos
│   ├── hand-tracking-worker.js   # Procesamiento de manos en segundo plano
│   └── hand-regions.js          # Regiones de búsqueda de manos
├── scripts/                     # Preparación de datos, compatibilidad y servidor local
├── tests/                       # Pruebas de cámara, grabación, administración y datos
└── dist/                        # Exportación web generada para publicar
```

</details>

Los modelos de seguimiento de manos incluidos en `public/hand-model` detectan puntos de la mano: **no son modelos entrenados para traducir señas de LSCh**. Los candidatos creados desde el administrador se guardan por separado en el navegador.

---

## Desarrollo local

Usar una versión de Node.js compatible con [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/) y ejecutar los comandos desde la raíz del proyecto.

### Iniciar el entorno de desarrollo

```bash
npm install
npx expo start --web
```

`npm install` también ejecuta el ajuste de compatibilidad de Expo Camera mediante `scripts/patch-expo-camera.cjs`.

### Comprobar la exportación web

Para comprobar la versión exportada, como en las pruebas locales del proyecto:

```bash
npx expo export -p web
node scripts/serve-web.cjs
```

Abrir **[http://127.0.0.1:8081/](http://127.0.0.1:8081/)** para la información del proyecto y **[http://127.0.0.1:8081/app](http://127.0.0.1:8081/app)** para la app de grabación, y permitir el acceso a la cámara. El seguimiento requiere cargar sus modelos; la primera inicialización puede tardar según el dispositivo y la conexión. La compatibilidad debe comprobarse en el navegador y la cámara utilizados.

---

## Build y despliegue

```bash
npx expo export -p web
```

Subir **la carpeta `dist` completa**, o un ZIP de su contenido con `index.html` en la raíz, al Worker existente `deafapp-lsch` desde el cargador de archivos estáticos de Cloudflare.

| Archivo o carpeta | Uso en la publicación |
| --- | --- |
| **`dist/` completa** | Contiene la web exportada y los modelos de seguimiento necesarios. |
| **ZIP del contenido de `dist/`** | Alternativa de carga con `index.html` en la raíz. |
| `App.js` | Código fuente de React Native; necesita la exportación y no se sube por separado. |
| `admin/`, `training/`, SQL y credenciales | No se incluyen en el paquete público. |
| Borradores y candidatos locales | Pertenecen al almacenamiento del navegador, no al despliegue. |

### APK para el celular

`eas.json` ya trae el perfil `preview` (distribución interna, que en Android genera un APK):

```bash
npx eas-cli login
EXPO_PUBLIC_LSCH_API=https://algo.trycloudflare.com npx eas-cli build -p android --profile preview
```

Requiere una cuenta de Expo. **No se ha generado ningún APK desde esta copia**: el bundle de Android sí compila
(`npx expo export --platform android`), pero la app no se ha probado en un celular real. La cámara y los permisos del celular
son los de `expo-camera`, los mismos de la grabación.

La copia actual del proyecto no incluye una configuración `wrangler.toml`; por eso no se presupone que `wrangler deploy` esté configurado. Los borradores, las recuperaciones y los candidatos guardados en el navegador tampoco forman parte de `dist`. El dominio local y el oficial mantienen almacenamientos separados.

---

## Panel de administración

En la versión web, abrir directamente **`/admin`** (por ejemplo, `http://localhost:8081/admin` en desarrollo) e ingresar la contraseña configurada por el propietario. La interfaz pública no muestra un enlace al panel. La contraseña se comprueba en el servidor y no se incluye en el README ni en el código del navegador. No hace falta activar la cámara para administrar. El acceso nativo existente conserva las cinco pulsaciones del logo en un máximo de 3,5 segundos.

| Sección | Herramientas | Alcance |
| --- | --- | --- |
| **Grabaciones** | Búsqueda, filtros, reproducción y decisiones individuales o por lote. | Pendientes, aprobadas y rechazadas. |
| **Material de LSCh** | Referencias educativas y catálogo académico de **379 videos**. | Consulta; los enlaces no equivalen a muestras revisadas ni permisos de entrenamiento. |
| **Entrenamiento LSCh** | Análisis de aprobaciones, disponibilidad de muestras, importación y entrenamiento. | Candidatos de grupos pequeños de señas. |
| **Recuperar grabaciones antiguas** | Extracción de puntos, reproducción y revisión de etiquetas. | Conserva el orden; no inventa tiempos ni identidades ausentes. |
| **Modelos guardados** | Carga de candidatos e informes anteriores. | Datos almacenados en ese navegador. |
| **Datos y diagnóstico** | Conexión, cobertura del vocabulario e informes. | Seguimiento de la preparación de datos. |

La sesión administrativa dura dos horas y permanece en memoria. Salir del panel, cerrar sesión o recargar exige volver a entrar. Las operaciones comprueban la sesión y la versión de la grabación para evitar sobrescribir una revisión más reciente.

Los materiales y las pruebas se concentran en el panel privado. Para publicar la exportación web, el alojamiento debe servir `index.html` también al abrir `/app` y `/admin` (`public/_redirects` ya incluye esas reglas para Cloudflare); la sesión continúa validándose en el servidor. El antiguo acceso por `/#admin` y la sección pública «Visualizador» no describen el acceso actual.

Instalación y detalles de moderación: [admin/README.md](admin/README.md).

---

## Base de datos (Supabase)

**Tabla `grabaciones`:**

| Campo | Descripción |
|---|---|
| `id` | ID único |
| `label` | Palabra/seña |
| `categoria` | Categoría a la que pertenece |
| `archivo_path` | Ruta del video (JSON de fotogramas) en Storage |
| `fuente` | Origen de la grabación; se conserva para compatibilidad con registros existentes |
| `aprobada` | Si fue aprobada por el administrador |
| `validada` | Estado de validación asociado a la aprobación administrativa |
| `visible` | Si se muestra públicamente |
| `moderation_status` | `pending`, `approved` o `rejected` |
| `moderation_version` | Versión de la decisión, usada para detectar conflictos |
| `moderated_at` | Fecha de la última revisión |
| `votos_positivos` / `votos_negativos` | Campos históricos; no otorgan aprobación en el flujo actual |
| `timestamp` | Fecha de creación |

**Storage bucket:** `contribuciones` — cada grabación se guarda como un archivo `.json` con el arreglo de fotogramas en base64.

Los nuevos archivos añaden versión de esquema, ID estable de grabación, idioma `csg`, intervalo de captura, proporción del encuadre y datos `training` con puntos de cara/manos y tiempos observados. Se conservan las imágenes para poder reprocesarlas. Los puntos incluyen información de antigüedad; no se consideran perfectamente sincronizados con cada foto.

La app ya no pide seleccionar «Persona 1, Persona 2…». Utiliza un código anónimo de origen local, que no identifica a una persona ni demuestra que dos dispositivos pertenezcan a participantes distintos.

Las sesiones, configuración y auditoría administrativas están en el esquema privado `deafapp_private`. La protección de las decisiones no convierte en privados los archivos históricos del bucket, que conserva su configuración pública anterior.

---

## Sobre el modelo de reconocimiento

El entrenador actual utiliza una **Conv1D temporal**, con entrada de **32 pasos × 171 características** de cara y manos, normalizadas y preparadas a partir de las grabaciones. El LSTM del planteamiento original sigue como línea de desarrollo; no se presenta un modelo LSTM de 19 clases como función disponible de esta versión.

### Modos de entrenamiento

| Criterio | Evaluación independiente | Prototipo experimental |
| --- | --- | --- |
| Señas por grupo | **2 a 12** | **2 o 3** |
| Originales por seña | Al menos **5 de aprendizaje + 2 de prueba**. | Al menos **2 distintos y utilizables**. |
| Separación | Participantes declarados separados, sujetos a revisión de identidad. | Se reserva una toma por seña; puede ser de la misma persona o de identidad desconocida. |
| Interpretación | Los mínimos habilitan un experimento, sin garantizar precisión. | Prueba interna que no demuestra reconocimiento con otras personas. |

Se separan los originales antes de generar variaciones de entrenamiento. Las variaciones temporales y de encuadre no cuentan como personas nuevas. Cada candidato guarda sus etiquetas, modo, informe y matriz de confusión en el navegador; entrenarlo no activa el traductor público.

### Resultado inicial comprobado el 4 de octubre de 2026

| Indicador | Resultado |
| --- | --- |
| Grabaciones aprobadas procesadas | **110**, sin errores de archivo o procesamiento. |
| Secuencias con puntos técnicamente utilizables | **44** para experimentar. |
| Secuencias con etiquetas compatibles y aprobadas | **12** de las secuencias utilizables. |
| Primer grupo | **“Cerdo” y “día”**. |
| Aprendizaje | **1 original por clase**, con sus variaciones. |
| Evaluación | **1 original reservado por clase**. |
| Aciertos | **1 de 2 pruebas internas**. |

Este resultado no estima precisión general ni valida un traductor en tiempo real.

El apartado **Material de LSCh** es un catálogo de consulta. Para utilizar una fuente externa en entrenamiento hace falta comprobar su autorización de uso, revisar la seña y preparar sus fragmentos y detecciones. La app no aprende automáticamente de todos los videos de internet ni de cada contribución recibida.

Preparación, recuperación y comandos del conjunto de datos: [training/README.md](training/README.md).

---

## Pruebas

| Comando | Qué comprueba |
| --- | --- |
| `npm run test:admin` | Acceso y operaciones de administración. |
| `npm run test:training` | Preparación de datos, captura y envío. |
| `npm run test:model-training` | Entrenador, conjuntos del navegador y recuperación de grabaciones. |

```bash
npm run test:admin
npm run test:training
npm run test:model-training
```

Estos comandos comprueban el acceso y la moderación, la preparación de datos, la captura, el envío, la recuperación y el entrenador. Las pruebas sintéticas verifican el software; no representan precisión de reconocimiento de LSCh. Las pruebas de cámara física y validación lingüística requieren comprobaciones adicionales.

---

## Consideraciones éticas y de comunidad

- El proyecto se desarrolla con la asesoría directa de un miembro de la comunidad sorda.
- Se evita imponer una "forma correcta única" de hacer una seña: la revisión debe considerar variantes regionales sin descartarlas por desconocimiento.
- Cualquier decisión sensible respecto a cómo representar variantes lingüísticas se conversa primero con la comunidad antes de implementarse.

---

## Autores

| Integrante | Participación |
| --- | --- |
| **Diego Armando Padilla Serrano** | Autor y desarrollador principal del proyecto. |
| **Ignacio Hernández** | Colaborador del proyecto. |
| **Felipe Crisóstomo** | Colaborador del proyecto. |

Gracias también a la comunidad sorda que participa activamente grabando, validando y guiando las decisiones del proyecto — sin ellos, esto no sería posible.

---

## Licencia

Pendiente de definir.
