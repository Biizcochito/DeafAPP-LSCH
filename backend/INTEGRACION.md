# Backend Python integrado en DeafApp

Origen: repositorio privado `Biizcochito/Proyecto_LSCh`, rama `puente-deafapp`,
commit `2ea257752e69c5d26f4497c0f0fcb3d790daa3c9` (8 de octubre de 2026).
La incorporación local incluye la API, preparadores, entrenamiento, pruebas,
dataset, MediaPipe y los archivos del modelo. No incluye entornos virtuales,
secretos, videos ni archivos de audio del otro repositorio.

El administrador reúne estas herramientas en **Entrenamiento LSCh**:

- **Modelo de interpretación**: conexión, palabras, informe, importación de aprobadas,
  entrenamiento de candidatos y progreso. Requiere una sesión vigente del administrador,
  verificada por Python con la RPC existente de Supabase en cada solicitud.
- **Probar interpretación (beta)**: prueba de una seña por toma dentro del modelo, disponible después de iniciar sesión en el administrador.
- **Capturas revisadas**: conserva la preparación, recuperación y entrenamiento
  experimental en TensorFlow.js del navegador.

## Inicio desde la carpeta principal

`npm run proyecto` o `iniciar-proyecto.bat` inicia Python en `127.0.0.1:5000`
y reutiliza la web del puerto 8081, o compila y sirve la versión web si ese puerto está libre.
Python 3.12 ya tiene las dependencias necesarias en este equipo. En otro equipo,
`npm run backend:setup` prepara `backend/.venv` con las versiones comprobadas.
`DEAFAPP_PYTHON` permite elegir un ejecutable propio.

`npm run backend` inicia solo Python. El apartado del administrador y la prueba de interpretación
comparten la dirección guardada del servidor. Un celular debe utilizar la dirección
de red del PC o una API HTTPS; `localhost` en el celular apunta al propio celular.
El inicio integrado admite CORS desde deafapps.com y las direcciones locales de pruebas.

## Entrenamiento y resultados

El modelo incluido reconoce 19 palabras de alimentos. El informe original registra
57,02 % de aciertos globales sobre 114 secuencias, 54,84 % entre las 62 respuestas
que superaron el umbral y 89,47 % entre las tres primeras opciones. Estos resultados
provienen de validación cruzada por tomas, no de una evaluación con personas nuevas.

La importación lee únicamente grabaciones aprobadas y prepara copias locales.
El botón de entrenamiento ejecuta el entrenador en segundo plano y guarda cada
candidato en `backend/runs/<id>/`. No sobrescribe ni recarga el modelo en uso.
Los candidatos pueden compararse desde el mismo apartado. Reemplazar el modelo
requiere revisar y copiar juntos `modelo_lsch_lstm.keras`, `label_encoder.pkl`,
`preprocesado.json` e `informe_entrenamiento.json`, y reiniciar Python.

También están disponibles `npm run backend:import`, `npm run backend:train`,
`npm run backend:test`, `npm run backend:check` y `npm run test:python-backend`.
El comando de entrenamiento de la raíz también conserva el modelo actual.

## Datos privados y Git

El repositorio de origen es privado y DeafAPP-LSCH es público. El usuario autorizó publicar esta
integración y sus modelos mediante un Pull Request de feature hacia dev. Dataset, contribuciones, candidatos y entornos se excluyen
de Git y de la exportación web. No se modifican las políticas ni las aprobaciones
de Supabase.
