# Grabaciones en R2 privado

## Arquitectura actual

Los archivos originales, incluidas las capturas nuevas de la web y del panel de multiplicación, se guardan en el bucket privado `deafapp-grabaciones-privadas` de Cloudflare R2. Supabase conserva las filas de `grabaciones`, IDs, rutas lógicas, moderación, variantes, rasgos y modelo preparado. Cambiar el almacenamiento no habilita una seña ni altera su aprobación.

La interfaz, cámara, revisión y diseño permanecen iguales. Las variantes son especificaciones pequeñas vinculadas a sus originales; no se convierten en copias completas de imágenes. El modelo público usa el paquete preparado y no descarga los originales.

## Envíos nuevos

1. `submitRecordingDraft` conserva el borrador y comprueba el consentimiento antes de transferir datos.
2. La función `recording-upload`, con verificación JWT habilitada, valida el tamaño, formato de imágenes, consentimiento vigente y seña habilitada para recopilar. Su cuenta de servicio reserva una ruta y un token privado de finalización.
3. El servidor escribe de forma condicional en R2; no sobrescribe otra grabación. Descarga el archivo completo para comprobar tamaño y SHA-256 antes de marcarlo listo.
4. El cliente vuelve a comprobar el consentimiento antes de finalizar. La finalización verifica otra vez R2 y registra en una sola transacción la fila pendiente y su ubicación privada. No basta un archivo subido para informar un envío recibido.
5. El ID y el token permiten reintentar una respuesta perdida sin crear otra grabación ni modificar la fecha de conservación. Un envío anterior que quedó solo en Supabase no se considera un comprobante R2.

El archivo mantiene el esquema 2, imágenes, puntos, tiempos, proporción, etiqueta y comprobante. La conservación de nuevos aportes es de 48 meses de calendario desde el primer envío; no se amplía el plazo de aportes anteriores. No hay credenciales S3 ni enlaces públicos de lectura en el cliente.

## Despliegue

- Aplicar `20261101020000_direct_recording_uploads_r2.sql` y `20261101020100_recording_storage_all_statuses.sql` en una transacción. Sus funciones de escritura y archivo solo admiten `service_role`.
- Desplegar `supabase/functions/recording-upload/index.ts` y mantener habilitado **Verify JWT with legacy secret**. La clave pública existente admite el aporte voluntario; no concede lectura de originales privados.
- Conservar los secretos existentes `R2_ACCOUNT_ID`, `R2_MIGRATION_BUCKET`, `R2_ACCESS_KEY_ID` y `R2_SECRET_ACCESS_KEY` en el entorno de funciones. La credencial sigue limitada al bucket. Nunca usar variables `EXPO_PUBLIC_*` para secretos.
- Verificar primero un envío sintético completo, reintento, lectura autorizada y rechazo de lectura anónima. Retirar únicamente los datos de esa prueba.
- Publicar el cliente mediante rama de trabajo → PR a `dev` → PR aprobado a `master`. HostGator compila y publica la web.

Una pestaña que conserva JavaScript de una versión anterior debe recargarse para usar el envío nuevo. El almacenamiento de Supabase sigue disponible para compatibilidad y recuperación administrativa; el cliente actualizado no lo utiliza para subir capturas.

## Lecturas y entrenamiento

`recording-storage` resuelve la ubicación, valida la sesión administrativa o identidad de servicio y comprueba el SHA-256 completo. No expone URLs reutilizables ni recurre a una descarga pública si falla R2. El administrador conserva el lector compartido y su sesión existente. La preparación del modelo usa el mismo lector del servidor.

`scripts/sync-lsch-recordings.mjs` requiere `SUPABASE_SERVICE_ROLE_KEY` para originales privados. El importador Python también resuelve la ubicación y usa el lector privado: configurar `SUPABASE_SERVICE_ROLE_KEY` únicamente en ese proceso administrativo o `DEAFAPP_ADMIN_TOKEN` con una sesión vigente. Su RPC POST es de lectura; no registra aportes ni escribe en el almacenamiento.

## Migración y retiro de copias

La primera fase del 31 de octubre trasladó 107 originales y retiró por separado las fuentes Drive que el administrador pidió eliminar. Las herramientas antiguas `migrate-recordings-r2.mjs` y `activate-recordings-r2.mjs` conservan sus límites de piloto y aprobación; no deben reutilizarse con referencias anteriores de 435 filas tras la limpieza de Drive.

La ampliación autorizada del 1 de noviembre conserva también las grabaciones rechazadas sin cambiar su estado. Antes de retirar cada fuente se comprueban:

- Respaldo local, copia R2 y sus bytes completos con SHA-256.
- ID, versión, ETag, tamaño y fecha del objeto origen; fila, etiqueta, categoría y versión de moderación.
- Registro privado de ubicación, verificación por el lector del servidor y lectura activa antes y después del retiro.
- Huellas de registros, variantes, lotes y rasgos; modelo listo e idéntico.

Los archivos sin fila de grabación se conservan en `contribuciones/__archive__/2026-11-01/`, con un índice privado que registra su ruta original y huella. No se incorporan al entrenamiento ni se inventan aprobaciones. Se retira únicamente la copia redundante mediante la API Storage, nunca borrando metadatos de Storage por SQL.

Los respaldos y comprobantes identificables quedan en `.admin-private/storage-migration-complete/` y `.admin-private/storage-migration/backups/`, fuera de Git y protegidos en este equipo. La reversión de una fuente retirada requiere restaurar su archivo respaldado antes de cambiar su ubicación. Las autorizaciones y plazos también se aplican a copias y archivos privados.

## Validación y cuotas

- `npm run test:recording-upload`: envío, consentimiento, reintentos, integridad y esquema de capturas/oraciones.
- `npm run test:storage-migration`: rutas privadas, permisos, límites y controles de retiro.
- `npm run test:admin` y pruebas de variantes: revisión y dependencias conservadas.
- `python -m unittest tests.test_importar`, desde `backend`: lector Python de Supabase y R2, sin red real.
- Exportación web de Expo y prueba sintética del servicio desplegado.

Liberar objetos reduce el almacenamiento real, pero la métrica mensual de uso del proveedor puede tardar en reflejarlo. Supabase conserva sus cuotas de base de datos, funciones y transferencia: enviar por una función no ocupa Supabase Storage, aunque sí utiliza sus servicios. R2 mantiene sus cuotas de almacenamiento y operaciones de la cuenta.

Fuentes: [R2 S3](https://developers.cloudflare.com/r2/api/s3/api/), [precios de R2](https://developers.cloudflare.com/r2/pricing/), [límites de funciones Supabase](https://supabase.com/docs/guides/functions/limits).
