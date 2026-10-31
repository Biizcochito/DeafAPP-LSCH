# Retiro de la importación de Drive

El administrador pidió expresamente eliminar esas señas del proyecto, después de distinguir esta opción de conservarlas en R2. El lote identificado contiene **127 archivos JSON, 12.613.721 bytes y 76 filas vinculadas**. La selección se limita a `contribuciones/drive/<seña>/<archivo>.json`; las grabaciones de la web quedan fuera.

Esta limpieza es distinta de la migración de 107 originales a R2. Primero debe terminar aquella migración y su auditoría, porque eliminar filas importadas sí cambia las fuentes del modelo. Las filas de la web y sus variantes se conservan. El modelo se reconstruye después de retirar las fuentes de Drive; no se conserva como válido un modelo que todavía dependa de ellas.

## Operación administrativa

Aplicar `20261031020300_remove_drive_imports.sql`. La función solo admite `service_role`, valida las filas y versiones, coteja los objetos originales y rechaza dependencias de variantes o copias migradas que necesiten revisión. Su opción predeterminada es una simulación sin eliminaciones.

Configurar `SUPABASE_SERVICE_ROLE_KEY` únicamente en el proceso administrativo, fuera de Git y del bundle web. La configuración pública existente identifica el proyecto. Ejecutar:

```powershell
node scripts/remove-drive-imports.mjs plan
node scripts/remove-drive-imports.mjs backup
node scripts/remove-drive-imports.mjs dry-run
# Después de completar la migración en curso:
node scripts/remove-drive-imports.mjs remove
node scripts/remove-drive-imports.mjs audit
```

El plan, el respaldo privado para reversión, las filas anteriores y los comprobantes se guardan en `.admin-private/storage-migration/`, excluido de Git y protegido en el equipo del administrador. No se copian estos archivos de Drive a R2 ni se publican respaldos. No sobrescribir una referencia para hacer pasar una comprobación.

La eliminación de las 76 filas ocurre en una transacción tras verificar que no cambiaron. Sus disparadores retiran los rasgos correspondientes e invalidan el modelo. Los 127 objetos se eliminan únicamente mediante la API Storage, con comprobaciones de ruta, revisión, respaldo y ausencia de referencias. Cada retiro deja inmediatamente un comprobante. Los objetos faltantes sin comprobante y cualquier cambio ajeno al lote detienen el proceso.

Al terminar, comprobar que no quedan filas ni archivos del lote, que las otras filas siguen idénticas, que las variantes conservan sus fuentes y que el manifiesto vuelve a indicar un modelo listo. Una respuesta perdida de la eliminación de filas se reconcilia leyendo su estado; nunca se amplía el alcance ni se reintenta una eliminación a ciegas.
