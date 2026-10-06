Verificación del detector de manos — 2 de octubre de 2026

La web ahora usa inferencia regional directa de MediaPipe HandPose 3D lite,
con TensorFlow.js 4.22.0 y hand-pose-detection 2.0.1, en un Worker. Los pesos y
las bibliotecas se sirven desde la propia exportación. Las regiones iniciales
usan el encuadre de la cara y luego siguen los puntos detectados por el modelo.
La búsqueda convencional de palmas se conserva para otras posiciones.

La muestra local que fallaba con los detectores anteriores produjo 21 puntos
correctamente situados en cada mano. Confianza de las primeras detecciones
regionales: 0.993 y 0.996. No se generan puntos de manos sin predicción del modelo.

En la primera comprobación del Worker, ambas manos se conservaron en 8/8
imágenes desplazadas. La adquisición inicial tardó 63 ms, después de preparar
el modelo; los siguientes tiempos fueron 38–74 ms. Cada mano sola se mantuvo
en 8/8 imágenes; imagen vacía y retrato sin manos produjeron cero detecciones.
En la segunda comprobación, con guía de cara después de una imagen vacía,
ambas manos se recuperaron en dos imágenes. Durante la carga simultánea de
la cámara hubo picos de latencia; estos tiempos no garantizan el mismo
rendimiento en todos los equipos ni igualdad exacta con el detector de cara.

En la cámara real de http://127.0.0.1:8081/ se observó el estado:
«Cara detectada · Izquierda: detectada · Derecha: detectada».
La imagen continuó activa a 640×480. Al bajar las manos, sus trazados se retiraron.

26 pruebas Node aprobadas: puntos válidos y confianza, regiones de búsqueda,
duplicación de una mano, cierre del Worker, preparación en paralelo, continuidad
de cara/manos y condiciones de grabación. Se mantiene la confirmación inicial
de ambas manos y la grabación posterior con cualquiera de ellas.

Los experimentos, fotografías privadas y páginas de diagnóstico no están
incluidos en el ZIP. No se subió ninguna grabación ni se desplegó la web oficial.
Para publicar, se debe cargar la exportación completa DeafApp-cloudflare.zip.
