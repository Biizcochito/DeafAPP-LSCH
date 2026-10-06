# Filtro de gestos en la grabación

Implementado un filtro local para la configuración de dedo medio extendido con índice, anular y meñique doblados. Usa los 21 puntos del detector existente y corrige las proporciones de la imagen antes de medir los dedos. No descarga un modelo adicional.

La detección requiere al menos tres resultados independientes durante 250 ms; tolera una clasificación dudosa aislada y se libera tras dos resultados sin el gesto. Los datos vencidos y las cámaras nuevas reinician el filtro. No clasifica la intención ni todos los gestos ofensivos: otros gestos deben definirse con ejemplos y revisarse para evitar interferir con LSCh.

El aviso aparece sobre la cámara y deshabilita Preparar grabación. La validación también se ejecuta durante la preparación, la cuenta atrás y antes/después de cada captura. Un bloqueo durante el intento queda registrado hasta su cancelación, por lo que una detección que luego desaparezca no puede habilitar la subida de esa secuencia.

Se conserva la confirmación inicial de ambas manos y la posibilidad de grabar después con una sola mano. La cámara permanece en formato vertical 9:16.

## Verificación

- 39 pruebas Node aprobadas: geometría en coordenadas normales/espejadas, rotación, escala, resultados reales del modelo, estabilidad, descarte de capturas y regresiones de cámara/trazado/grabación.
- La captura completa suministrada y su mitad derecha activaron el bloqueo. Manos abiertas y ausencia de manos no lo activaron. En la mitad izquierda el modelo interpreta el dedo visible como índice, por lo que no se bloquea: este caso confirma la limitación del reconocimiento de dedos y no se afirma cobertura perfecta.
- Se verificó la aplicación compilada con un flujo de cámara simulado que reproduce la captura: aviso visible y botón deshabilitado. Las subidas estaban deshabilitadas en esa prueba. No se usó la cámara física ni se enviaron imágenes a Supabase.
- Se agregó una región intermedia de búsqueda para adquirir manos cerradas junto a la cara, manteniendo el umbral de confianza del modelo y las comprobaciones contra duplicados.
- Las capturas, páginas y módulos de diagnóstico están excluidos del paquete para Cloudflare. La publicación oficial requiere subir el nuevo ZIP.

Comando: `node --test tests/gestureModeration.test.mjs tests/handRegions.test.mjs tests/recordingHandGuard.test.mjs tests/landmarkTracking.test.mjs tests/webCameraCompatibility.test.mjs`.
