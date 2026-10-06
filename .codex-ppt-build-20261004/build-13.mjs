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

// Slides 2 through 11. Helpers and cover come from the original local builder.
{
  const s=slide('Trazados de cara y manos en vivo', 'Fuentes: artifacts/manos-rapidas-verificacion.md, artifacts/manos-rapidas-camara-real.jpg, artifacts/manos-rapidas-verificacion.jpg. Izquierda: cámara física local. Derecha: interfaz real del diagnóstico con una imagen de prueba. Se corrigieron congelación/desfase y seguimiento por separado. Detector regional MediaPipe HandPose 3D lite con TensorFlow.js en Worker, 21 puntos por mano. En prueba tras preparar el modelo: adquisición 63 ms y siguientes inferencias 38–74 ms. Son tiempos de inferencia local, no latencia total ni garantía en todos los equipos. La carga inicial tuvo picos.', 'Cámara real y diagnóstico local. Los tiempos medidos excluyen la preparación inicial del modelo.');
  blocks(s,[['Seguimiento continuo','La cara y cada mano actualizan sus puntos sobre la imagen, sin dejar trazados congelados.'],['Manos más rápidas','La búsqueda guiada por la cara y el modelo reutilizado reducen la espera.'],['21 puntos por mano','Inferencias de 38 a 74 ms tras preparar el modelo en la prueba local.']]);
  await picture(s,'manos-rapidas-camara-real.jpg',{left:495,top:150,width:335,height:482},[251,64,600,450]);
  await picture(s,'manos-rapidas-verificacion.jpg',{left:850,top:150,width:366,height:482},[23,180,557,420]);
  text(s,'Cara en cámara real',500,532,325,42,23,C.cyan,true);
  text(s,'Manos en diagnóstico',856,532,356,42,23,C.cyan,true);
}
{
  const s=slide('Cámara automática y más estable', 'Fuentes: artifacts/camara-automatica-verificacion.md, camara-automatica-pc.jpg, camara-automatica-celular.jpg, App.js, tests/webCameraCompatibility.test.mjs, scripts/patch-expo-camera.cjs. Capturas reales del bundle con cámara simulada y subidas bloqueadas. Celular emulado, no prueba física. PC 4:3 máximo 600 px y móvil 9:16 máximo 450 px. Una ventana de PC estrecha permanece PC. Se corrigió referencia inexistente OverconstrainedError y se incluyeron alternativas de restricciones/reinicio. No garantía universal de hardware.', 'Prueba local con cámara simulada. El celular se comprobó con emulación del navegador.');
  text(s,'PC · 4:3',80,128,580,44,28,C.cyan,true);
  text(s,'Celular · 9:16',804,128,410,44,28,C.cyan,true);
  await picture(s,'camara-automatica-pc.jpg',{left:72,top:178,width:625,height:355},[324,54,626,482]);
  await picture(s,'camara-automatica-celular.jpg',{left:840,top:178,width:315,height:456});
  text(s,'Formato según el dispositivo. Se corrigieron fallos de inicio y se añadió Reiniciar cámara para recuperar la conexión.',80,552,665,97,24);
}
{
  const s=slide('Grabación con una o dos manos', 'Fuentes: App.js, recordingHandGuard.js, trainingCapture.js, artifacts/grabacion-una-mano.png y artifacts/ayuda-deteccion-manos.png. Captura histórica de la cámara real durante la preparación. Preparar grabación arma la espera, confirmación inicial de ambas manos, cuenta atrás y captura posterior permitida con al menos una mano detectada. Se controla pérdida/antigüedad de puntos y preparación se puede cancelar. Se incorporaron mensajes contextuales para encuadre, luz y primeras secuencias. La captura no demuestra una seña completa.', 'Captura real del flujo de preparación. Confirmar ambas manos una vez permite grabar después con una.');
  blocks(s,[['Preparar y colocarse','Pulsas el botón primero. La confirmación de ambas manos inicia la cuenta atrás.'],['Una mano también sirve','Después puedes hacer la seña con una o dos manos trazadas. Se puede cancelar.'],['Ayuda contextual','Los mensajes sugieren separar las manos, mejorar la luz y volver a mostrarlas.']]);
  await picture(s,'grabacion-una-mano.png',R,[215,17,675,745]);
}
{
  const s=slide('Filtro del dedo medio levantado', 'Fuentes: artifacts/filtro-gestos-verificacion.md, artifacts/filtro-gestos-app.jpg y gestureModeration.js. Captura real del bundle con entrada simulada basada en la imagen del usuario y subidas bloqueadas. Configuración concreta con 21 puntos, persistencia mínima de 3 detecciones y 250 ms. Puede fallar al confundir dedos. No clasifica intención obscena general. El bloqueo se comprueba durante la preparación y captura completa, con liberación por detecciones limpias. Otros gestos requieren ejemplos y revisión LSCh.', 'Captura de la interfaz durante una prueba controlada del filtro');
  blocks(s,[['Aviso sobre el gesto','La pantalla muestra el motivo cuando detecta el dedo medio levantado.'],['Grabación bloqueada','El filtro impide preparar o completar una toma que contiene ese gesto.'],['Alcance definido','Otros gestos requieren ejemplos y revisión para proteger las señas válidas.']]);
  await picture(s,'filtro-gestos-app.jpg',R,[330,310,620,407]);
}
{
  const s=slide('Revisión, guardado y envío de la toma', 'Fuentes: artifacts/vista-previa-verificacion.md, artifacts/vista-previa-reintento.jpg, recordingDraftStore.js, recordingSubmission.js y App.js. Captura real de la interfaz con cámara, detector y servidor simulados. Figura dibujada de prueba, no una seña real de entrenamiento. Secuencia de 30 fotogramas, proporción original, cerrar cámara al revisar. IndexedDB conserva una toma pendiente por origen/navegador. Repetir no borra la anterior hasta otra válida. Envío explícito, ruta única, consultar registro existente, reutilizar archivo, limpieza solo después de completar, tiempo límite 30 s y Web Locks compatibles. No se subieron grabaciones reales en esta prueba.', 'Captura de la interfaz real con una toma y un fallo de conexión simulados para comprobar el flujo');
  blocks(s,[['Revisar antes de enviar','Puedes reproducir, pausar o repetir la secuencia. El envío comienza al elegirlo.'],['Guardar para después','La toma pendiente se recupera al volver a abrir la misma web en ese navegador.'],['Reintentos sin duplicar','Si falla la conexión, la toma se conserva y la subida comprueba los pasos previos.']]);
  await picture(s,'vista-previa-reintento.jpg',R,[324,0,628,717]);
}
{
  const s=slide('Interfaz pública y administrador privado', 'Fuentes: App.js, AdminPanel.js, RecordingProfiles.js, recordingSource.js, training/datasetPreparation.js, admin/README.md, artifacts/ppt-acceso-admin.jpg y artifacts/grabacion-sin-personas.png. Capturas de los controles y login actuales. La cámara negra de la captura de controles se excluye porque no se probó físicamente esa sesión. Se retiró el selector Persona 1/2 y visualizador técnico público. El origen anónimo local automático no demuestra personas distintas. El catálogo, diagnósticos y entrenamiento están en admin. Cinco pulsaciones al logo y contraseña validada en servidor, sesión temporal y límite de intentos. No se muestra contraseña. El bucket antiguo de imágenes mantiene sus permisos previos.', 'Capturas actuales del acceso privado y los controles de grabación sin selector de personas');
  blocks(s,[['Menos pasos al participar','Se retiraron Persona 1 o 2 y el visualizador técnico del menú público.'],['Cinco pulsaciones al logo','El administrador se abre con contraseña validada en el servidor.'],['Pruebas en el panel privado','Material, diagnóstico y entrenamiento se concentran en administración.']]);
  await picture(s,'ppt-acceso-admin.jpg',{left:495,top:136,width:721,height:237},[177,20,925,306]);
  await picture(s,'grabacion-sin-personas.png',{left:495,top:390,width:721,height:246},[210,525,690,355]);
}
{
  const s=slide('Moderación de todas las grabaciones', 'Fuentes: AdminPanel.js, admin/README.md, artifacts/ppt-moderacion-actual.jpg y artifacts/ppt-revision-grabacion.jpg. Capturas actuales con 20 pendientes, 110 aprobadas, 0 rechazadas. Grabación real pendiente saludos/hola #186 en vista previa pausada. No se cambiaron decisiones. Nuevas contribuciones pendientes, reproducción, decisiones individuales o por lote, búsquedas, filtros y páginas de 25. Comprobación de versión concurrente. Rechazar conserva el archivo y lo excluye de aprobadas. No aprobación automática por votos públicos.', 'Capturas actuales del listado y de la revisión de una grabación real, sin cambiar sus decisiones');
  blocks(s,[['Estados claros','Cada toma queda pendiente, aprobada o rechazada según la revisión.'],['Vista previa del original','El administrador reproduce la secuencia antes de aprobarla o rechazarla.'],['Búsqueda y lotes','Filtros por estado, búsqueda por categoría y decisiones para grupos.']]);
  await picture(s,'ppt-moderacion-actual.jpg',{left:495,top:136,width:721,height:240},[175,20,925,452]);
  await picture(s,'ppt-revision-grabacion.jpg',{left:495,top:393,width:721,height:251},[175,0,925,422]);
}
{
  const s=slide('Material de LSCh para preparar ejemplos', 'Fuentes: admin/README.md, training/README.md y artifacts/ppt-material-actual.jpg. Catálogo privado de ocho referencias educativas y metadatos académicos de 379 videos. Incluye referencias UMCE/Mineduc y Universidad de Valparaíso. No se afirma descarga ni autorización del dataset del estudio. Los enlaces son candidatos, no clips revisados automáticamente ni muestras suficientes para entrenar. Cada fragmento requiere revisión lingüística y permiso.', 'Captura actual de las referencias educativas del catálogo privado');
  blocks(s,[['Referencias confiables','Ocho recursos educativos y un catálogo académico de 379 videos.'],['Búsqueda por tema o fuente','El panel ayuda a localizar ejemplos y consultar quién los publicó.'],['Revisión antes de entrenar','Cada fragmento necesita significado confirmado y permiso de uso.']]);
  await picture(s,'ppt-material-actual.jpg',R,[240,20,800,650]);
}
{
  const s=slide('Preparación y recuperación de datos', 'Fuentes: training/README.md, admin/README.md y artifacts/recuperacion-110-lista.png. 531 entradas por categoría, no 531 señas únicas ni entrenadas. Se incorporó auditoría, prioridades e importación de conjuntos revisados. La recuperación real del 4 de octubre procesó 110 aprobadas y guardó 110 resultados sin errores; 44 técnicamente utilizables y 12 además con etiquetas compatibles/aprobadas. Dos clases con dos originales distintos: alimentos/cerdo y tiempo/dia. Calidad de puntos no confirma corrección lingüística. Se conservan originales y aprobaciones. Caché local por navegador/origen y reanudación sin procesar otra vez 110 resultados vigentes. Tiempos e identidad desconocidos no se inventan.', 'Captura real de la recuperación de las 110 grabaciones aprobadas');
  blocks(s,[['531 entradas organizadas','Las prioridades indican qué categorías requieren revisión y nuevas muestras.'],['110 aprobadas recuperadas','Se extrajeron puntos de los archivos antiguos y se conservaron sus originales.'],['44 con puntos utilizables','Cerdo y día reúnen dos originales distintos para el experimento inicial.']]);
  await picture(s,'recuperacion-110-lista.png',R,[86,25,921,710]);
}
{
  const s=slide('Revisión y primer entrenamiento', 'Fuentes: training/README.md, admin/README.md, artifacts/ppt-revision-recuperacion.jpg y artifacts/ppt-modelo-guardado.jpg. Editor local de etiqueta exacta/participante solo conocido, confirmación explícita; no se guardaron cambios para esta captura. Modo independiente mínimo 5 originales aprendizaje y 2 prueba por clase con personas separadas; transformaciones artificiales no se cuentan como originales. Modo experimental: Conv1D temporal 32 pasos x 171 características, 30 épocas con variaciones solo de datos de aprendizaje. Cerdo/día, 2 originales aprendizaje totales y 2 reservados totales. Cerdo 1/1, día 0/1, total 1/2 (50%). Podrían ser la misma persona. Modelo, etiquetas e informe persistidos y recuperados tras recargar. No activa reconocimiento público ni traductor continuo. Requiere gestos desconocidos, otras personas y cámara real.', 'Capturas reales de la revisión local y del informe guardado. El prototipo acertó 1 de solo 2 pruebas.');
  blocks(s,[['Revisión de las etiquetas','La seña exacta se confirma antes de guardar su anotación local.'],['Evaluación independiente','Se reservan originales de personas distintas. Las variaciones no crean participantes.'],['Prototipo de dos señas','Cerdo acertó y día falló. El modelo y su informe persisten en el navegador.']]);
  await picture(s,'ppt-revision-recuperacion.jpg',{left:495,top:146,width:721,height:224},[175,190,925,380]);
  await picture(s,'ppt-modelo-guardado.jpg',{left:495,top:401,width:721,height:232},[175,327,925,250]);
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


const candidate=path.join(build,'candidate-13.pptx');
const finalPath=path.join(root,'entregables/DeafApp-mejoras-13-diapositivas.pptx');
await (await PresentationFile.exportPptx(presentation)).save(candidate);
const result=await finalizePresentation({
  workspaceDir:root,candidatePath:candidate,finalPath,
  explicitTotalSlideCount:13,
  pythonExecutable:process.env.RUNTIME_PYTHON,
  integrityValidatorPath:path.join(skill,'container_tools/inspect_presentation_package_integrity.py'),
  layoutValidatorPath:path.join(skill,'container_tools/inspect_presentation_layout_geometry.py'),
  layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-bullet-geometry','--validate-heading-fit'],
  requiredNativeTableOwnerSlides:[],fontPolicy:{basis:'design',families:[font]},
  verifyArtifactToolImport:true,receiptPath:path.join(build,'final-validation-13.json')
});
console.log('FINAL '+result.finalPath);
const finalDeck=await PresentationFile.importPptx(await FileBlob.load(finalPath));
const review=path.join(build,'review-13');await fs.mkdir(review,{recursive:true});
for(const [index,s] of finalDeck.slides.items.entries()){
  const preview=await finalDeck.export({slide:s,format:'png',scale:2});
  await sharp(new Uint8Array(await preview.arrayBuffer())).resize(1280,720).png().toFile(path.join(review,'slide-'+String(index+1).padStart(2,'0')+'.png'));
  console.log('REVIEW '+(index+1));
}
