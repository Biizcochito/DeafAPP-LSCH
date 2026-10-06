import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { Presentation, PresentationFile, FileBlob } from '@oai/artifact-tool';

const root = 'D:/Descargas D/DeafAPP-LSCH-master';
const build = path.join(root, '.codex-ppt-build-20261004');
const skill = 'C:/Users/bizco/.codex/plugins/cache/openai-primary-runtime/presentations/26.930.11008/skills/presentations';
const runtime = 'C:/Users/bizco/.cache/codex-runtimes/codex-primary-runtime/dependencies';
process.env.RUNTIME_NODE_MODULES = path.join(runtime, 'node/node_modules');
process.env.RUNTIME_NODE = path.join(runtime, 'node/bin/node.exe');
process.env.RUNTIME_PYTHON = path.join(runtime, 'python/python.exe');
const { resolvePresentationFont, finalizePresentation } = await import(pathToFileURL(path.join(skill, 'container_tools/artifact_tool_utils.mjs')).href);
const font = resolvePresentationFont({ fontFamily: 'Arial' });
const presentation = Presentation.create({ slideSize: { width: 1280, height: 720 } });
const C = { bg: '#10101F', text: '#FFFFFF', body: '#D6D6E4', cyan: '#5DE0DC', coral: '#ED3F63', muted: '#ADACBC', gold: '#F3CE77' };
const notes = [];
await fs.mkdir(path.join(build, 'rendered'), { recursive: true });

function text(slide, value, x, y, w, h, size = 24, color = C.body, bold = false) {
  const box = slide.shapes.add({ name: `slide-${presentation.slides.items.length}-text-${slide.shapes.items.length}`, geometry: 'textbox', position: { left: x, top: y, width: w, height: h }, fill: 'none', line: { fill: 'none', width: 0 } });
  box.text = value;
  box.text.style = { typeface: font, fontSize: size, bold, color, alignment: 'left', verticalAlignment: 'top', autoFit: 'none', wrap: 'square', insets: { top: 0, right: 0, bottom: 0, left: 4 } };
  return box;
}

function slide(title, sourceNotes, caption = '') {
  const s = presentation.slides.add();
  s.background.fill = C.bg;
  text(s, title, 64, 44, 1152, 70, 44, C.text, true);
  const n = presentation.slides.items.length;
  text(s, String(n).padStart(2, '0'), 1166, 679, 50, 24, 16, C.muted);
  if (caption) text(s, caption, 64, 661, 1080, 40, 16, C.muted);
  const note = `DeafApp. Estado documentado al 4 de octubre de 2026.\n${sourceNotes}\nLas capturas anteriores documentan la interfaz en el momento indicado. La versión local no demuestra que la misma actualización esté publicada en Cloudflare.`;
  s.speakerNotes.textFrame.setText(note);
  notes.push({ slide: n, title, notes: note });
  return s;
}

function blocks(s, entries, x = 64, y = 157, w = 395, gap = 153) {
  entries.forEach(([heading, body], i) => {
    text(s, heading, x, y + i * gap, w, 44, 28, C.cyan, true);
    text(s, body, x, y + i * gap + 48, w, gap - 52, 24, C.body);
  });
}

async function picture(s, name, frame, crop = undefined) {
  const original = path.join(root, 'artifacts', name);
  let pipeline = sharp(await fs.readFile(original));
  if (crop) pipeline = pipeline.extract({ left: crop[0], top: crop[1], width: crop[2], height: crop[3] });
  const { data, info } = await pipeline.png().toBuffer({ resolveWithObject: true });
  const scale = Math.min(frame.width / info.width, frame.height / info.height);
  const width = info.width * scale, height = info.height * scale;
  s.images.add({ blob: new Uint8Array(data), contentType: 'image/png', alt: `Captura real de DeafApp: ${name}${crop ? '. Recorte de la captura original.' : ''}`, fit: 'contain', position: { left: frame.left + (frame.width - width) / 2, top: frame.top + (frame.height - height) / 2, width, height } });
}
const R = { left: 495, top: 133, width: 721, height: 512 };

// 1. Cover.
{
  const s = presentation.slides.add(); s.background.fill = C.bg;
  text(s, 'DeafApp', 64, 125, 580, 106, 76, C.text, true);
  text(s, 'Mejoras implementadas', 64, 246, 600, 108, 48, C.cyan, true);
  text(s, 'Cámara, grabación y administración de datos de Lengua de Señas Chilena', 64, 379, 560, 130, 28);
  text(s, '4 de octubre de 2026', 64, 612, 500, 40, 24, C.muted);
  await picture(s, 'ppt-inicio-actual.jpg', { left: 670, top: 80, width: 540, height: 545 }, [345, 30, 600, 650]);
  s.speakerNotes.textFrame.setText('Captura actual de http://127.0.0.1:8081/ realizada para esta presentación el 4 de octubre de 2026. Fuente: artifacts/ppt-inicio-actual.jpg. Presentación de mejoras de la versión local. El objetivo final de traducir LSCh y voz/texto todavía está en desarrollo. No se muestran contraseñas ni claves.');
  notes.push({ slide: 1, title: 'DeafApp. Mejoras implementadas' });
}

// 2. Face overlay.
{
  const s = slide('Trazado de cara en la cámara', 'Fuente: artifacts/manos-rapidas-camara-real.jpg y artifacts/manos-rapidas-verificacion.md. Captura histórica de la cámara física local, 2 de octubre de 2026. Se observó también el estado de ambas manos detectadas y retirada de sus trazados al bajarlas.', 'Captura histórica de la cámara real en la web local');
  blocks(s, [['Seguimiento continuo', 'El contorno facial se actualiza sobre la imagen de la cámara.'], ['Alineación de la imagen', 'Se corrigieron el desfase y los puntos que permanecían congelados.'], ['Detección por separado', 'La cara y las dos manos mantienen su propio seguimiento.']]);
  await picture(s, 'manos-rapidas-camara-real.jpg', R, [240, 17, 625, 623]);
}

// 3. Hand performance.
{
  const s = slide('Reconocimiento de manos más rápido', 'Fuente: artifacts/manos-rapidas-verificacion.md y artifacts/manos-rapidas-verificacion.jpg. Detector regional MediaPipe HandPose 3D lite con TensorFlow.js en un Worker. Inicio del modelo y adquisición de manos son tiempos diferentes. Tras preparar el modelo: primera adquisición 63 ms, siguientes inferencias 38–74 ms, 8/8 imágenes desplazadas con ambas manos. La carga simultánea tuvo picos. No equivale a latencia total ni garantiza el mismo rendimiento en otros equipos.', 'Captura real del diagnóstico local con una imagen de prueba');
  blocks(s, [['Búsqueda guiada por la cara', 'El detector busca primero en regiones donde suelen aparecer las manos.'], ['21 puntos por mano', 'Se reutiliza el modelo y el procesamiento separado evita bloquear la interfaz.'], ['38 a 74 ms en la prueba', 'Inferencias tras preparar el modelo. La carga inicial y el equipo influyen.']]);
  await picture(s, 'manos-rapidas-verificacion.jpg', R, [16, 18, 1080, 604]);
}

// 4. Startup.
{
  const s = slide('Inicio y reinicio de la cámara', 'Fuentes: App.js, tests/webCameraCompatibility.test.mjs, scripts/patch-expo-camera.cjs y artifacts/camara-inicio-corregidos.png. Se corrigió la referencia inexistente a OverconstrainedError y se implementaron alternativas de restricciones y controles de reproducción/inicialización. La captura documenta una cámara física activa en la versión corregida. Ningún cambio garantiza compatibilidad con todo hardware.', 'Captura histórica de la interfaz con la cámara activa');
  blocks(s, [['Compatibilidad al iniciar', 'Se corrigieron fallos de restricciones que dejaban la imagen en negro.'], ['Recuperación visible', 'El botón Reiniciar cámara permite volver a intentar la conexión.'], ['Sesiones más estables', 'Se ajustó el ciclo de apertura y cierre al grabar o revisar una toma.']]);
  await picture(s, 'camara-inicio-corregidos.png', R, [240, 15, 625, 800]);
}

// 5. PC and phone.
{
  const s = slide('Cámara automática para PC y celular', 'Fuentes: artifacts/camara-automatica-verificacion.md, camara-automatica-pc.jpg, camara-automatica-celular.jpg. Interfaz real compilada con cámara simulada a partir de una imagen y subidas deshabilitadas. Celular emulado en navegador, no probado en teléfono físico. PC máximo 600 px de ancho en 4:3. Celular máximo 450 px en 9:16. Reducir la ventana de PC no cambia su clasificación.', 'Capturas de pruebas locales. El celular se comprobó con emulación del navegador.');
  text(s, 'PC · formato 4:3', 80, 128, 570, 40, 28, C.cyan, true);
  text(s, 'Celular · formato 9:16', 804, 128, 412, 40, 28, C.cyan, true);
  await picture(s, 'camara-automatica-pc.jpg', { left: 72, top: 182, width: 625, height: 356 }, [324, 54, 626, 482]);
  await picture(s, 'camara-automatica-celular.jpg', { left: 833, top: 182, width: 324, height: 450 });
  text(s, 'La web elige el formato según el dispositivo y conserva la proporción al cambiar el tamaño.', 80, 557, 630, 82, 24);
}

// 6. Hands and countdown.
{
  const s = slide('Grabación con una o dos manos', 'Fuentes: App.js, recordingHandGuard.js, trainingCapture.js y artifacts/grabacion-una-mano.png. Captura histórica de la cámara física durante la preparación. Se exige confirmar ambas manos al inicio de la sesión preparada, después se permite al menos una mano detectada. Preparar grabación arma la espera y cuenta atrás para que no haya que sostener las manos y pulsar a la vez. No afirmar que el fotograma de esta captura muestra una seña completa.', 'Captura real del flujo de preparación para grabar');
  blocks(s, [['Preparación sin apuro', 'Primero pulsas Preparar grabación y después colocas las manos.'], ['Confirmación inicial', 'La web verifica ambas manos una vez y comienza la cuenta atrás.'], ['Señas con una mano', 'Tras esa confirmación puedes grabar con una o con las dos manos.']]);
  await picture(s, 'grabacion-una-mano.png', R, [215, 17, 675, 745]);
}

// 7. Helpful instructions.
{
  const s = slide('Ayuda durante la detección de manos', 'Fuentes: App.js y artifacts/ayuda-deteccion-manos.png. Captura histórica de la cámara real cuando el detector buscaba las manos. Las sugerencias dependen de su estado y solo aparecen en el contexto de la grabación. La ayuda no sustituye la detección ni asegura disponibilidad inmediata.', 'Captura histórica de la ayuda contextual en la grabación');
  blocks(s, [['Estado comprensible', 'La pantalla indica cuándo está buscando una mano o cuándo ya la detectó.'], ['Consejos para corregir', 'Separar las manos, mejorar la luz o sacarlas y volver a mostrarlas.'], ['Primeras secuencias', 'Los mensajes explican que la primera detección puede tardar más.']]);
  await picture(s, 'ayuda-deteccion-manos.png', R, [220, 530, 665, 290]);
}

// 8. Gesture filter.
{
  const s = slide('Filtro del dedo medio levantado', 'Fuentes: artifacts/filtro-gestos-verificacion.md, artifacts/filtro-gestos-app.jpg y gestureModeration.js. Captura real de la interfaz compilada con entrada simulada basada en la imagen del usuario y subidas deshabilitadas. Regla concreta basada en 21 puntos, persistencia mínima de 3 detecciones y 250 ms. Es una configuración de mano y puede fallar si el modelo confunde dedos. No es un detector general de intención obscena. Otros gestos aún requieren ejemplos y revisión para no bloquear LSCh válida.', 'Captura de la web durante una prueba controlada del filtro');
  blocks(s, [['Aviso en la pantalla', 'La configuración del dedo medio levantado muestra el motivo del bloqueo.'], ['Bloqueo de la toma', 'El filtro impide preparar o completar una grabación con ese gesto.'], ['Alcance concreto', 'Otros gestos requieren ejemplos y revisión para evitar bloquear señas válidas.']]);
  await picture(s, 'filtro-gestos-app.jpg', R, [330, 310, 620, 407]);
}

// 9. Preview.
{
  const s = slide('Vista previa antes de enviar', 'Fuentes: App.js, recordingDraftStore.js, artifacts/vista-previa-verificacion.md y artifacts/vista-previa-grabacion.jpg. Captura de la interfaz real con cámara, detector y servidor simulados. La imagen dibujada pertenece a la prueba del software, no es una seña de entrenamiento. Se comprobó que abrir y reproducir la vista previa no sube datos. La toma válida contiene 30 fotogramas y conserva proporción. No se enviaron grabaciones reales durante esa prueba.', 'Captura real de la interfaz. La imagen y el servidor son de una prueba controlada.');
  blocks(s, [['Revisión de la toma', 'La grabación se reproduce antes de decidir si se envía.'], ['Control del usuario', 'Puedes pausar, repetir la grabación o guardarla para después.'], ['Envío explícito', 'Solo Enviar seña inicia la subida. La cámara se cierra durante la revisión.']]);
  await picture(s, 'vista-previa-grabacion.jpg', R, [324, 55, 625, 663]);
}

// 10. Save and retry.
{
  const s = slide('Guardado local y reintento del envío', 'Fuentes: artifacts/vista-previa-verificacion.md, artifacts/vista-previa-reintento.jpg, recordingDraftStore.js y recordingSubmission.js. Prueba compilada con datos simulados y IndexedDB aislada. Guardado de una toma pendiente por origen/navegador, recuperación al recargar, ruta única por toma, comprobación del registro antes del reintento y limpieza solo al completar. Web Locks cuando disponible y tiempo límite de 30 s. No afirmar prueba de subida real a producción.', 'Captura del fallo de conexión provocado para comprobar la recuperación');
  blocks(s, [['La toma se conserva', 'Al volver a abrir la misma web puedes recuperar la grabación pendiente.'], ['Reintentos sin duplicar', 'La subida comprueba el archivo y el registro antes de repetir pasos.'], ['Errores visibles', 'Si falla la conexión, aparece Reintentar envío y se mantiene la toma.']]);
  await picture(s, 'vista-previa-reintento.jpg', R, [324, 375, 628, 342]);
}

// 11. Public simplicity.
{
  const s = slide('Grabación sin elegir Persona 1 o 2', 'Fuentes: RecordingProfiles.js, recordingSource.js, trainingCapture.js, training/datasetPreparation.js y artifacts/grabacion-sin-personas.png. Captura actual tras retirar el selector. La cámara no se comprobó físicamente en esa captura y aparece negra. Se documentan los controles y ausencia del selector. Se guarda un código automático de origen local anónimo, no una identidad verificada. Se conservaron perfiles antiguos. La evaluación independiente no cuenta esos códigos como personas distintas.', 'Recorte de los controles actuales. Se retiró el selector de personas.');
  blocks(s, [['Menos pasos al grabar', 'El usuario ya no selecciona Persona 1, Persona 2 ni crea un perfil.'], ['Origen automático', 'Cada navegador conserva un código local para organizar las tomas.'], ['Evaluación responsable', 'Ese código no acredita que las grabaciones sean de personas distintas.']]);
  await picture(s, 'grabacion-sin-personas.png', R, [210, 525, 690, 355]);
}

// 12. Private tools.
{
  const s = slide('Herramientas técnicas fuera del menú', 'Fuentes: App.js, AdminPanel.js, admin/README.md y artifacts/menu-sin-visualizador.jpg. Captura histórica del menú después de retirar el visualizador público de landmarks. El menú de la captura conserva elementos previos de revisión, por lo que se muestra un recorte de categorías. En el estado actual la aprobación, catálogo y pruebas técnicas pertenecen al administrador. Se mantiene el trazado en la cámara de grabación.', 'Captura histórica del menú público, centrada en sus categorías');
  blocks(s, [['Menú de participación', 'El visualizador técnico independiente dejó de aparecer en el menú público.'], ['Pruebas en administración', 'El material de LSCh, diagnóstico y entrenamiento se abren en el panel privado.'], ['Trazado al grabar', 'La guía sobre manos y cara permanece disponible en la cámara.']]);
  await picture(s, 'menu-sin-visualizador.jpg', R, [10, 32, 1080, 700]);
}

// 13. Admin gate.
{
  const s = slide('Administrador oculto con contraseña', 'Fuentes: AdminPanel.js, admin/README.md y artifacts/ppt-acceso-admin.jpg. Captura actual de la pantalla de acceso, 4 de octubre de 2026. Acceso mediante cinco pulsaciones consecutivas en el logo de DeafApp. Validación de contraseña en el servidor Supabase, sesión temporal y límite de intentos. No se incluye la contraseña en esta presentación. Protección del administrador no significa que los objetos del bucket antiguo de grabaciones sean privados.', 'Captura actual del acceso privado. La contraseña no aparece.');
  blocks(s, [['Entrada discreta', 'Cinco pulsaciones seguidas sobre el logo abren el acceso al administrador.'], ['Autenticación del servidor', 'La contraseña se valida en el servidor y habilita una sesión temporal.'], ['Trabajo centralizado', 'El equipo revisa grabaciones y datos de entrenamiento desde este panel.']]);
  await picture(s, 'ppt-acceso-admin.jpg', R, [177, 20, 925, 306]);
}

// 14. Moderation list.
{
  const s = slide('Moderación de todas las grabaciones', 'Fuentes: AdminPanel.js, admin/README.md, admin/schema.sql y artifacts/ppt-moderacion-actual.jpg. Captura actual del servidor: 20 pendientes, 110 aprobadas y 0 rechazadas. Consulta sin cambiar decisiones. Búsqueda, filtros y selección por página para decisiones individuales o por lote. Las nuevas contribuciones llegan pendientes. Rechazar conserva archivos y los excluye de aprobadas. No se usó voto público como aprobación automática.', 'Captura actual del administrador con los estados reales de las grabaciones');
  blocks(s, [['Pendientes de revisión', 'Las nuevas grabaciones esperan una decisión del administrador.'], ['Búsqueda y filtros', 'Se puede buscar por palabra o categoría y filtrar por estado.'], ['Decisiones por lote', 'La selección de una página permite revisar grupos de grabaciones.']]);
  await picture(s, 'ppt-moderacion-actual.jpg', R, [175, 20, 925, 696]);
}

// 15. Individual review.
{
  const s = slide('Aprobar o rechazar después de revisar', 'Fuentes: AdminPanel.js, admin/README.md y artifacts/ppt-revision-grabacion.jpg. Captura actual de una grabación real pendiente saludos/hola, registro 186. Vista previa pausada para el pantallazo. Solo se consultó el archivo, no se cambió la aprobación. Las funciones aplican comprobación de versión para decisiones concurrentes. Rechazar no elimina el original.', 'Captura actual de una grabación real pendiente de revisión');
  blocks(s, [['Vista previa del original', 'El administrador reproduce la secuencia completa y puede pausarla.'], ['Tres decisiones', 'Aprobar, rechazar o devolver la grabación a pendientes.'], ['Original conservado', 'La revisión cambia su estado y conserva el archivo para futuras comprobaciones.']]);
  await picture(s, 'ppt-revision-grabacion.jpg', R, [175, 0, 925, 422]);
}

// 16. Sources.
{
  const s = slide('Material de LSCh dentro del administrador', 'Fuentes: admin/README.md, training/README.md y artifacts/ppt-material-actual.jpg. Captura actual de referencias educativas. Se incorporaron ocho referencias educativas y un catálogo académico con metadatos de 379 videos. No son 379 clips revisados para entrenamiento ni permisos de uso concedidos. Referencias UMCE/Mineduc y Universidad de Valparaíso disponibles en el catálogo. No se afirma descarga del dataset del estudio.', 'Captura actual de las referencias educativas del catálogo privado');
  blocks(s, [['Referencias para investigar', 'Ocho recursos educativos y un catálogo académico de 379 videos.'], ['Búsqueda por tema o fuente', 'El panel permite localizar ejemplos y consultar quién los publicó.'], ['Revisión antes de entrenar', 'Cada fragmento necesita significado confirmado y permiso de uso.']]);
  await picture(s, 'ppt-material-actual.jpg', R, [240, 20, 800, 650]);
}

// 17. Priorities.
{
  const s = slide('Prioridades de las 531 entradas', 'Fuentes: training/README.md, admin/README.md y artifacts/ppt-entrenamiento-actual.jpg. Captura actual antes de analizar de nuevo. El conteo es de entradas de vocabulario por categoría, no 531 señas lingüísticamente distintas ni entrenadas. Modo independiente exige al menos 5 originales de aprendizaje y 2 de prueba por seña con participantes separados. Variaciones artificiales no se cuentan como originales. El análisis estricto no equivale al modo experimental de recuperación. Importación desde navegador sigue pendiente de una comprobación manual autorizada.', 'Captura actual del panel de entrenamiento en el modo de evaluación independiente');
  blocks(s, [['Cobertura visible', 'El panel organiza el vocabulario según muestras revisadas y calidad disponible.'], ['Muestras suficientes', 'El modo independiente reserva originales de personas distintas para la prueba.'], ['Material externo preparado', 'Existe un flujo para importar datos revisados. Tener enlaces no entrena el modelo.']]);
  await picture(s, 'ppt-entrenamiento-actual.jpg', R, [175, 18, 925, 685]);
}

// 18. Recovery.
{
  const s = slide('Recuperación de las 110 aprobadas', 'Fuentes: training/README.md, admin/README.md y artifacts/recuperacion-110-lista.png. Resultado real del 4 de octubre de 2026. 110 aprobadas procesadas y guardadas sin error, 44 con puntos de calidad técnica utilizable, 12 además con etiquetas compatibles/aprobadas y 2 clases con dos originales distintos. Calidad técnica no garantiza corrección lingüística. Se conservaron archivos y decisiones del servidor. La recuperación persiste en IndexedDB por navegador/origen.', 'Captura real de los resultados de recuperación de las grabaciones antiguas');
  blocks(s, [['110 archivos conservados', 'Se extrajeron nuevamente puntos de los fotogramas existentes.'], ['44 con calidad utilizable', 'La comprobación técnica permite aprovechar material para experimentos.'], ['Dos clases iniciales', 'Cerdo y día tienen dos originales distintos para un primer prototipo.']]);
  await picture(s, 'recuperacion-110-lista.png', R, [86, 25, 921, 710]);
}

// 19. Annotation.
{
  const s = slide('Revisión de etiquetas recuperadas', 'Fuentes: training/README.md y artifacts/ppt-revision-recuperacion.jpg. Captura actual del editor de revisión de la recuperación 166. Se abrió sin guardar cambios. Corrección exacta por entrada/categoría, confirmación explícita y código de participante solo si se sabe. La anotación es local y no modifica el original ni la decisión del servidor. Las grabaciones antiguas sin tiempos conservan orden, no se inventa su velocidad.', 'Captura actual del editor de revisión, sin cambiar la grabación');
  blocks(s, [['Seña exacta', 'El administrador comprueba si la etiqueta corresponde a toda la secuencia.'], ['Revisión confirmada', 'La revisión conserva una anotación local y mantiene intacto el original.'], ['Datos desconocidos visibles', 'Cuando faltan tiempos o identidad, la herramienta lo indica.']]);
  await picture(s, 'ppt-revision-recuperacion.jpg', R, [175, 190, 925, 380]);
}

// 20. Prototype.
{
  const s = slide('Primer prototipo entrenado y guardado', 'Fuentes: training/README.md, admin/README.md y artifacts/ppt-modelo-guardado.jpg. Informe histórico cargado desde IndexedDB y capturado el 4 de octubre. Modelo temporal Conv1D de 32 pasos y 171 características, 30 épocas con variaciones de originales solo en aprendizaje. Dos originales de aprendizaje totales y dos reservados totales, uno de cada etiqueta. Cerdo: 1/1; día: 0/1. 50% equivale a un acierto en dos tomas, no precisión general. Puede ser la misma persona. Se guardan modelo, etiquetas e informe por candidato, persisten al recargar. No activa reconocimiento público ni traductor continuo.', 'Informe real del modelo local guardado. Resultado interno sobre solo dos tomas.');
  blocks(s, [['Dos señas aisladas', 'Se entrenó un candidato para alimentos/cerdo y tiempo/día.'], ['Un acierto de dos pruebas', 'Cerdo acertó y día falló. El resultado interno fue 50% sobre dos tomas.'], ['Guardado del candidato', 'El administrador puede abrir el informe después de recargar el navegador.']]);
  await picture(s, 'ppt-modelo-guardado.jpg', R, [175, 80, 925, 600]);
}

// 21. Packaging and where.
{
  const s = slide('Archivos preparados para Cloudflare', 'Fuentes: admin/README.md, training/README.md, package.json, dist/index.html y DeafApp-sin-selector-personas.zip. ZIP actual de 18 entradas, index.html en raíz, biblioteca y modelos de seguimiento locales. Se excluyeron SQL, contraseñas, grabaciones privadas y diagnósticos. Preparar el ZIP no publica la interfaz. IndexedDB de localhost no se transfiere automáticamente al dominio oficial. App.js es fuente Expo, no una aplicación web exportada por sí sola.', 'Preparación local comprobada. La publicación de esta versión requiere subir el paquete completo.');
  text(s, 'Versión de la web', 64, 160, 520, 44, 30, C.cyan, true);
  text(s, 'dist contiene la aplicación compilada, sus recursos y los modelos de seguimiento.', 64, 213, 520, 123, 27);
  text(s, 'Paquete de publicación', 64, 367, 520, 44, 30, C.cyan, true);
  text(s, 'DeafApp-sin-selector-personas.zip\nIndex en la raíz y carpeta completa lista para cargar.', 64, 420, 530, 135, 26);
  text(s, 'Dónde están los cambios', 674, 160, 540, 44, 30, C.cyan, true);
  text(s, 'App.js y módulos de cámara y grabación contienen el flujo público.\n\nAdminPanel.js y training contienen revisión, recuperación y entrenamiento.', 674, 213, 540, 215, 27);
  text(s, 'Datos locales', 674, 468, 540, 44, 30, C.gold, true);
  text(s, 'Los borradores y modelos del navegador local no se copian al sitio oficial con el ZIP.', 674, 521, 540, 110, 24);
}

// 22. Honest status.
{
  const s = slide('Estado actual y próxima etapa', 'Fuentes: App.js, training/README.md, admin/README.md y conversación del proyecto. La meta del usuario es un traductor en tiempo real entre LSCh y oyentes mediante voz/texto, bidireccional. El estado implementado es captura, moderación, preparación y prototipo aislado privado. Falta comprobar con participantes distintos, gestos desconocidos y cámara real antes de habilitar reconocimiento público. Frases continuas y voz/texto hacia LSCh necesitan etapas adicionales. No se afirma que DeafApp sea la mejor o primera opción nacional.', 'El traductor completo sigue en desarrollo. Estas mejoras preparan su captura y entrenamiento.');
  text(s, 'Implementado', 64, 160, 340, 44, 32, C.cyan, true);
  text(s, 'Cámara y trazados.\n\nGrabación con revisión previa.\n\nAdministración y recuperación de datos.', 64, 226, 340, 310, 28);
  text(s, 'Experimental', 472, 160, 340, 44, 32, C.gold, true);
  text(s, 'Modelo privado de dos señas.\n\nEvaluación interna pequeña.\n\nFalta probar otras personas y la cámara en vivo.', 472, 226, 340, 330, 28);
  text(s, 'Objetivo siguiente', 880, 160, 340, 44, 32, C.coral, true);
  text(s, 'Más muestras revisadas.\n\nReconocer señas y frases con fiabilidad.\n\nConectar LSCh con voz y texto en tiempo real.', 880, 226, 340, 330, 28);
}

const candidate = path.join(build, 'candidate-v3.pptx');
const finalPath = path.join(root, 'entregables/DeafApp-mejoras-2026-10-04.pptx');
await fs.writeFile(path.join(build, 'sources.json'), JSON.stringify(notes, null, 2));
await (await PresentationFile.exportPptx(presentation)).save(candidate);
console.log(`CANDIDATE ${presentation.slides.items.length} slides`);
const result = await finalizePresentation({
  workspaceDir: root,
  candidatePath: candidate,
  finalPath,
  pythonExecutable: process.env.RUNTIME_PYTHON,
  integrityValidatorPath: path.join(skill, 'container_tools/inspect_presentation_package_integrity.py'),
  layoutValidatorPath: path.join(skill, 'container_tools/inspect_presentation_layout_geometry.py'),
  layoutArgs: ['--expected-slide-size-emu', '12192000,6858000', '--validate-bullet-geometry', '--validate-heading-fit'],
  requiredNativeTableOwnerSlides: [],
  fontPolicy: { basis: 'design', families: [font] },
  verifyArtifactToolImport: true,
  receiptPath: path.join(build, 'final-validation-v3.json'),
});
console.log(JSON.stringify(result));
const finalDeck = await PresentationFile.importPptx(await FileBlob.load(finalPath));
for (const [i, s] of finalDeck.slides.items.entries()) {
  const preview = await finalDeck.export({ slide: s, format: 'png', scale: 1 });
  await fs.writeFile(path.join(build, 'rendered', `slide-${String(i + 1).padStart(2, '0')}.png`), new Uint8Array(await preview.arrayBuffer()));
  const layout = await s.export({ format: 'layout' });
  await fs.writeFile(path.join(build, 'rendered', `slide-${String(i + 1).padStart(2, '0')}.layout.json`), await layout.text());
  console.log(`RENDERED ${i + 1}`);
}
console.log(`FINAL ${finalPath}`);
