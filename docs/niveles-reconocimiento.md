# Niveles de reconocimiento

El intérprete muestra verde (alto), ámbar (medio), rojo (bajo) y gris (sin evaluar). Cada palabra permite consultar el origen del nivel y su evaluación. El color no cambia la habilitación de una seña.

## Automático

Se requieren al menos cinco originales reservados para prueba, con la evaluación del modelo actual terminada. Las variantes artificiales y el puntaje de similitud de una detección no son pruebas de precisión.

El nivel usa el menor valor entre acierto (`correct / samples`) y precisión (`correct / predicted`): alto desde 85 %, medio desde 60 % y bajo por debajo. Si faltan pruebas completas, aparece «Sin evaluar». El detalle distingue grabaciones separadas de pruebas con personas confirmadas distintas.

## Manual

En administración, abre **Reconocimiento y entrenamiento**, busca una seña y pulsa **Gestionar**. En **Color en el intérprete en vivo**, elige un nivel y pulsa **Guardar nivel de reconocimiento**. La valoración manual tiene prioridad y aparece identificada como «Manual». Selecciona **Automático** para volver a las pruebas.

Los cambios actualizan los colores sin reconstruir ni volver a descargar el modelo. Dos revisiones simultáneas no se sobrescriben: la segunda debe actualizar su versión.

## Preparación y prueba local

La migración `20261107010000_recognition_quality.sql` es necesaria antes de publicar esta función. La prueba SQL aplica la migración y las comprobaciones dentro de una misma transacción que debe finalizar con `ROLLBACK`.

`node scripts/preview-recognition-quality.cjs` abre una demostración en `http://127.0.0.1:8097/`. Usa 58 entradas de ejemplo y guardados simulados en memoria; no representa los resultados de la biblioteca real. El comando restaura el punto de entrada normal después de compilar.
