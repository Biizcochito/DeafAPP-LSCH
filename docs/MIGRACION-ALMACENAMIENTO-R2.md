# Migración gradual de originales a R2

## Estado y alcance de la primera fase

La rama `feature/migracion-gradual-r2` prepara una copia piloto de tres originales aprobados de señas fuera del catálogo activo. Esta fase **no libera todavía espacio de Supabase**: conserva sus archivos, filas, identificadores, aprobaciones, versiones, variantes, rasgos preparados y modelo. Tampoco cambia la subida de nuevas grabaciones ni el proveedor de lectura de producción.

La herramienta no implementa eliminación, cambio de rutas de la base de datos ni publicación de archivos. Los lotes grandes y las señas activas se planifican para etapas posteriores; `copy` solo permite el piloto.

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

Cada original se respalda conservando sus bytes. Antes y después se comprueban la aprobación, versión, ruta y revisión del objeto. Se copia bajo `contribuciones/<ruta original>`, mediante escritura condicional que evita sobrescribir, y se vuelve a descargar desde R2 para comparar el tamaño y SHA-256 completo. El comprobante se emite solo tras verificar. Una interrupción se puede reintentar: una copia existente se verifica nuevamente y un contenido diferente provoca una detención. El plan vence a las 24 horas y cualquier cambio de revisión del catálogo exige regenerarlo.

## Próxima fase, antes de retirar cualquier original de Supabase

- Preparar un registro privado de ubicación por objeto sin modificar `grabaciones.archivo_path`, IDs ni versiones de moderación. Mantener comprobantes del origen, bytes, SHA-256 y copia verificada.
- Adaptar lectura autenticada del administrador y variantes, preparación y recuperación del conjunto de entrenamiento, sincronización por CLI y `supabase/functions/recognition-runtime/index.ts`. No basta cambiar las rutas de la interfaz.
- Usar acceso privado autorizado, también para nuevos envíos, con controles del servidor; las credenciales R2 nunca deben formar parte del bundle web. Los visitantes no deben recibir grabaciones identificables mediante un endpoint público.
- Verificar reproducción, variantes, nueva grabación, preparación de rasgos, reconstrucción y uso del modelo, revisión/rechazo y retiro de un aporte, vencimiento y reversión al origen.
- Probar el lector nuevo sin recurrir a Supabase para detectar dependencias ocultas. Hacer primero las pruebas locales y de integración.
- Solo después de validar las copias y los lectores se podrá preparar una retirada gradual por la API Storage. Copiar por sí solo no reduce la cuota. No borrar filas de `grabaciones` ni usar SQL para eliminar únicamente metadatos de objetos.
- Seguir `feature/*` → PR hacia `dev` → PR aprobado `dev` → `master` para los cambios de aplicación; el despliegue de archivos no sustituye las migraciones o configuración del servidor.

## Límites y referencias

R2 Standard incluye 10 GB-mes, un millón de operaciones clase A y diez millones clase B al mes; el exceso y otros servicios asociados pueden generar cargos. Ese margen pertenece a la cuenta, no se multiplica creando buckets. Supabase conserva sus propias cuotas de base de datos, funciones y transferencia.

- [R2: precios](https://developers.cloudflare.com/r2/pricing/)
- [R2: activación](https://developers.cloudflare.com/r2/get-started/)
- [R2: API S3 y región auto](https://developers.cloudflare.com/r2/api/s3/api/)
- [R2: SDK oficial para JavaScript](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/)
- [Supabase: transferencia](https://supabase.com/docs/guides/platform/manage-your-usage/egress)
