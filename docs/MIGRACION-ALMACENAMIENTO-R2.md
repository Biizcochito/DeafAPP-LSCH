# Migración gradual de originales a R2

## Estado y alcance

La rama `feature/migracion-gradual-r2` incorpora lectura privada de R2 y retiro gradual de copias redundantes de Supabase. Conserva las filas, identificadores, rutas, aprobaciones, versiones, variantes, rasgos preparados y modelo. Las nuevas grabaciones siguen llegando a Supabase; esta etapa libera margen sin cambiar su formulario ni bloquear envíos.

El 31 de octubre de 2026 se ejecutó el piloto mediante el panel autenticado de Cloudflare, después de que el administrador activara R2. Se creó `deafapp-grabaciones-privadas` en clase Standard con acceso público deshabilitado y se copiaron **mamá, hermano y «todo»: 1.635.661 bytes**. Se descargaron los tres objetos completos desde R2 y se comprobaron sus tamaños y SHA-256 contra el respaldo del origen. Después se verificaron nuevamente los originales y sus revisiones en Supabase. Las rutas se conservaron bajo `contribuciones/`; no se cambió la base de datos ni se eliminó ningún original. Los comprobantes y respaldos identificables permanecen fuera de Git.

El administrador autorizó y se configuró una credencial de objetos restringida a ese bucket. Se guarda fuera de Git y en los secretos cifrados de las funciones. Las migraciones `20261031020000` y `20261031020100` instalan el registro privado de ubicación y las comprobaciones de integridad. `recording-storage` y `recognition-runtime` leen R2 mediante solicitudes S3 firmadas por el servidor. El acceso público del bucket permanece deshabilitado; no se entregan enlaces firmados a visitantes.

El PR incluye la aclaración de proveedores en el apartado «Dónde quedan los datos» del aviso de privacidad. Su publicación sigue el flujo de revisión y despliegue del equipo. Esta aclaración no cambia la versión usada para validar comprobantes de autorización, el plazo de conservación ni las condiciones de envío; las grabaciones y sus evidencias se conservan intactas. No constituye una validación jurídica de permisos de aportes anteriores.

`migrate-recordings-r2.mjs` respalda y copia sin eliminar. `activate-recordings-r2.mjs` registra, verifica, activa y, por separado, retira únicamente archivos originales redundantes. Solo admite el piloto y lotes de señas inactivas. Las señas activas, importaciones ambiguas y archivos sin vínculo se conservan para revisión posterior.

## Selección

- Actualizar el inventario de objetos, sus tamaños, revisiones y registros de aprobación.
- Comparar con el manifiesto real de reconocimiento, incluyendo los alias de oraciones.
- Pilotear con tres signos distintos, aprobados, fuera de los activos y con archivos de hasta 2 MB.
- Priorizar después los originales grandes de categorías inactivas, en lotes de hasta 100 MB. El tamaño indica el ahorro potencial; no demuestra la calidad de una muestra ni autoriza su eliminación.
- Conservar las señas y oraciones activas para el final.
- Separar el lote `drive/`, solicitado para limpieza independiente; archivos sin vínculo inequívoco con una fila, pendientes/rechazados, etiquetas desconocidas y otros formatos requieren revisión.

## Preparación y ejecución local

```powershell
node scripts/migrate-recordings-r2.mjs inventory
node scripts/migrate-recordings-r2.mjs plan
node scripts/migrate-recordings-r2.mjs backup --batch pilot
node --test tests/storageMigration.test.mjs
```

El inventario, el plan, los comprobantes y los originales quedan únicamente en `.admin-private/storage-migration/`, excluido de Git. Las imágenes y los puntos de movimiento pueden identificar participantes: conservarlos con los controles de acceso y plazos correspondientes. El respaldo en este equipo no sustituye una copia independiente y protegida ante una falla del disco.

`inventory` y `backup` solo leen Supabase. La herramienta utiliza la configuración pública existente; si el origen pasa a privado, se necesitará un lector autorizado. Las descargas consumen transferencia de salida del origen.

Antes de copiar a Cloudflare:

1. Acceder a la cuenta correcta de Cloudflare y revisar la activación de R2 y su facturación por uso.
2. Crear un bucket **Standard privado**, con acceso público por `r2.dev` y dominios públicos deshabilitado, y verificar esa configuración en el panel. La API S3 usada por este script no verifica la configuración de exposición pública de Cloudflare.
3. Revisar e informar la incorporación de Cloudflare como proveedor en el aviso de privacidad, preservando finalidad, autorizaciones, plazos y atención de retiros.
4. Configurar credenciales de objetos limitadas al bucket de migración. Mantenerlas fuera de Git, capturas, chat y variables `EXPO_PUBLIC_*`; no introducir claves administrativas en el navegador de la aplicación.
5. Poner `R2_ACCOUNT_ID`, `R2_MIGRATION_BUCKET`, `R2_ACCESS_KEY_ID` y `R2_SECRET_ACCESS_KEY` en el entorno del proceso administrativo. El script no crea cuentas, activa cobros ni genera credenciales.
6. Ejecutar `node scripts/migrate-recordings-r2.mjs copy --batch pilot`.

Cada original se respalda conservando sus bytes. Antes y después se comprueban la aprobación, versión, ruta y revisión del objeto. Se copia bajo `contribuciones/<ruta original>`, mediante escritura condicional que evita sobrescribir, y se vuelve a descargar desde R2 para comparar el tamaño y SHA-256 completo. El comprobante se emite solo tras verificar. Una interrupción se puede reintentar: una copia existente se verifica nuevamente y un contenido diferente provoca una detención. Las copias cargadas por el panel, sin metadatos SHA-256 personalizados, también requieren la comparación completa de bytes antes de adoptarlas; el tamaño no basta. El plan vence a las 24 horas y cualquier cambio de revisión del catálogo exige regenerarlo.

## Lectura privada y retiro

El administrador conserva su sesión existente. El token opaco viaja en una cabecera; PostgreSQL valida que siga vigente antes de resolver una grabación. Los procesos administrativos usan una credencial `service_role` validada mediante una función sin permisos para visitantes. No basta declarar un rol o comparar el texto de un JWT. El servidor limita las rutas y tamaños, comprueba SHA-256 completo y responde con `no-store`; una falla privada no provoca un acceso público alternativo.

Preparar las variables anteriores y `SUPABASE_SERVICE_ROLE_KEY` únicamente en el proceso administrativo. No usar `EXPO_PUBLIC_*`:

```powershell
node scripts/activate-recordings-r2.mjs baseline
node scripts/activate-recordings-r2.mjs register --batch pilot
node scripts/activate-recordings-r2.mjs verify --batch pilot
node scripts/activate-recordings-r2.mjs activate --batch pilot
node scripts/activate-recordings-r2.mjs rollback --batch pilot
node scripts/activate-recordings-r2.mjs activate --batch pilot
node scripts/activate-recordings-r2.mjs audit
```

La referencia inicial incluye resúmenes y huellas de las 435 filas, 1.100 variantes, sus lotes, 348 rasgos preparados y el modelo. Cada etapa debe mantenerlos idénticos. La auditoría completa se ejecuta al inicio y cierre de cada lote y, como máximo, cada minuto durante el trabajo; entre auditorías se comprueba el manifiesto en cada guardia. Esto evita recalcular el modelo completo repetidamente en la base Nano. Cada archivo mantiene sus controles de aprobación, versión, objeto, respaldo, copia y bytes antes del retiro. Un cambio detectado detiene el proceso para revisión. Storage presenta fechas truncadas a milisegundos: el registro coteja esa precisión de la API junto con ID, versión, ETag y tamaño, pero conserva la fecha completa del servidor para activación y reversión.

Antes de `retire`, publicar los lectores web mediante los PR correspondientes y comprobar la reproducción autenticada en producción. Guardar en `.admin-private/storage-migration/production-readers-verified.json` el proyecto, commit, URL y SHA-256 del bundle oficial, y las verificaciones `runtimeR2Verified` y `adminR2Verified`. El comando vuelve a descargar ese bundle y rechaza una versión distinta. Este comprobante se prepara tras las pruebas; no es una variable que habilite por sí sola el acceso a datos.

```powershell
node scripts/activate-recordings-r2.mjs retire --batch pilot
```

Antes de retirar **cada archivo**, se vuelven a cotejar el original actual, el respaldo local, R2 y la lectura privada de la aplicación. Se elimina por la API Storage solo esa ruta, se guarda inmediatamente un comprobante y se comprueban de nuevo la lectura y las huellas de la aplicación. No se borran filas de `grabaciones` ni metadatos mediante SQL. La reversión después del retiro requiere restaurar primero el original respaldado; antes del retiro, `rollback` cambia únicamente el proveedor.

Repetir `backup`, `copy`, `register`, `verify`, `activate`, `retire` por cada lote `inactive-*`, sin mezclar las etapas ni continuar tras un error. El plan del 31 de octubre selecciona 107 archivos y 404.650.287 bytes, incluyendo el piloto. El objetivo calculado es bajar de 1.253.658.603 a 849.008.316 bytes; confirmar el inventario final para conocer el ahorro real. La métrica mensual de GB-hora puede tardar en reflejar el retiro.

## Comprobaciones de despliegue

- Preparar un registro privado de ubicación por objeto sin modificar `grabaciones.archivo_path`, IDs ni versiones de moderación. Mantener comprobantes del origen, bytes, SHA-256 y copia verificada.
- Adaptar lectura autenticada del administrador y variantes, preparación y recuperación del conjunto de entrenamiento, sincronización por CLI y `supabase/functions/recognition-runtime/index.ts`. No basta cambiar las rutas de la interfaz.
- Mantener las credenciales R2 fuera del bundle web. Los nuevos envíos siguen su ruta actual de Supabase; migrar también sus subidas es una etapa posterior.
- Verificar reproducción, variantes, nueva grabación, preparación de rasgos, reconstrucción y uso del modelo, revisión/rechazo y retiro de un aporte, vencimiento y reversión al origen.
- Probar el lector nuevo sin recurrir a Supabase para detectar dependencias ocultas. Hacer primero las pruebas locales y de integración.
- Ejecutar `tests/sql/recording-storage.sql` y `npm run test:storage-migration`. Copiar por sí solo no reduce la cuota; el ahorro real se acredita con el inventario posterior al retiro.
- Seguir `feature/*` → PR hacia `dev` → PR aprobado `dev` → `master` para los cambios de aplicación; el despliegue de archivos no sustituye las migraciones o configuración del servidor.

## Límites y referencias

R2 Standard incluye 10 GB-mes, un millón de operaciones clase A y diez millones clase B al mes; el exceso y otros servicios asociados pueden generar cargos. Ese margen pertenece a la cuenta, no se multiplica creando buckets. Supabase conserva sus propias cuotas de base de datos, funciones y transferencia.

- [R2: precios](https://developers.cloudflare.com/r2/pricing/)
- [R2: activación](https://developers.cloudflare.com/r2/get-started/)
- [R2: API S3 y región auto](https://developers.cloudflare.com/r2/api/s3/api/)
- [R2: SDK oficial para JavaScript](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/)
- [Supabase: transferencia](https://supabase.com/docs/guides/platform/manage-your-usage/egress)
