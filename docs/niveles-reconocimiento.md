# Niveles de reconocimiento

El intérprete muestra verde (alto), ámbar (medio), rojo (bajo) y gris (sin evaluar). Cada palabra permite consultar el origen del nivel y su evaluación. El color no cambia la habilitación de una seña.

## Automático

La cámara normal actualiza la consistencia observada sin seleccionar una seña ni confirmar intentos: cinco detecciones consecutivas de movimientos separados producen nivel alto; tres o cuatro, medio; una o dos, bajo. Las señas nunca observadas conservan «Sin evaluar» porque no se conoce qué seña intentaba realizar la persona.

El indicador conserva la mejor racha por seña en este navegador y se reinicia cuando cambia el modelo. Una pausa breve entre movimientos separa los intentos: mantener una postura durante muchos fotogramas no cuenta como varias señas. No se envían estos resultados ni imágenes al servidor. Esta racha mide consistencia de la respuesta, no precisión comprobada. Un nivel manual conserva la prioridad.

Cuando no hay una racha local, se usan las pruebas reservadas disponibles:

Se requieren al menos cinco originales reservados para prueba, con la evaluación del modelo actual terminada. Las variantes artificiales y el puntaje de similitud de una detección no son pruebas de precisión.

El nivel usa el menor valor entre acierto (`correct / samples`) y precisión (`correct / predicted`): alto desde 85 %, medio desde 60 % y bajo por debajo. Si faltan pruebas completas, aparece «Sin evaluar». El detalle distingue grabaciones separadas de pruebas con personas confirmadas distintas.

## Manual

En administración, abre **Reconocimiento y entrenamiento**, busca una seña y pulsa **Gestionar**. En **Color en el intérprete en vivo**, elige un nivel y pulsa **Guardar nivel de reconocimiento**. La valoración manual tiene prioridad y aparece identificada como «Manual». Selecciona **Automático** para volver a las pruebas.

Los cambios actualizan los colores sin reconstruir ni volver a descargar el modelo. Dos revisiones simultáneas no se sobrescriben: la segunda debe actualizar su versión.

## Preparación y prueba local

La migración `20261107010000_recognition_quality.sql` es necesaria antes de publicar esta función. La prueba SQL aplica la migración y las comprobaciones dentro de una misma transacción que debe finalizar con `ROLLBACK`.

`node scripts/preview-recognition-quality.cjs` abre una demostración en `http://127.0.0.1:8097/`. Usa 58 entradas de ejemplo y guardados simulados en memoria; no representa los resultados de la biblioteca real. El comando restaura el punto de entrada normal después de compilar.
