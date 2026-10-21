<div align="center">

# DeafApp 🤟

### Reconocimiento de Lengua de Señas Chilena

![Estado beta](https://img.shields.io/badge/Estado-BETA-E94560?style=flat-square)
![Lengua de Señas Chilena](https://img.shields.io/badge/Lengua-LSCh-18C8D8?style=flat-square)
![Expo SDK 57](https://img.shields.io/badge/Expo-SDK_57-111827?style=flat-square)
![Supabase](https://img.shields.io/badge/Datos-Supabase-3ECF8E?style=flat-square)
![Cloudflare Workers](https://img.shields.io/badge/Web-Cloudflare_Workers-F38020?style=flat-square)

**[Abrir DeafApp](https://deafapps.com)** · **[Funciones](#funciones)** · **[Privacidad](#privacidad-y-consentimiento)** · **[Instalación](#desarrollo-local)** · **[Administración](#panel-de-administración)**

</div>

DeafApp es una plataforma comunitaria para recolectar, validar y reconocer señas de la **Lengua de Señas Chilena (LSCh)**, desarrollada como proyecto de título de Ingeniería en Informática (Duoc UC). El proyecto nace de la experiencia de ver a un amigo sordo enfrentar barreras de comunicación en el día a día, y busca construir —con la propia comunidad sorda— una base de datos y un sistema de reconocimiento en tiempo real que ayuden a reducir esas barreras.

> ⚠️ **Proyecto en fase BETA.** Puede presentar cambios y errores mientras se sigue desarrollando.

La versión actual permite aportar señas y oraciones con autorización previa, revisar las grabaciones y entrenar candidatos desde el administrador. Incluye una prueba privada de interpretación conectada al backend Python. El sistema de interpretación completo en tiempo real entre LSCh, voz y texto sigue siendo el objetivo del proyecto; todavía no está disponible como función pública.

| Vocabulario | Organización | Acceso público | Acceso privado |
| :---: | :---: | :---: | :---: |
| **29 señas + 4 oraciones** | **7 categorías visibles** | Catálogo y aportes autorizados | Revisión, material, entrenamiento e interpretación beta |

**Sitio oficial:** [deafapps.com](https://deafapps.com) · **Repositorio:** [Biizcochito/DeafAPP-LSCH](https://github.com/Biizcochito/DeafAPP-LSCH) · **Trabajo del equipo:** [CONTRIBUTING.md](CONTRIBUTING.md)

### Navegación

| Para conocer la app | Para desarrollar | Para revisar datos |
| --- | --- | --- |
| [Funciones](#funciones) | [Stack técnico](#stack-técnico) | [Panel de administración](#panel-de-administración) |
| [Flujo de grabación](#flujo-de-grabación) | [Estructura relevante](#estructura-relevante) | [Base de datos](#base-de-datos-supabase) |
| [Estado del proyecto](#estado-del-proyecto) | [Desarrollo local](#desarrollo-local) | [Modelo y resultados](#sobre-el-modelo-de-reconocimiento) |
| [Autores](#autores) | [Build y despliegue](#build-y-despliegue) | [Pruebas](#pruebas) |
| [Experiencia web actual](#experiencia-web-actual) | [Flujo del equipo](#flujo-del-equipo) | [Acceso al administrador](https://deafapps.com/admin) |
| [Privacidad y consentimiento](#privacidad-y-consentimiento) | [Web y backend Python](#web-y-backend-python) | [Detalle de privacidad](docs/PRIVACIDAD-LEY-21719.md) |

---

## Funciones

| Función | Qué permite |
| --- | --- |
| 🌐 **Portada y navegación renovadas** | Conocer el proyecto en la bienvenida y acceder a la app con una interfaz adaptable a computador y celular. |
| 🤟 **Catálogo comunitario** | Aportar 29 señas prioritarias y 4 oraciones completas desde celular o computador para preparar su entrenamiento. |
| 💬 **Oraciones simples** | Grabar 4 oraciones cotidianas completas, con búsqueda, filtros y progreso local. |
| 🔎 **Búsqueda y filtros** | Buscar señas o categorías y filtrar una categoría por todas, por grabar o ya grabadas en este dispositivo. |
| 🎥 **Grabación guiada** | Confirmar ambas manos al inicio y continuar con una o dos durante la cuenta regresiva y la toma. Tolera interrupciones breves del detector. |
| 📄 **Privacidad y consentimiento** | Consultar el aviso y los términos, autorizar cada finalidad antes de abrir la cámara y retirar la autorización local. |
| ✋ **Trazados en vivo** | Mostrar u ocultar puntos de cara y manos, consultar su estado y recibir mensajes de ayuda. |
| 📱 **Encuadre adaptable** | Utilizar una vista horizontal en computador y vertical en celular. |
| ▶️ **Vista previa** | Reproducir, repetir o descartar la grabación antes de enviarla. |
| 💾 **Borrador local** | Recuperar una toma pendiente y reintentar su envío sin duplicarla, cuando hay almacenamiento disponible. |
| 📊 **Mis aportes** | Consultar las señas enviadas, repeticiones y avance por categoría desde este dispositivo. |
| 💬 **Ayuda y sugerencias** | Revisar cómo preparar una grabación y enviar sugerencias, errores o propuestas de señas. |
| 🔐 **Revisión administrativa** | Aprobar, rechazar o devolver a pendientes las contribuciones recibidas. |
| 🎛️ **Administrador renovado** | Navegar entre revisión, entrenamiento, material y diagnóstico con el diseño compartido de DeafApp y una interfaz adaptable. |
| 🛑 **Control de gesto** | Bloquear la configuración específica del dedo medio levantado cuando el detector la confirma. |
| 🧪 **Entrenamiento experimental** | Recuperar grabaciones antiguas, revisar etiquetas y entrenar grupos pequeños desde el administrador. |
| 📊 **Avance privado del catálogo** | Consultar candidatos, cobertura y pruebas reservadas; cargar los modelos de señas para probar una toma nueva con cámara. |
| 🎬 **Oraciones completas** | Capturar las cuatro oraciones, entrenar un prototipo personal en el navegador y probarlo sin indicar la respuesta esperada. |
| 🧭 **Asistente privado de entrenamiento** | Recomendar próximas tomas, revisar calidad, comparar candidatos y coordinar el aprendizaje y las pruebas reservadas. |
| 🐍 **Backend Python integrado** | Iniciar la API local, consultar sus 19 clases de alimentos y entrenar candidatos desde el panel privado. |

La cara y las manos se procesan por separado para actualizar sus resultados. El botón **Reiniciar cámara** permite volver a iniciar la captura. El control del dedo medio es específico: no clasifica todos los gestos obscenos ni reemplaza la revisión administrativa.

### Experiencia web actual

El rediseño organiza la bienvenida, el catálogo y las pantallas de grabación con una identidad visual compartida. Conserva el flujo de captura, revisión y envío, la conexión con los datos existentes y las herramientas del administrador.

| Dirección | Pantalla | Uso |
| --- | --- | --- |
| [deafapps.com](https://deafapps.com) | **Bienvenida** | Presentación, cómo participar, estado del proyecto y comunidad. |
| [deafapps.com/app](https://deafapps.com/app) | **Aplicación** | Catálogo, búsqueda, grabación, aportes del dispositivo y menú Más. |
| [deafapps.com/admin](https://deafapps.com/admin) | **Administración** | Formulario de acceso con contraseña y herramientas privadas del equipo. |
| [deafapps.com/privacidad](https://deafapps.com/privacidad) | **Privacidad** | Datos del aporte, finalidades, conservación y contacto del responsable. |
| [deafapps.com/terminos](https://deafapps.com/terminos) | **Términos** | Condiciones de participación y uso autorizado de los aportes. |
| [deafapps.com/consentimiento](https://deafapps.com/consentimiento) | **Tu autorización** | Decisiones separadas antes de captar una nueva grabación. |

Dentro de la app, la navegación reúne **Grabar**, **Mis aportes** y **Más**. La cabecera incluye **Sugerencias** y **Ayuda para grabar**; el menú Más permite volver a la bienvenida y consultar el estado del proyecto. El pie de la aplicación mantiene accesibles privacidad y términos. Las seis rutas admiten enlaces directos y navegación con Atrás o Adelante.

**Mis aportes** es un registro local de envíos; no muestra decisiones de moderación ni cifras globales. Borrar los datos del navegador elimina ese resumen. Los cinco clics sobre el logo abren el acceso al administrador; no autentican al usuario.

### Flujo de grabación

| Paso | Acción | Resultado |
| :---: | --- | --- |
| **1** | Elegir una categoría y una seña u oración. | Se puede explorar el catálogo sin activar la cámara. |
| **2** | Revisar el aviso y autorizar la participación si aún no hay un comprobante vigente. | La autorización se registra antes de acceder a la captura. |
| **3** | Pulsar **Preparar grabación** y mostrar ambas manos. | En web se exige una detección inicial estable durante **500 ms**. |
| **4** | Esperar la cuenta regresiva 3-2-1. | Después de confirmar ambas manos se puede retirar cualquiera de ellas. |
| **5** | Realizar la seña u oración con una o dos manos. | Se capturan **30 fotogramas** y sus observaciones de seguimiento. |
| **6** | Revisar, repetir o guardar para después. | El borrador permanece en el dispositivo cuando el almacenamiento está disponible. |
| **7** | Pulsar **Enviar**. | Se sube el aporte con su comprobante y queda pendiente de revisión. |

La continuidad de manos en web tolera hasta **1,2 segundos desde la última detección válida**, para que retirar una mano o una interrupción breve del detector no invalide toda la toma. Una pérdida prolongada de todas las manos o un fallo de cámara o del detector detiene la grabación. Los puntos ausentes se conservan como ausentes; no se completan con detecciones inventadas. Cada intento nuevo vuelve a exigir la confirmación inicial de ambas manos.

Los votos públicos ya no conceden aprobación. Los candidatos de entrenamiento se guardan en el navegador y no activan automáticamente reconocimiento público.

### Oraciones simples

El catálogo visible concentra la recolección y preparación del entrenamiento en
**29 señas individuales y 4 oraciones completas**. Las demás etiquetas se conservan
para revisar aportes anteriores y preparar datos desde administración.

| Categoría | Señas prioritarias |
| --- | --- |
| **Pronombres** | Yo, tú, nosotros. |
| **Verbos** | Querer, tener, comer, beber, ir, trabajar, estudiar, necesitar. |
| **Necesidades básicas** | Agua, comida, hambre, sed, ayuda, cansado, casa. |
| **Tiempo y fechas** | Hoy, mañana, ahora, después. |
| **Saludos** | Hola, bien, gracias. |
| **Conversación** | Sí, no, no entiendo, repite. |

Las cuatro oraciones se eligieron por su relación con las señas individuales visibles:

| Oración (referencia en español) | Señas relacionadas |
| --- | --- |
| **Quiero agua** | Querer, agua. |
| **Quiero comer** | Querer, comer. |
| **Necesito ayuda** | Necesitar, ayuda. |
| **Estoy bien** | Yo, bien; referencia de entrenamiento: «yo bien». |

La etiqueta de entrenamiento **«yo bien»** corresponde a la oración **«estoy bien»**.
Se conserva la etiqueta de origen de las muestras y se usa el nombre «estoy bien»
en el catálogo, la preparación y la presentación de resultados. Esta equivalencia
se aplica a la oración completa; «yo» y «bien» siguen siendo señas individuales.

La realización en LSCh requiere validación con la persona sorda que colabora en el
proyecto, sin asumir una traducción palabra por palabra del español.

En **Grabar → Ver las 4 oraciones**, cada oración se captura en una sola toma con el
mismo flujo de cámara, revisión, borrador y envío del catálogo. `CATEGORIAS_VISIBLES`
en `src/catalog/signCatalog.js` define esta selección y conserva las etiquetas originales.

Las grabaciones mantienen el JSON de captura v2, los 30 fotogramas y los metadatos de
seguimiento, y se organizan como `oraciones/<etiqueta>/`. La preparación de datos las
incluye como clases propias después de la revisión habitual. Son enunciados en español
para aportar su realización en LSCh; no representan una secuencia de señas prescrita
ni implican que el modelo actual ya reconozca oraciones.

En **Administración → Entrenamiento → Avance y oraciones** se muestran ocho
candidatos del catálogo visible. El candidato de cámara predeterminado compara la
forma y el movimiento de las manos, con 28 originales de aprendizaje y tres tomas
reservadas. Sus referencias abarcan 18 clases; el reconocimiento está habilitado
para **hola y agua**. Las demás clases ayudan a detectar movimientos diferentes.
El panel muestra las señas habilitadas para el candidato elegido.

Los vídeos reales de hola y agua pasan por el detector de cámara y devuelven la
etiqueta correspondiente. Esa reproducción usa material fuente de entrenamiento y
comprueba la integración, no precisión con personas nuevas. Una captura aprobada de
hola, excluida del nuevo candidato, también se reconoce. La toma reservada de agua
en contexto todavía falla; el candidato se abstiene en las dos secuencias de contexto
reservadas. No hay precisión general validada. Los pesos y los informes requieren
una sesión administrativa y no se incluyen en el paquete público de la web.

En **Prueba de reconocimiento con cámara**, el candidato se carga al iniciar la
prueba. Se muestra el resultado, las tres coincidencias más cercanas y el motivo
de una abstención. La similitud y los votos de árboles no son porcentajes de acierto.

**Entrenar con mis señas** adapta un candidato a las capturas de este navegador:
requiere tres tomas distintas de al menos dos señas individuales. Las pruebas
reservadas, sus copias y los aumentos no entran al aprendizaje. La toma de prueba
no utiliza la etiqueta seleccionada para grabar; el candidato personal permanece
en memoria de la sesión y necesita evaluación con movimientos nuevos.

El laboratorio privado permite guardar puntos de al menos tres tomas completas por
oración en este navegador. Con esas tomas se puede entrenar un candidato personal y
probar una captura nueva, sin enviarle la etiqueta elegida para grabar. Las tomas
persisten en el dispositivo; el modelo personal permanece en la sesión. Este flujo
no concatena señas individuales, no tiene una precisión independiente validada y no
activa automáticamente un intérprete público.

El **asistente de entrenamiento** organiza el siguiente paso según tres objetivos:
mejorar las oraciones, completar las señas visibles o revisar fallos. Sus
recomendaciones combinan reglas de calidad, cobertura del informe y predicciones
de los modelos reales. Puede preparar una captura prioritaria, iniciar el
entrenamiento personal y comparar una seña nueva con los candidatos privados,
agrupados por el mismo vocabulario. Las abstenciones y discrepancias requieren
revisión; no cambian etiquetas automáticamente.

Después de una prueba de oración se confirma qué se realizó. Esa toma queda
**reservada para evaluar** y se excluye de los entrenamientos posteriores, incluso
si aparece una copia con otro identificador. Se distinguen los aciertos en
oraciones conocidas y las aceptaciones erróneas de otros movimientos. Los códigos
de perfil son declarados y no verifican identidad. Las tomas, revisiones y pruebas
permanecen en el navegador; el informe del servidor se muestra por separado.

### Privacidad y consentimiento

El catálogo y los documentos se pueden consultar sin autorizar una grabación. Antes de captar un aporte nuevo, la app presenta **Tu autorización** con decisiones separadas y sin casillas premarcadas.

| Control | Comportamiento actual |
| --- | --- |
| **Finalidades separadas** | Aceptación de términos, captación de imagen y puntos de manos/rostro, y uso para entrenamiento y evaluación. |
| **Quién autoriza** | Participación personal o autorización de un representante declarado, según el grupo de edad indicado en el formulario. |
| **Comprobante versionado** | Conserva la fecha, las decisiones y una copia del aviso; acompaña al archivo enviado. Versión actual: **2026-10-17-v1**. |
| **Conservación** | Cada envío nuevo registra un plazo de **24 meses desde el aporte**, con fecha de inicio y vencimiento. |
| **Retirada local** | Borra la autorización de este dispositivo y exige autorizar de nuevo antes de otra captura. Las comprobaciones de envío se repiten entre etapas. |
| **Grabaciones anteriores** | Una toma sin autorización previa puede recuperarse para revisión, pero no recibe consentimiento retroactivo para su envío. |
| **Demostración local** | `npm run web:privacy-preview` permite recorrer el aviso y el formulario sin activar la cámara ni enviar aportes reales. |

Registrar el vencimiento no elimina los archivos automáticamente. La supresión de aportes remotos y la atención de solicitudes corresponden al procedimiento del responsable; retirar el comprobante local tampoco borra aportes ya enviados ni modelos entrenados. El alcance técnico y las responsabilidades pendientes se detallan en [Privacidad y consentimiento de DeafApp](docs/PRIVACIDAD-LEY-21719.md).

### Encuadre por dispositivo

| Dispositivo | Proporción | Ancho máximo |
| --- | :---: | :---: |
| 💻 Computador | **4:3** | **600 px** |
| 📱 Celular | **9:16** | **450 px** |

El tamaño se adapta al espacio disponible. Tener una entrada en el catálogo no significa que ya exista un modelo capaz de reconocerla.

### Prueba de interpretación (beta)

El backend Python está incorporado en `backend/`. Para iniciar web y API desde este
proyecto, usa **`iniciar-proyecto.bat`** o **`npm run proyecto`**. Dentro del administrador,
**Entrenamiento LSCh → Modelo de interpretación** reúne conexión, palabras reconocidas,
resultados, importación de grabaciones aprobadas y entrenamiento de candidatos.
**Capturas revisadas** conserva el entrenamiento experimental del navegador.
Consulta [la integración de Python](backend/INTEGRACION.md) para instalación y detalles.

Pantalla privada **«Probar interpretación»**, en **Administrador → Entrenamiento LSCh → Modelo de interpretación → Probar interpretación (beta)**. Interpreta **una seña por clip**: cuenta
atrás 3-2-1, captura de 30 fotogramas (igual que la grabación) y consulta a la API de LSCh, que responde con las **3 señas más
probables** y sus porcentajes (y un aviso si no se ven las manos). El backend de prueba descrito para el proyecto se entrenó
con **19 palabras de alimentos**; el apartado **Palabras que reconoce** muestra las clases informadas por el servidor
conectado. Con pocos datos puede equivocarse: por eso muestra tres opciones.

| Pieza | Archivo |
| --- | --- |
| Lógica (captura, consulta, mensajes de error, resumen del resultado) | [translator.js](src/translator/translator.js), probada con [tests/translator.test.mjs](tests/translator.test.mjs) |
| Estado compartido web/celular | [useTranslator.js](src/translator/useTranslator.js) |
| Pantalla web (DOM + CSS) y pantalla nativa | [TranslatorScreen.web.js](src/translator/TranslatorScreen.web.js) + [TranslatorScreen.css](src/translator/TranslatorScreen.css), [TranslatorScreen.js](src/translator/TranslatorScreen.js) |
| Dirección de la API guardada en el dispositivo | [translatorSettingsStore.js](src/translator/translatorSettingsStore.js) / [translatorSettingsStore.web.js](src/translator/translatorSettingsStore.web.js) |

La API utiliza Python con TensorFlow y corre en el PC desde `backend/` (`npm run backend` o `iniciar-proyecto.bat`).
Se incorporó desde `Biizcochito/Proyecto_LSCh`, rama `puente-deafapp`, y puede exponerse con un túnel HTTPS. La pantalla tiene un apartado **Servidor**
para escribir su dirección (`https://algo.trycloudflare.com`); se guarda en el dispositivo y puede fijarse al compilar con
`EXPO_PUBLIC_LSCH_API`. Una página HTTPS no puede llamar a una API `http://` ajena, por eso se usa el túnel. El celular manda
los fotogramas y el servidor calcula los puntos con el mismo MediaPipe con que se armó el dataset; los fotogramas con tu cara
viajan hasta ese servidor, así que conviene avisarlo en una demo.

### Estado del proyecto

| Área | Estado | Alcance actual |
| --- | --- | --- |
| Captura y revisión de grabaciones | **Implementadas** | Cámara, trazados, vista previa y moderación administrativa. |
| Privacidad y autorización | **Implementadas en el cliente** | Aviso, términos, comprobante previo a la captura y plazo de 24 meses registrado por aporte. Supresión remota y validación del consentimiento en servidor requieren su gestión específica. |
| Material de LSCh | **Disponible en administración** | Referencias y catálogo para consulta y preparación posterior. |
| Entrenamiento de señas aisladas | **Experimental** | Grupos pequeños de señas revisadas, evaluación separada y candidatos guardados en el navegador. |
| Reconocimiento para distintas personas | **Pendiente de validar** | Requiere más originales y evaluación con personas independientes. |
| Interpretación de una seña por clip | **Prueba (beta)** | 19 palabras de alimentos; muestra las 3 señas más probables. Necesita la API del backend encendida. |
| Interpretación continua entre LSCh, voz y texto | **Objetivo del proyecto** | Todavía no es una función pública. |

**Este proyecto NO busca reemplazar a los intérpretes de lengua de señas.** Es una herramienta de apoyo y aprendizaje.

---

## Stack técnico

| Capa | Tecnología |
|---|---|
| Frontend | React Native 0.86 + React 19.2.3 + Expo SDK 57, exportado a web |
| Interfaz web | Componentes DOM y CSS, Motion, OGL y tipografía Bricolage Grotesque; recursos visuales incluidos en `public/` |
| Cámara | Expo Camera, trazados sobre la imagen y ajustes de compatibilidad web |
| Despliegue | GitHub Actions + FTPS a HostGator para `deafapps.com`; Cloudflare Workers con archivos estáticos y vistas previas por rama |
| API de la prueba de interpretación | Backend Python incluido en `backend/`, con TensorFlow y MediaPipe; ejecución local o dirección configurable con `EXPO_PUBLIC_LSCH_API` |
| Backend / datos | Supabase (PostgreSQL + Storage + RLS + RPC de administración) |
| Seguimiento de cara | MediaPipe Face Mesh, cargado desde CDN |
| Seguimiento de manos | TensorFlow.js + MediaPipe Hands en un Web Worker, con modelos incluidos en los archivos web y una alternativa de compatibilidad |
| Modelos de reconocimiento | Conv1D temporal experimental en el navegador y CNN temporal de 19 clases en el backend Python incluido |
| Persistencia local | IndexedDB para borradores, recuperaciones y candidatos de entrenamiento en la versión web |

La implementación actual de entrenamiento utiliza cara y manos. El código conserva utilidades de Holistic para funciones opcionales, pero no se necesita pose para mostrar los trazados de grabación.

---

## Estructura relevante

<details>
<summary><strong>Ver archivos y carpetas principales</strong></summary>

```text
DeafAPP-LSCH/
├── App.js                       # Entrada y estado compartido de la app
├── index.js                     # Registro del componente principal de Expo
├── src/                         # Código de la aplicación, por función
│   ├── app/                     # Bienvenida, catálogo y navegación
│   ├── admin/                   # Panel privado, revisión y entrenamiento
│   ├── camera/                  # Cámara, detección y trazados
│   ├── catalog/                 # Vocabulario, categorías y oraciones
│   ├── contributions/           # Resumen de aportes y persistencia local
│   ├── privacy/                 # Avisos, autorización y comprobantes
│   ├── recording/               # Captura, borradores y envío de grabaciones
│   ├── training/                # Preparación de datos y modelos del navegador
│   ├── translator/              # Prueba de interpretación y API Python
│   └── ui/                      # Tema, componentes visuales y licencias
├── backend/                     # API y entrenamiento Python
├── admin/                       # SQL y metadatos del administrador
├── training/                    # Guías, fuentes y datos de trabajo locales
├── public/                      # Recursos web, fuentes y detectores de manos
├── assets/                      # Recursos de Expo
├── scripts/                     # Comandos de desarrollo y preparación
├── tests/                       # Pruebas automatizadas
├── docs/                        # Diseño, producto y detalle de privacidad
├── archive/                     # Exportaciones y prototipos anteriores
├── artifacts/                   # Evidencias y experimentos técnicos
├── Capstone/                    # Documentación y entregables académicos
├── .github/workflows/           # Publicación automática por FTPS a HostGator
├── deploy/.htaccess             # HTTPS, rutas y cabeceras de la web
├── app.json                     # Configuración de Expo
├── wrangler.jsonc               # Archivos estáticos y rutas SPA en Cloudflare
├── iniciar-proyecto.bat          # Inicio de web y backend en Windows
└── CONTRIBUTING.md              # Ramas y flujo de trabajo del equipo
```

</details>

El mapa de carpetas y las guías principales están en [docs/README.md](docs/README.md). El código actual vive en `App.js` y `src/`; las copias de `archive/` se conservan como referencia y no se usan para compilar. Las fuentes y los datos locales de `training/` se mantienen separados de los módulos ejecutables de `src/training/`.

Los modelos de seguimiento de manos incluidos en `public/hand-model` detectan puntos de la mano: **no son modelos entrenados para interpretar señas de LSCh**. Los candidatos creados desde el administrador se guardan por separado en el navegador.

---

## Desarrollo local

Usar **Node.js 22.13 o posterior**, compatible con [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/), y ejecutar los comandos desde la raíz del repositorio.

### Flujo del equipo

| Rama | Propósito | Cómo recibe cambios |
| --- | --- | --- |
| **`master`** | Producción en [deafapps.com](https://deafapps.com). | Solo por PR aprobado desde `dev`; no se programa ni se hace commit directamente. |
| **`dev`** | Integración del trabajo de los tres integrantes. | PR desde `feature/*` o `fix/*`; no se programa directamente aquí. |
| **`feature/*` y `fix/*`** | Una rama por ticket de Jira, creada desde `dev`. | Trabajo del ticket y PR hacia `dev`. |
| **`cloudflare/workers-autoconfig`** | Configuración de Cloudflare. | Se conserva aparte; no se usa para desarrollo diario. |

```bash
# Al comenzar la jornada
git checkout dev
git pull origin dev

# Al tomar un ticket de Jira
git checkout -b feature/nombre-del-ticket

# Al terminar el trabajo
git add README.md  # Ejemplo: agrega los archivos que cambiaste
git commit -m "Describe el cambio"
git push -u origin feature/nombre-del-ticket
```

Abrir un PR de la rama del ticket hacia **`dev`**. Cuando la integración esté revisada y probada, abrir un PR de **`dev` hacia `master`** y aprobarlo antes de fusionar. En este repositorio la rama de producción se llama **`master`**.

La revisión y la fusión se realizan en GitHub; **la publicación posterior es automática**. Las protecciones de ramas deben configurarse en GitHub para exigir estas reglas. El flujo completo está en [CONTRIBUTING.md](CONTRIBUTING.md) y su resumen para agentes de IA en [AGENTS.md](AGENTS.md).

### Iniciar el entorno de desarrollo

```bash
npm ci
npx expo start --web
```

`npm ci` instala las versiones de `package-lock.json` y ejecuta el ajuste de compatibilidad de Expo Camera mediante [scripts/patch-expo-camera.cjs](scripts/patch-expo-camera.cjs). Al modificar dependencias deliberadamente, `npm install` actualiza el archivo de bloqueo y también ejecuta ese ajuste.

Si Expo detecta TypeScript en archivos auxiliares locales, este proyecto JavaScript puede iniciarse en PowerShell sin su configuración automática:

```powershell
$env:EXPO_NO_TYPESCRIPT_SETUP = "1"
npx expo start --web --localhost --port 8081
```

### Web y backend Python

Para la prueba privada de interpretación y el entrenamiento Python, usar **Python 3.12**. En una instalación nueva, preparar primero sus dependencias:

```bash
npm run backend:setup
npm run proyecto
```

En Windows también se puede abrir **`iniciar-proyecto.bat`** después de preparar el entorno. El comando integrado inicia la API en **`http://127.0.0.1:5000`** y reutiliza la web del puerto **8081** si ya está abierta; si está libre, exporta y sirve `dist/`.

| Comando | Uso |
| --- | --- |
| `npm run backend` | Iniciar únicamente la API Python. |
| `npm run backend:check` | Comprobar la API con el script de diagnóstico del proyecto. |
| `npm run backend:import` | Importar grabaciones aprobadas para preparar datos locales. |
| `npm run backend:train` | Entrenar un candidato en una carpeta nueva de `backend/runs/`. |
| `npm run backend:test` | Ejecutar las pruebas Python integradas. |

El apartado privado **Entrenamiento LSCh → Modelo de interpretación** comparte la dirección de servidor con **Probar interpretación (beta)**. Un celular debe usar una dirección accesible del PC o una API HTTPS. Instalación y alcance: [backend/INTEGRACION.md](backend/INTEGRACION.md).

### Probar privacidad sin cámara ni envíos

```bash
npm run web:privacy-preview
```

Abrir **[http://localhost:8083/consentimiento](http://localhost:8083/consentimiento)**. Este modo sustituye la cámara por una confirmación ilustrada y bloquea las escrituras al servidor. Su comprobante de demostración no autoriza aportes reales.

### Comprobar la exportación web

Para comprobar la versión exportada, como en las pruebas locales del proyecto:

```bash
npx expo export -p web
node scripts/serve-web.cjs
```

Abrir **[http://127.0.0.1:8081/](http://127.0.0.1:8081/)** para la información del proyecto y **[http://127.0.0.1:8081/app](http://127.0.0.1:8081/app)** para la app. Para grabar, completar la autorización y permitir el acceso a la cámara. El servidor local también admite las rutas `/admin`, `/privacidad`, `/terminos` y `/consentimiento` al abrirlas directamente o recargar. El seguimiento requiere cargar sus modelos; la primera inicialización puede tardar según el dispositivo y la conexión.

---

## Build y despliegue

### Producción en deafapps.com

Cada cambio integrado en **`master`** activa el workflow [Deploy a HostGator](https://github.com/Biizcochito/DeafAPP-LSCH/actions/workflows/deploy-hostgator.yml). Su configuración está en [.github/workflows/deploy-hostgator.yml](.github/workflows/deploy-hostgator.yml): instala dependencias con `npm ci`, exporta la web, copia [deploy/.htaccess](deploy/.htaccess) a `dist/.htaccess` y publica `dist/` por FTPS en HostGator.

Las credenciales FTPS se toman de los secretos del repositorio. **`deploy/.htaccess` debe permanecer versionado**: configura HTTPS, las rutas `/app` y `/admin`, el permiso de cámara y las cabeceras de los archivos. No se agrega al `.gitignore`.

### Cloudflare y vistas previas

El Worker existente [deafapp-lsch](https://deafapp-lsch.deafapp-lsch.workers.dev) conserva su despliegue complementario. [wrangler.jsonc](wrangler.jsonc) declara `dist/` como directorio de archivos estáticos, `html_handling: "none"` y `not_found_handling: "single-page-application"`; junto con [public/_redirects](public/_redirects), permite abrir y recargar `/app` y `/admin`.

La integración de Cloudflare compila con `npx expo export -p web`: en ramas de vista previa ejecuta `npx wrangler versions upload`; en `master` ejecuta `npx wrangler deploy`. Las vistas previas permiten comprobar el cambio antes de promoverlo a producción.

### Exportación manual para comprobaciones

```bash
npx expo export -p web
```

La exportación genera **la carpeta `dist` completa**, con `index.html` en la raíz. Se puede comprobar con el servidor local descrito arriba. La publicación habitual del equipo se realiza mediante PR y los despliegues automáticos; no requiere cargar un ZIP manualmente.

| Archivo o carpeta | Uso en la publicación |
| --- | --- |
| **`dist/` completa** | Contiene la web exportada y los modelos de seguimiento necesarios. |
| **`dist/.htaccess`** | Copia de `deploy/.htaccess` incorporada por el workflow de HostGator. |
| **ZIP del contenido de `dist/`** | Copia para una carga manual de archivos estáticos; no sustituye el flujo de PR del equipo. |
| `App.js` | Código fuente de React Native; necesita la exportación y no se sube por separado. |
| `admin/`, `training/`, SQL y credenciales | No se incluyen en el paquete público. |
| Borradores y candidatos locales | Pertenecen al almacenamiento del navegador, no al despliegue. |

### APK para el celular

`eas.json` ya trae el perfil `preview` (distribución interna, que en Android genera un APK):

```bash
npx eas-cli login
EXPO_PUBLIC_LSCH_API=https://algo.trycloudflare.com npx eas-cli build -p android --profile preview
```

En PowerShell, definir la misma variable antes del comando de compilación:

```powershell
$env:EXPO_PUBLIC_LSCH_API = "https://algo.trycloudflare.com"
npx eas-cli build -p android --profile preview
```

Requiere una cuenta de Expo. **No se ha generado ningún APK desde esta copia**: el bundle de Android sí compila
(`npx expo export --platform android`), pero la app no se ha probado en un celular real. La cámara y los permisos del celular
son los de `expo-camera`, los mismos de la grabación.

Los borradores, las recuperaciones y los candidatos guardados en el navegador no forman parte de `dist`. **El sitio local, deafapps.com y las vistas previas de Cloudflare mantienen almacenamientos separados**; un candidato entrenado en uno no aparece automáticamente en los otros.

---

## Panel de administración

El formulario de administración se puede abrir de dos formas:

| Método | En la web | En desarrollo local |
| --- | --- | --- |
| **Ruta directa** | [https://deafapps.com/admin](https://deafapps.com/admin) | [http://127.0.0.1:8081/admin](http://127.0.0.1:8081/admin) |
| **Cinco pulsaciones del logo** | Pulsar el logo **DeafApp** de la cabecera cinco veces dentro de **3,5 segundos**, desde la bienvenida o la app. | El mismo gesto desde `/` o `/app`. |

Ambos métodos abren el formulario y exigen la contraseña configurada por el propietario. **Cinco pulsaciones no inician sesión ni conceden permisos.** La interfaz pública no muestra un enlace al panel; la ruta directa sigue disponible. La contraseña se comprueba en el servidor y no se incluye en el README ni en el código del navegador. No hace falta activar la cámara para administrar. El acceso nativo conserva las cinco pulsaciones del logo en la misma ventana de tiempo.

El administrador comparte logo, tipografía, colores y componentes con la app pública. En escritorio organiza las cinco áreas principales con navegación lateral; en móvil utiliza una navegación compacta. Cambiar de sección lleva el foco al contenido y cerrar sesión permanece accesible.

| Sección | Herramientas | Alcance |
| --- | --- | --- |
| **Grabaciones** | Búsqueda, filtros, reproducción y decisiones individuales o por lote. | Pendientes, aprobadas y rechazadas. |
| **Material de LSCh** | Referencias educativas y catálogo académico de **379 videos**. | Consulta; los enlaces no equivalen a muestras revisadas ni permisos de entrenamiento. |
| **Revisión de señas** | Segmentos de vídeo con etiqueta propuesta, prioridad para el catálogo visible y confirmación humana. | Decisiones privadas sincronizadas, versiones para evitar sobrescrituras y exportación para preparar el dataset; no entrena automáticamente. |
| **Entrenamiento LSCh** | Modelo de interpretación conectado a Python, prueba beta y capturas revisadas del navegador. | Importación de aprobadas, informes y candidatos; las herramientas Python verifican la sesión administrativa. |
| **Recuperar grabaciones antiguas** | Extracción de puntos, reproducción y revisión de etiquetas. | Conserva el orden; no inventa tiempos ni identidades ausentes. |
| **Modelos guardados** | Carga de candidatos e informes anteriores. | Datos almacenados en ese navegador. |
| **Datos y diagnóstico** | Conexión, cobertura del vocabulario e informes. | Seguimiento de la preparación de datos. |

La sesión administrativa dura dos horas y permanece en memoria. Salir del panel, cerrar sesión o recargar exige volver a entrar. Las operaciones comprueban la sesión y la versión de la grabación para evitar sobrescribir una revisión más reciente.

Los materiales y las pruebas se concentran en el panel privado. Al abrir o recargar `/app` y `/admin`, el alojamiento sirve la aplicación: [deploy/.htaccess](deploy/.htaccess) configura esas rutas en HostGator, y [wrangler.jsonc](wrangler.jsonc) junto con [public/_redirects](public/_redirects) las configura en Cloudflare. La sesión continúa validándose en el servidor. El antiguo acceso por `/#admin` y la sección pública «Visualizador» no describen el acceso actual.

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
| `votos_positivos` / `votos_negativos` | Compatibilidad con registros existentes; no otorgan aprobación en el flujo actual |
| `timestamp` | Fecha de creación |

**Storage bucket:** `contribuciones` — cada grabación se guarda como un archivo `.json` con el arreglo de fotogramas en base64.

Los nuevos archivos añaden versión de esquema, ID estable de grabación, idioma `csg`, intervalo de captura, proporción del encuadre y datos `training` con puntos de cara/manos y tiempos observados. Los aportes nuevos también incorporan `consent` y `retention`, con el comprobante previo y las fechas de conservación. Estos datos acompañan al JSON y no requieren nuevas columnas en la tabla. Se conservan las imágenes para poder reprocesarlas. Los puntos incluyen información de antigüedad; no se consideran perfectamente sincronizados con cada foto.

La app utiliza un código anónimo de origen local, que no identifica a una persona ni demuestra que dos dispositivos pertenezcan a participantes distintos.

Las sesiones, configuración y auditoría administrativas están en el esquema privado `deafapp_private`. La protección de las decisiones no convierte en privados los archivos existentes del bucket, que conserva su configuración pública.

---

## Sobre el modelo de reconocimiento

El administrador reúne dos recorridos de entrenamiento y evaluación:

| Recorrido | Modelo y datos | Uso actual |
| --- | --- | --- |
| **Capturas revisadas, en el navegador** | **Conv1D temporal**, con **32 pasos × 171 características** de cara y manos normalizadas. | Experimentos con grupos pequeños y candidatos guardados en este navegador. |
| **Modelo de interpretación, en Python** | El informe incluido configura una **CNN temporal** con rasgos de manos y **19 clases de alimentos**. | Una seña por clip, tres propuestas de resultado y entrenamiento de candidatos desde el panel privado. |

La arquitectura se consulta en la configuración del modelo: el archivo `modelo_lsch_lstm.keras` incluido está configurado como `cnn`. El entrenador Python permite también probar LSTM. El informe y el modelo conectado deben comprobarse juntos; ninguna de estas pruebas habilita interpretación continua pública.

El informe Python incluido registra **114 secuencias**, **57,02 %** de aciertos globales y **89,47 %** entre las tres primeras opciones. Son resultados de validación cruzada por tomas, no una medición con nuevas personas. Archivos y detalles: [backend/INTEGRACION.md](backend/INTEGRACION.md).

### Modos de entrenamiento

Los criterios siguientes corresponden al entrenador de **capturas revisadas del navegador**:

| Criterio | Evaluación independiente | Prototipo experimental |
| --- | --- | --- |
| Señas por grupo | **2 a 12** | **2 o 3** |
| Originales por seña | Al menos **5 de aprendizaje + 2 de prueba**. | Al menos **2 distintos y utilizables**. |
| Separación | Participantes declarados separados, sujetos a revisión de identidad. | Se reserva una toma por seña; puede ser de la misma persona o de identidad desconocida. |
| Interpretación | Los mínimos habilitan un experimento, sin garantizar precisión. | Prueba interna que no demuestra reconocimiento con otras personas. |

Se separan los originales antes de generar variaciones de entrenamiento. Las variaciones temporales y de encuadre no cuentan como personas nuevas. Cada candidato guarda sus etiquetas, modo, informe y matriz de confusión en el navegador; entrenarlo no habilita la interpretación para uso público.

El apartado **Material de LSCh** es un catálogo de consulta. Para utilizar una fuente externa en entrenamiento hace falta comprobar su autorización de uso, revisar la seña y preparar sus fragmentos y detecciones. La app no aprende automáticamente de todos los videos de internet ni de cada contribución recibida.

Preparación, recuperación y comandos del conjunto de datos: [training/README.md](training/README.md).

---

## Pruebas

| Comando | Qué comprueba |
| --- | --- |
| `npm run test:admin` | Acceso y operaciones de administración. |
| `npm run test:training` | Selección del catálogo, oraciones, preparación de datos, captura, envío, aportes locales, rutas web y prueba de interpretación. |
| `npm run test:model-training` | Entrenador, conjuntos del navegador y recuperación de grabaciones. |
| `npm run test:privacy` | Decisiones de autorización, conservación, retirada, rutas y envío de aportes. |
| `npm run test:python-backend` | Cliente de administración Python y lógica de interpretación. |
| `node --test tests/recordingHandGuard.test.mjs tests/gestureModeration.test.mjs tests/trainingCapture.test.mjs` | Confirmación inicial, continuidad con una mano, interrupciones del detector y datos de captura. |

```bash
npm run test:admin
npm run test:training
npm run test:model-training
npm run test:privacy
npm run test:python-backend
```

Estos comandos comprueban el acceso y la moderación, la preparación de datos, la captura, el envío, la recuperación, el entrenador, las rutas y la lógica de la prueba de interpretación. La prueba contra la API real de la prueba de interpretación se omite si no está configurada `LSCH_API_TEST` con un servidor disponible.

Las pruebas sintéticas verifican el software; no representan precisión de reconocimiento de LSCh. Las pruebas de cámara física y validación lingüística requieren comprobaciones adicionales.

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

Los componentes visuales adaptados, sus atribuciones y las licencias de terceros se detallan en [ui/NOTICE.md](src/ui/NOTICE.md) y [ui/LICENSE-react-bits.md](src/ui/LICENSE-react-bits.md). La licencia del proyecto completo sigue pendiente.
