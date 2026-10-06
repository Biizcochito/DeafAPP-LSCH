# Corrección del inicio de cámara

Se corrigió el ciclo de apertura de expo-camera 57.0.3 en la web. Las solicitudes de cámara pendientes se ejecutan en orden, se detienen los streams que llegan después de abandonar la pantalla y se libera la cámara antes de reiniciarla. Hay una espera inicial de 180 ms y un único reintento tras 500 ms para fallos temporales de arranque. Si fallan las restricciones de cámara, se intenta una vez con la cámara predeterminada. Los permisos denegados no se reintentan.

La cámara se considera lista cuando llegan fotogramas. Los errores de inicio muestran una explicación en español. Los trazados, mensajes de manos, encuadre adaptativo, preparación de grabación y revisión de grabaciones conservan su funcionamiento.

Archivos modificados: `App.js`, `cameraStartup.js`, `scripts/patch-expo-camera.cjs` y `scripts/expo-camera-web-stream.js`. El parche se aplica al código fuente y compilado de la dependencia mediante el script de postinstall, limitado a la versión instalada 57.0.3.

Validación: 40 pruebas aprobadas de ciclo de cámara, compatibilidad, trazados, requisitos de manos y encuadre. La exportación web terminó correctamente. Se comprobó con la cámara real a 640 × 480 que abrir «Hola», reiniciar y salir/volver produce imagen sin pantalla negra. No se grabaron ni enviaron señas durante esta prueba. Captura: `artifacts/camara-inicio-corregido.jpg`.

## Aplicar a la web oficial

El paquete `DeafApp-camara-inicio-corregido.zip` y la carpeta del mismo nombre son copias verificadas de `dist`, con 16 archivos públicos. Incluyen las bibliotecas y los pesos de manos. El ZIP tiene `index.html` directamente en su raíz.

Actualizar el Worker existente `deafapp-lsch` mediante la carga de archivos estáticos. Subir este ZIP completo; si el cargador requiere una carpeta, usar `DeafApp-camara-inicio-corregido` o `dist` completos. Después de publicar, recargar la web oficial.

La nueva página referencia `/_expo/static/js/web/index-2dd4f5134728cb2acb1443e07d1bcbbd.js`. Al comenzar esta comprobación, la web oficial todavía cargaba `index-05334c4ae21d2bcc7ca26b562fad8c95.js`.

Se publicó el paquete completo en el Worker existente `deafapp-lsch` mediante el dashboard de Cloudflare, versión `d0b4e719`, el 4 de octubre de 2026. Se verificó el nuevo JavaScript desde el dominio oficial y se probó la cámara real al abrir y reiniciar: imagen de 640 × 480, reproducción activa y trazado de cara visible. Captura de producción: `artifacts/camara-inicio-corregido-oficial.jpg`.

Si otra aplicación mantiene ocupada la cámara, debe cerrarse esa aplicación antes de pulsar «Reiniciar cámara»; la web no puede liberarla por otra aplicación.
