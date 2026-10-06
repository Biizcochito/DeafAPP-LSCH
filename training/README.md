# Preparación y entrenamiento de reconocimiento LSCh

Este trabajo permite reunir, auditar, preparar datos y entrenar candidatos de reconocimiento de señas aisladas desde el administrador. Hay un primer prototipo experimental de dos etiquetas, entrenado con grabaciones antiguas recuperadas. No está validado para otras personas ni activa un traductor continuo. Tener enlaces a videos o muchas repeticiones de una sola persona no demuestra reconocimiento con otras personas.

## Qué hay en la web

- «Material de LSCh» dentro del administrador: ocho referencias educativas y un catálogo académico de 379 videos, ocho fuentes y 94,8 horas catalogadas. Incluye el diccionario Mineduc/UMCE y un estudio de la Universidad de Valparaíso; no se descargó ni se autorizó su conjunto de videos. Tiene búsqueda por título o fuente. Los enlaces son candidatos, no fragmentos etiquetados ni permisos de entrenamiento. Se accede pulsando cinco veces seguidas el logo de DeafApp e ingresando la contraseña configurada en Supabase.
- «Entrenamiento LSCh»: analiza las aprobaciones actuales, ordena las 531 entradas por disponibilidad de datos y permite importar un conjunto externo ya preparado. Entrena únicamente grupos que cumplen la separación de participantes y los mínimos de muestras originales. El catálogo no se transforma automáticamente en ejemplos revisados.
- «Datos y diagnóstico», también dentro del administrador: conexión, auditoría guardada y búsqueda de las 531 entradas del vocabulario. Las decisiones de aprobar/rechazar se hacen únicamente desde «Grabaciones» en ese panel; las nuevas contribuciones llegan pendientes.
- La pantalla de grabación ya no pide «Persona 1, Persona 2…». Guarda automáticamente un código anónimo de origen local y reutiliza el código seleccionado de una instalación antigua. Ese código no identifica una persona ni demuestra que dos navegadores pertenezcan a personas diferentes. Si falla el almacenamiento, se puede seguir grabando con un código temporal.
- Los nuevos archivos enviados conservan los campos antiguos y añaden `schemaVersion`, `recordingId`, idioma `csg`, intervalo real, proporción y `training`: participante, sesión, tiempos de captura y puntos de cara/manos.
- Los puntos son una copia del resultado disponible al pedir cada foto. Se guarda su antigüedad y el intervalo hasta completar la foto; no se presentan como detecciones perfectamente sincronizadas. Se conservan las imágenes para poder volver a procesarlas.

Los perfiles antiguos son declaraciones del usuario, no identificación biométrica. Las nuevas capturas se marcan `anonymous-local-source`: sirven para revisión y recuperación experimental, pero el preparador independiente las deja pendientes de confirmar quién las hizo. El código automático nunca cuenta como una persona nueva. Si una misma persona graba desde varios dispositivos, hay que unir sus códigos antes de evaluar con personas distintas. Las imágenes originales, puntos y datos locales de origen no se incluyen en el paquete público de Cloudflare.

## Archivos y comandos

Ejecutar desde la carpeta del proyecto:

```text
npm run sources:import
npm run dataset:sync
npm run dataset:import-clips
npm run dataset:prepare
```

`npm run dataset:refresh` ejecuta los cuatro pasos y luego `admin:snapshot`; se detiene si alguno falla. Los dos primeros necesitan conexión. Esta es automatización local al ejecutar el comando, no un servicio que aprende continuamente en Cloudflare. Genera `admin/update-snapshot.sql` y `admin/update-catalog.sql` para actualizar el informe privado desde el editor SQL del proyecto DeafApp. No sube datos personales ni ejecuta cambios en Supabase por su cuenta.

- `sources:import`: descarga solo metadatos del repositorio académico TUB/DFKI, con revisión fija `10a99529c9d3e0cb4b356897f39fb54b94ff0fbf`, huellas SHA-256 y licencia MIT del catálogo. Filtra únicamente LSCh. Guarda los originales en `training/sources/tub` y una copia en `admin/catalog-snapshot.json`. La web obtiene el catálogo mediante una sesión de administrador; no se exporta como JSON público. No descarga videos ni atribuye a los videos la licencia MIT de los metadatos.
- `dataset:sync`: lee registros aprobados y descarga copias locales desde el almacenamiento existente. No modifica Supabase. Cuando el archivo antiguo omite categoría, usa la del registro aprobado y conserva además el contenido original. Una contradicción de etiqueta o categoría se excluye. Un manifiesto permite distinguir la última lista de aprobaciones de copias antiguas.
- `dataset:import-clips`: incorpora fragmentos externos locales ya revisados y preparados. Exige idioma LSCh, persona identificada mediante un código, revisión lingüística y autorización de entrenamiento con evidencia. No recorta ni interpreta automáticamente los videos del catálogo.
- `dataset:prepare`: comprueba etiquetas, imágenes, tiempos y puntos recientes; elimina duplicados; separa participantes; genera representaciones de movimiento y cinco versiones por grabación de entrenamiento. Guarda resultados y motivos de exclusión en `training/prepared`.

## Entrenar desde el administrador

1. Entrar al administrador y abrir **Entrenamiento LSCh**. Pulsar **Analizar grabaciones aprobadas**. El análisis usa las aprobaciones actuales de Supabase y mantiene las imágenes y los puntos preparados en memoria del navegador. No cambia ninguna decisión.
2. Para fragmentos externos, completar primero la revisión y preparación descritas más abajo. Ejecutar `dataset:prepare` e importar **`training/prepared/dataset.json`** en el mismo panel. El archivo no se sube a un servicio. `training/prepared/training-plan.json` contiene también las prioridades de las 531 entradas.
3. El primer experimento exige por seña **5 originales de aprendizaje y 2 originales de prueba**, de personas separadas entre aprendizaje y prueba. Este mínimo permite intentar un experimento; no garantiza precisión. Las variaciones artificiales no aumentan estos conteos. Hay que tener al menos dos señas listas: una única clase no permite medir la distinción entre señas.
4. Se seleccionan las primeras señas aptas, hasta 12 por grupo. Se pueden cambiar mediante las casillas de las entradas listas para avanzar a otros grupos del vocabulario. Pulsar **Entrenar primeras señas disponibles** inicia el aprendizaje local en el navegador. Se puede cancelar.
5. Se informa el resultado por seña con las personas reservadas para prueba. Se guarda un candidato por grupo en IndexedDB del mismo navegador, con sus etiquetas, representación de entrada e informe. Reentrenar el mismo grupo reemplaza su candidato anterior; otros grupos se conservan. No se publica ni se conecta automáticamente a la cámara del traductor.

El entrenador (`training/modelTraining.js`) usa TensorFlow.js 4.22.0 y una red temporal Conv1D: recibe 32 pasos de 171 valores de manos/cara, aprende durante 30 pasadas y devuelve probabilidades sobre las clases seleccionadas. Los videos no se memorizan como respuestas: sus patrones de movimiento se usan para ajustar los pesos. Las personas de prueba no intervienen en el ajuste, la selección de pasadas ni la creación de aumentos. Se comprueban las versiones de aprobación antes y después del aprendizaje; una aprobación revocada o cambiada impide guardar el candidato.

Se debe revisar que los códigos correspondan a personas realmente distintas, evaluar gestos desconocidos y verificar la cámara antes de habilitar reconocimiento público. Los candidatos entrenados por separado tampoco constituyen por sí solos un único clasificador de 531 señas: habrá que integrar y evaluar los grupos antes de ese despliegue. La traducción de frases continuas y la salida de voz/texto hacia LSCh son etapas adicionales.

El análisis del **4 de octubre de 2026** examinó 110 aprobadas y encontró **0 aptas, 0 señas listas y 531 entradas pendientes**. Los registros antiguos se conservan. Requieren recuperar puntos y tiempos, comprobar quién los grabó y revisar las etiquetas/formato; no se inventaron esos datos para habilitar el botón.

## Cómo aprovechar a tu amigo

### Recuperar los archivos antiguos y experimentar

Desde **Administrador → Entrenamiento LSCh → Recuperar grabaciones antiguas**, pulsar **Recuperar todas las aprobadas**. El panel procesa las imágenes JPEG/PNG/WebP del almacenamiento existente con los detectores locales de cara y manos. Aísla el seguimiento al cambiar de grabación y no reutiliza puntos de un fotograma que no produjo detección. No cambia las imágenes, etiquetas ni decisiones del servidor.

La recuperación guarda puntos y resultados por archivo en IndexedDB de ese navegador. No guarda contraseñas, tokens ni copias adicionales de las imágenes. Puede cancelarse y reanudarse; las secuencias completas con la misma versión de aprobación se reutilizan. Al cambiar de navegador o del dominio local al oficial hay que ejecutar nuevamente la recuperación. Si cambia la aprobación o la etiqueta de origen, el resultado anterior no se incorpora hasta actualizarlo.

**Ver secuencia** reproduce los originales para revisarlos. **Revisar recuperación** permite asignar una seña exacta del vocabulario y un código de participante, únicamente si se conoce. La confirmación explícita conserva esa anotación local; no sobrescribe el archivo ni su aprobación. Las etiquetas originales que ya coinciden exactamente con una aprobación vigente conservan esa revisión. Las que no coinciden quedan pendientes; un video con varias señas debe recortarse y revisarse antes de atribuirlo a una sola.

Las 110 copias auditadas no contienen `intervalMs` ni tiempos por fotograma. Se recupera su **orden**, no su velocidad real. La representación experimental registra este límite y la orientación original sin confirmar; no se fabrica el esquema de una captura nueva ni una identidad por archivo. La recuperación considera utilizable para experimentar una secuencia con al menos 12 anclas faciales válidas, cara en al menos el 80% de las imágenes y manos en al menos el 50%; esto comprueba disponibilidad de puntos, no corrección lingüística.

**Preparar prototipo experimental** se habilita con al menos dos señas que tengan dos originales distintos y utilizables cada una. Se reserva un original por seña para una prueba interna y se aprende con el resto; las copias idénticas no aumentan el conteo. Puede usarse material de una sola persona o de identidad desconocida, declarado como tal. La evaluación no se presenta como prueba con personas independientes. Se seleccionan grupos de dos o tres señas y se entrenan desde **Entrenar prototipo experimental**. Los modelos se guardan por modo y grupo, separados de los candidatos de evaluación independiente.

Los mínimos 5+2 y la separación de personas siguen vigentes en el modo de evaluación independiente. El modo experimental permite recuperar utilidad de las grabaciones antiguas y probar aprendizaje con pocas muestras. No activa automáticamente el traductor público.

### Resultado comprobado de la recuperación del 4 de octubre

- 110 aprobadas procesadas y guardadas localmente; 0 errores de archivo o procesamiento.
- 44 secuencias cumplen el criterio técnico de puntos utilizables para el experimento.
- 12 tienen además una etiqueta exacta compatible con el vocabulario y una aprobación vigente. Las otras secuencias requieren revisión de etiqueta o de encuadre.
- Dos clases tienen dos originales útiles y distintos cada una: `alimentos/cerdo` y `tiempo/dia`.
- Se entrenó un candidato con un original por clase y sus variaciones. Los otros dos originales se reservaron para prueba. Acertó 1 de 2: `cerdo` 1/1 y `dia` 0/1. Este resultado de dos pruebas no estima precisión general ni demuestra corrección de todas las etiquetas históricas.

La recuperación y el modelo sobrevivieron a una recarga. Reanudar reutilizó los 110 resultados, sin volver a procesar imágenes. **Ver modelos guardados en este navegador** permite cargar sus informes anteriores después de iniciar sesión; es información histórica y no activa reconocimiento. Se verificó reproducción del original y la revisión exige confirmar la seña antes de guardar. No se modificó ninguna aprobación ni archivo del servidor.

Usar siempre su mismo perfil. Grabar varias repeticiones de las primeras señas con variación natural de velocidad, encuadre y luz, sin ocultar las manos. Cada nueva grabación conserva el proceso actual de confirmación inicial, cuenta regresiva, grabación con una o dos manos, vista previa y envío para revisión.

Las versiones artificiales consisten en el original, dos variaciones temporales y dos pequeñas inclinaciones del encuadre. Conservan participante y grabación de origen. No simulan nuevos tamaños anatómicos de mano, nueva iluminación o personas nuevas. La normalización reduce cambios de distancia/posición manteniendo la ubicación de las manos respecto de la cara. No incluye torso ni sustituye las imágenes originales.

Si solo hay una persona, los datos pueden servir para desarrollar un prototipo personal. En el modo experimental se separan primero grabaciones originales y se crean aumentos solo en aprendizaje. En evaluación independiente se separan participantes antes de crear aumentos. El informe siempre indica si falta evaluar con otras personas reales.

## Incorporar personas de material externo

1. Localizar una seña exacta en un recurso de LSCh y revisar significado, variante e intervalo con alguien competente en LSCh. Los subtítulos del discurso español no se asumen equivalentes a la seña.
2. Comprobar que la licencia o autorización permite el uso de entrenamiento previsto y registrar su evidencia. «CC» en el catálogo por sí solo no identifica todas las condiciones.
3. Preparar un fragmento local con imágenes JPEG y detecciones de cara/manos en el esquema `trainingCapture.js`. Actualmente este paso de extracción de videos externos y la revisión lingüística siguen pendientes; el importador trabaja sobre detecciones ya preparadas.
4. Añadir la anotación a `training/reviewed-clips.json`, y ejecutar `dataset:import-clips` y `dataset:prepare`.

Cada entrada de `reviewed-clips.json` necesita:

```json
{
  "language": "csg",
  "category": "saludos",
  "label": "hola",
  "sourceUrl": "https://fuente-original.example/video",
  "framesFile": "fragmento-hola.json",
  "startSeconds": 10,
  "endSeconds": 13,
  "participantId": "persona-publica-01",
  "sourceSessionId": "video-original-01",
  "approved": true,
  "reviewer": "codigo-del-revisor",
  "reviewedAt": "2026-10-03",
  "trainingAllowed": true,
  "license": "licencia-o-autorizacion-comprobada",
  "evidenceUrl": "https://fuente-original.example/condiciones"
}
```

Estas URLs son ejemplos de formato, no fuentes reales. El archivo debe estar dentro de `training/clips` y contener `frames` (JPEG en base64), `samples` (estructura validada por `isTrackingSample`), `frameSize`, `jpegQuality` e `intervalMs`. `training/reviewed-clips.json` empieza vacío: no se inventaron aprobaciones ni fragmentos.

Para unir perfiles de la misma persona de distintos dispositivos, crear `training/participant-aliases.json` con un objeto del tipo `{"perfil-dispositivo-2":"perfil-dispositivo-1"}`. La agrupación se aplica antes de separar entrenamiento/evaluación.

## Auditoría inicial del 3 de octubre de 2026

Se recuperaron 110 registros aprobados: 34 en formato con categoría y 76 archivos antiguos cuya categoría se tomó del registro aprobado. No hubo escrituras en el servidor. La preparación dejó las 110 copias fuera del entrenamiento automático por metadatos insuficientes y, en algunos casos, etiquetas/formato que requieren revisión. Se conservan completas en `training/recordings` para recuperar datos útiles mediante preparación posterior.

Los motivos pueden coincidir en una misma grabación: 110 carecen del nuevo esquema de captura; 84 tienen una etiqueta/categoría fuera del vocabulario actual y 34 no cumplen el formato JPEG que espera este preparador. Esto no declara incorrectas sus señas: impide incorporarlas automáticamente sin revisar y convertir su formato.

El vocabulario actual tiene 531 entradas por categoría. Se mantienen separadas: por ejemplo, `familia/papa` y `frutas_verduras/papa` no se fusionan. El informe `training/prepared/coverage.csv` permite ver qué entradas requieren muestras. Este conteo no implica 531 señas lingüísticamente diferentes.

## Comprobación y publicación

Pasaron 21 pruebas de preparación/captura/envío y 29 pruebas existentes de los requisitos de manos, moderación, tamaño de cámara y compatibilidad web. En el navegador se verificaron catálogo y búsqueda, y con cámara/servidor simulados se comprobó que una secuencia de 30 fotos conserva participante, idioma y observaciones tras un fallo de envío, una recarga y el reintento. La exportación final abrió el catálogo sin errores de consola. No se midió exactitud de reconocimiento de señas ni se probó una cámara física de celular en esta etapa.

La web exportada está en `dist`. La versión actual con recuperación se entrega como `DeafApp-recuperacion.zip`, `DeafApp-entrenamiento.zip` y `DeafApp-cloudflare.zip`, con `index.html` en la raíz. Para publicar, subir uno de esos ZIP actualizados o la carpeta `dist` completa al proyecto existente de Cloudflare. No subir `App.js` suelto, archivos SQL, la carpeta `admin` ni la carpeta `training`. Preparar estos archivos no cambia por sí solo la web oficial. La instalación del administrador y sus verificaciones se documentan en `admin/README.md`.

`npm run test:model-training` comprueba ajuste real de pesos, evaluación separada, guardado/carga del modelo y sus etiquetas, rechazo de datos inválidos, cambios de aprobación, cancelación y liberación de memoria. Los ejemplos del test son sintéticos y verifican el software; no son muestras LSCh ni evidencia de precisión lingüística. En esta actualización pasaron 25 pruebas del entrenador, preparación, catálogo y acceso administrativo.

En la etapa anterior se comprobó el acceso privado, el análisis de 110 aprobadas con el esquema nuevo, los motivos de preparación de «Hola», el entrenamiento independiente deshabilitado con datos insuficientes y las ocho referencias educativas. No hubo errores de consola ni decisiones modificadas. La prueba de seleccionar `dataset.json` desde la interfaz quedó bloqueada por el permiso de carga de archivos del navegador y no se intentó un método alternativo para sortearlo; ese paso sigue pendiente de comprobación manual. La recuperación nueva no necesita seleccionar archivos: procesa las aprobaciones desde su origen existente.

En esta etapa pasaron 61 pruebas del entrenador, preparación, recuperación, acceso, cámara y seguimiento; después de añadir el control de fallos de inicialización se volvieron a comprobar 32 pruebas afectadas, incluidas las nuevas. Los ensayos automáticos de ajuste usan puntos sintéticos exclusivamente para comprobar software. La prueba interna descrita arriba usó las grabaciones reales recuperadas. No se probó reconocimiento con cámara en vivo ni se repitió el entrenamiento buscando mejorar el resultado de las mismas dos tomas reservadas.

## Próxima etapa necesaria

La actualización que quita el selector de personas pasó 50 pruebas de captura, origen automático, preparación, envío y entrenamiento. Se comprobó en la exportación local que «Preparar grabación» está habilitado sin elegir perfil y que no aparece el selector, sin errores de consola. No se envió ninguna grabación durante esta comprobación. `DeafApp-sin-selector-personas.zip` y los tres ZIP actuales de publicación contienen la exportación actualizada; las grabaciones y los modelos locales no se incluyen.

Revisar las etiquetas pendientes, reunir tomas adicionales de las primeras clases y evaluar con personas independientes. El primer entrenamiento experimental ya se ejecutó; falta ampliar y validar los datos para un reconocimiento fiable. La traducción continua y la salida en LSCh desde voz/texto necesitarán trabajo adicional. Ninguna exactitud de traducción se afirma en esta actualización.
