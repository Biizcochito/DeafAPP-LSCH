# Revisión antes del envío y recuperación local

Una secuencia válida de 30 fotogramas abre la vista previa y se guarda localmente,
sin subirla. La reproducción puede pausarse; el usuario elige Enviar seña,
Repetir grabación o Guardar para después. Durante una repetición se conserva
la toma anterior hasta completar otra válida. La vista previa muestra el
fotograma completo con su proporción original y cierra la cámara en vivo.

La web usa IndexedDB, con una grabación pendiente por navegador y origen.
Al volver a abrir el mismo sitio aparece Revisar y enviar. Si falla el guardado
local, se conserva la copia en memoria y se indica que hay que mantener la página
abierta. El envío necesita conexión; no se publica automáticamente al recuperarla.
La implementación nativa usa el directorio de documentos de Expo FileSystem,
pero no se probó en un dispositivo nativo durante este cambio.

El envío conserva una ruta única por toma. Comprueba si ya existe el registro,
reutiliza el archivo si ya estaba subido, comprueba el resultado del INSERT y
retira la copia pendiente únicamente después del éxito. Web Locks coordina
el envío entre pestañas compatibles. Las peticiones se cancelan a los 30 s.
No hubo cambios de esquema o permisos en Supabase.

Validación:
- 8 pruebas nuevas con el SDK real de Supabase y fetch simulado: formato,
  envío explícito, fallo de subida, fallo de registro, respuestas perdidas,
  comprobación de registro existente y cancelación de peticiones colgadas.
- 25 pruebas existentes de manos, gestos y formatos de cámara pasadas.
- Expo export web completado.
- Flujo completo en el bundle real con cámara, detección y servidor simulados,
  en una base IndexedDB de prueba separada de la del usuario:
  grabar, vista previa sin envíos, pausar, repetir y cancelar sin perder la toma,
  recargar y recuperar, fallar la subida, fallar el registro, recargar y reintentar.
- Tras el reintento: 2 intentos de subida (uno fallido), 2 intentos de registro
  (uno fallido). No hubo una tercera subida. Al recargar después del éxito ya no
  había grabación pendiente. La cámara estuvo cerrada durante revisión y envío.
- Vista de celular de 390 × 844: imagen completa, controles y sin desbordamiento.

Las capturas locales son `vista-previa-grabacion.jpg`, `vista-previa-celular.jpg`
y `vista-previa-reintento.jpg`. No se enviaron grabaciones reales al servicio ni
se publicó esta versión en Cloudflare. La carpeta dist y ambos ZIP están listos.
