# Multiplicar señas desde Admin

En **Grabaciones**, «Grabar y multiplicar» permite elegir una seña del catálogo,
autorizar la captura y grabar una toma. Se pueden añadir otras dos, opcionalmente.
«Multiplicar grabación» también está disponible en cada original pendiente o
aprobado: no requiere volver a grabar ni reunir tres tomas. Seleccionar 50 o 100
crea esa cantidad total de variantes para el lote, además de sus originales.

**Revisar variantes** permite seleccionar y reproducir cualquier variante,
compararla sin variación y aprobar o rechazar el lote. Los originales pendientes
se revisan y aprueban por separado antes de aprobar sus variantes. Un original
aprobado conserva su aprobación al crear otro lote.

## Qué se conserva

- Los JPEG originales, los puntos originales, su orden y sus tiempos permanecen
  intactos. La reproducción usa `training.samples[].requestedAtMs`; los aportes
  antiguos usan su intervalo guardado (113 ms si no lo tenían).
- Cada variante guarda un descriptor de rotación constante de cámara de hasta
  tres grados y el vínculo con su original. No duplica vídeos ni inventa dedos,
  movimientos, duraciones, personas o capturas independientes.
- Los 50 o 100 descriptores quedan disponibles para revisión. El reconocedor
  selecciona como máximo dos referencias sintéticas por clase, junto con las
  referencias reales, para mantener acotados la descarga y el cálculo en vivo.
  Generar otro lote idéntico no añade referencias repetidas al modelo.
- Solo participan variantes aprobadas cuyos originales sigan aprobados, con
  versión/ruta vigentes y puntos aptos no vencidos. Las grabaciones antiguas sin
  puntos pueden reproducirse y multiplicarse; eso no las vuelve aptas para el
  reconocimiento. El panel muestra esta limitación.
- Los originales y las personas se cuentan por separado de las variantes. El
  mínimo de originales para habilitar públicamente una clase sigue siendo tres.
  Los descendientes de muestras o personas reservadas para pruebas nunca pasan
  al aprendizaje. La evaluación utiliza exclusivamente grabaciones reales.
- Cambiar o retirar un original devuelve sus lotes aprobados a pendientes y
  dispara la actualización automática del modelo. La conservación de sus
  variantes termina con la del original.

## Instalación y comprobación

Aplicar `supabase/migrations/20261030020000_recording_variants.sql`, registrar la
migración y desplegar la función existente:

```powershell
npx supabase functions deploy recognition-runtime --project-ref didlffnluqqurelgnqdp --no-verify-jwt --use-api
node --test tests/recordingVariants.test.mjs tests/controlledVocabulary.test.mjs
npx deno check --no-config supabase/functions/recognition-runtime/index.ts
```

La autenticación del administrador conserva sus sesiones opacas existentes.
Las tablas y los generadores privados no son accesibles con claves públicas;
los RPC administrativos exigen `require_admin` y versiones actuales. El RPC de
referencias sintéticas exige el rol de servicio y una concesión de trabajo viva.

`tests/recordingVariants.integration.sql` comprueba el contrato real de Postgres
después de la migración. Usa IDs de prueba aislados y termina en `ROLLBACK`;
no aprobar grabaciones de usuarios para probarlo. La vista local simulada puede
usarse con `npm run web:mock-admin`, con cámara sintética en las pruebas de UI.
