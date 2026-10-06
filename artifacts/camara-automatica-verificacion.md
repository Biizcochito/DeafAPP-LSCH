# Cámara automática en la web

PC: formato anterior 4:3, ancho máximo 600 px. Celular: formato vertical
9:16, ancho máximo 450 px. Ambos ocupan el ancho disponible hasta ese máximo.
Se reconocen los dispositivos mediante el indicador móvil del navegador,
su identificación y, como respaldo, pantalla y entrada táctil. Reducir una
ventana de PC no la convierte en celular. Se conserva el comportamiento nativo.

Validación:
- 5 pruebas de detección: PC ancho y estrecho, Android/iPhone girados,
  PC táctil, iPadOS/Safari y señales de respaldo.
- Exportación web de Expo completada.
- Interfaz real compilada, con una cámara simulada local y subidas bloqueadas:
  PC 600 × 450; PC estrecho 366 × 274,5; celular 358 × 636,44;
  celular girado 450 × 800. Sin desbordamiento horizontal.
- Video listo y cara con 468 puntos en cada tamaño. El tiempo de reproducción
  siguió avanzando al redimensionar; no se remontó la cámara. El filtro existente
  del dedo medio siguió mostrando el aviso y bloqueando el botón.

Las capturas y mediciones están en `camara-automatica-pc.jpg`,
`camara-automatica-celular.jpg` y `camara-automatica-verificacion.json`.
La prueba de celular emula la identificación del dispositivo en el navegador;
no sustituye una comprobación en un teléfono físico.

La carpeta dist y los ZIP de cámara automática y Cloudflare están actualizados.
No se publicó esta versión en la web oficial durante este cambio.
