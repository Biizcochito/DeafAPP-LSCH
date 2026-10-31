# Vocabulario controlado y composición en vivo

En Administración → **Habilitar señas** se publica el catálogo para recibir grabaciones. Cada categoría permite habilitar todas sus señas u ocultarlas con un botón; también se pueden gestionar señas individuales y crear nuevas. No exige grabaciones previas. [Guía de uso](HABILITAR-SENAS.md).

El catálogo histórico contiene 542 entradas. La migración conserva las 33 entradas iniciales y agrega las otras 509 en recopilación. Los homónimos de categorías distintas conservan sus significados. Las opciones descritas a continuación están en **Opciones de reconocimiento y entrenamiento**, aparte de la publicación en Grabar.

## Recopilar y habilitar

1. Para recibir grabaciones, usa **Habilitar señas** y habilita la categoría o la seña. El catálogo web se actualiza automáticamente, aunque su reconocimiento esté pausado o no tenga muestras. Ocultarla no elimina los aportes ni cambia el estado del reconocedor.
2. Aprueba las grabaciones desde la sección habitual. El servidor extrae puntos normalizados de manos y comprueba seguimiento, duración, movimiento, idioma, revisión y conservación. Un archivo aprobado sin puntos aptos no habilita una seña.
3. La ficha muestra originales distintos, personas confirmadas, exclusiones y pruebas reservadas. El objetivo inicial de **50 originales de 10 personas** orienta la recopilación; no es una cantidad que garantice precisión.
4. Usa códigos anónimos como P01. Confirma una persona solamente cuando puedas verificar quién aportó la toma. Un dispositivo o sesión no cuenta como persona distinta. Al reservar una persona confirmada para prueba, sus tomas confirmadas quedan fuera del aprendizaje de todas las clases. También se excluyen copias, hashes contradictorios y reservas.
5. Pasa a **En evaluación** y abre **Probar frases y cámara en privado**. La prueba no habilita reconocimiento público. Usa movimientos nuevos y personas diferentes.
6. **Habilitada** requiere al menos tres originales aptos y aceptación explícita del alcance de prototipo. La opción de evaluación independiente exige personas confirmadas separadas, tres personas de aprendizaje, dos de prueba, cinco pruebas reservadas y precisión/recall de al menos 0,8. Ese umbral describe este ensayo, no garantiza generalización. Una clase que pierde sus datos mínimos deja de estar activa aunque su estado administrativo siga habilitado.

Los alias son decisiones manuales para variantes del mismo significado. No se agrupan por similitud de texto entre categorías. La revisión usa versiones para impedir sobreescribir decisiones concurrentes.

## Texto y voz

El modo **Frases** está en `/interpretar`, en la prueba privada y en Entrenamiento. Añade únicamente predicciones confirmadas. Una pausa con las manos visibles cierra el borrador y lo lee en español. **Seña por seña** conserva la lectura individual inmediata tras confirmar el movimiento.

El sujeto predeterminado es el expresado con señas. El usuario puede elegir un contexto explícito; los verbos conocidos o sus formas revisadas se conjugan en presente. No se infieren sujetos, negación, palabras desconocidas ni tiempos verbales. Una oración completa aprendida sustituye sus etiquetas solapadas. Las dudas o pérdidas de seguimiento detienen la lectura automática; **Guardar para revisar**, **Deshacer última** y **Borrar borrador** permiten corregir. Borrar, cambiar de modo/modelo, ocultar la pestaña o apagar la cámara cancela el trabajo pendiente. El historial queda solo en memoria.

Esto es **composición de vocabulario reconocido**, no traducción libre de LSCh. El modelo actual describe movimiento y forma de manos; no incorpora un modelo lingüístico de LSCh, expresiones no manuales ni reconocimiento general del abecedario estático. Las pruebas sintéticas validan el programa, no la exactitud lingüística.

## Preparación y despliegue

Aplicar en orden las migraciones `20261030010000_controlled_recognition.sql`, `20261030010100_restore_recognition_catalogue.sql` y `20261030010200_recognition_recovery.sql`; desplegar con `npx supabase functions deploy recognition-runtime --project-ref didlffnluqqurelgnqdp --no-verify-jwt --use-api`. La función permite despertar la cola sin JWT, pero sus entradas, escrituras y resultados se controlan por RPC privadas que solo puede ejecutar `service_role`. La administración exige la sesión existente y las tablas internas tienen RLS sin acceso directo anónimo. La URL de la cola en la primera migración corresponde a ese proyecto; debe adaptarse al instalar en otro.

Las aprobaciones, asignaciones y cambios del catálogo invalidan el modelo y despiertan la preparación por lotes (16 extracciones, cuatro descargas simultáneas, cinco pruebas reservadas por lote). `pg_net` continúa la cola; un trabajo privado de `pg_cron` comprueba cada cinco minutos si debe recuperar una ejecución interrumpida. No descarga ni ejecuta el modelo cuando no hay trabajo pendiente.

Se guardan puntos derivados, versiones, caducidad y hashes, sin imágenes adicionales ni identidad facial. El paquete público comprimido contiene hasta diez referencias diversas por clase y referencias negativas; solo las clases habilitadas con datos mínimos producen respuestas aceptadas. La búsqueda por cotas conserva exactamente los tres primeros resultados y los mismos umbrales de abstención del clasificador DTW.

El navegador consulta una revisión pequeña y descarga un solo paquete verificado SHA-256. La caché IndexedDB solo se reutiliza tras consultar la revisión vigente; no se descargan grabaciones originales en la interpretación pública. Ante cambios de aprobación, conservación vencida o fallo de conexión se suspende el modelo. La prueba privada también vigila la revisión. La cámara sigue siendo local y la sesión de interpretación no se envía.

Verificación: `npm run test:assistant`, `npm run test:admin`, `npm run test:privacy`, `npm run test:training`, `npx deno check --no-config supabase/functions/recognition-runtime/index.ts`, y exportación Expo web. `node scripts/check-prepared-recognition.mjs` consulta el paquete de producción en modo lectura y mide su transporte/descompresión sin imprimir credenciales ni descargar originales. El catálogo se puede regenerar con `node scripts/seed-controlled-catalogue.mjs`; el seed es idempotente y no sobreescribe decisiones existentes.
