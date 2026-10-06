# Restaurar la cámara en la web oficial

La web oficial observada está cargando `index-e6bcc91bc243ccb91938eef86b02a159.js`. Su pantalla muestra «Grabar seña (3 seg)» y no contiene el canvas ni el panel de trazado. La exportación actual carga `index-05334c4ae21d2bcc7ca26b562fad8c95.js` y conserva los trazados de cara/manos, los mensajes de detección, la leyenda, el reinicio y la preparación de grabación.

`DeafApp-restaurar-camara.zip`, en la raíz del proyecto, es una copia exacta de `dist`. No se modificaron App.js ni el funcionamiento de la aplicación para preparar este paquete. Se comprobaron el ZIP, el JavaScript referenciado por index.html, las bibliotecas del Worker, los manifiestos y los archivos de pesos de manos. Pasaron 30 pruebas existentes de seguimiento, condiciones de grabación, encuadre y compatibilidad de cámara. Esta comprobación no sustituye una prueba de cámara después de publicar.

En la interfaz local compilada se comprobó «HOLA», el canvas de cámara, «Ocultar trazado», la leyenda, «Reiniciar cámara» y «Preparar grabación». El navegador de comprobación produjo un error de contexto WebGL al preparar los detectores, por lo que en esta sesión no se verificó inferencia en vivo. Se cerraron las pestañas de cámara al terminar para liberar el dispositivo.

Para actualizar el proyecto existente en Cloudflare:

1. Entrar en Workers y Pages y abrir el Worker `deafapp-lsch`.
2. Usar la opción de actualizar mediante carga de archivos estáticos.
3. Cargar el ZIP completo `DeafApp-restaurar-camara.zip`. Si el cargador pide una carpeta, descomprimirlo y seleccionar la carpeta que contiene `index.html` y `_expo` directamente.
4. Publicar en el Worker existente, cuyo dominio es `https://deafapp-lsch.deafapp-lsch.workers.dev/`.
5. Recargar la web y abrir una seña. La versión correcta muestra «Preparar grabación», «Ocultar trazado», la leyenda y «Reiniciar cámara».

El paquete se preparó, pero no se publicó durante esta comprobación: el dashboard de Cloudflare solicita iniciar sesión. Las grabaciones de Supabase y la información local de los modelos no se modificaron.
