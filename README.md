# DeafApp 🤟 — Reconocimiento de Lengua de Señas Chilena (LSCh)

DeafApp es una plataforma comunitaria para recolectar, validar y reconocer señas de la **Lengua de Señas Chilena (LSCh)**, desarrollada como proyecto de título de Ingeniería en Informática (Duoc UC). El proyecto nace de la experiencia de ver a un amigo sordo enfrentar barreras de comunicación en el día a día, y busca construir —con la propia comunidad sorda— una base de datos y un sistema de reconocimiento en tiempo real que ayuden a reducir esas barreras.

🔗 **Sitio en vivo:** [deafapp-lsch.deafapp-lsch.workers.dev](https://deafapp-lsch.deafapp-lsch.workers.dev)

> ⚠️ **Proyecto en fase BETA.** Puede presentar cambios y errores mientras se sigue desarrollando.

---

## ¿Qué hace la app?

- **Recolección comunitaria de señas**: cualquier persona puede grabar una seña con la cámara de su celular o computador, para las más de 500 palabras organizadas en 30 categorías (saludos, alimentos, familia, emociones, etc.).
- **Validación comunitaria**: en vez de un solo administrador revisando todo, la propia comunidad vota si reconoce una seña como válida. Se agregó una opción neutral ("no la conozco, pero no digo que esté mal") pensada específicamente para no penalizar variantes regionales de una misma seña (por ejemplo, Santiago vs. sur de Chile).
- **Reconocimiento en tiempo real (experimental)**: un modelo LSTM entrenado con MediaPipe Holistic (manos + cara + pose) puede reconocer en vivo un subconjunto de señas ya entrenadas, actualmente disponible solo dentro del panel de administración para pruebas.
- **Este proyecto NO busca reemplazar a los intérpretes de lengua de señas.** Es una herramienta de apoyo y aprendizaje.

---

## Stack técnico

| Capa | Tecnología |
|---|---|
| Frontend | React Native + Expo (exportado a web) |
| Despliegue | Cloudflare Workers |
| Backend / datos | Supabase (PostgreSQL + Storage + RLS) |
| Reconocimiento de manos/cara/pose | MediaPipe Holistic (JS, vía CDN) |
| Modelo de reconocimiento | LSTM (Keras/TensorFlow) convertido a TensorFlow.js |

---

## Estructura relevante

DeafAPP-LSCH-master/
├── App.js # Toda la app (single-file)
├── public/
│ └── modelo_tfjs/ # Modelo LSTM convertido a TensorFlow.js
│ ├── model.json
│ └── group1-shard1of1.bin
├── dist/ # Generado por expo export, se sube a Cloudflare
└── wrangler.toml # Configuración de despliegue (Worker: deafapp-lsch)


---

## Desarrollo local

```bash
npm install
npx expo start --web
```

## Build y despliegue

```bash
npx expo export -p web
wrangler deploy
```

> El comando anterior sube la carpeta `dist/` generada al Worker `deafapp-lsch` en Cloudflare.

---

## Panel de administración

Accesible en `/#admin` (protegido con contraseña) Para evitar a usuarios que manipulen dichas pruebas/autorizaciones. Permite:

- Revisar y aprobar/rechazar grabaciones pendientes.
- Ver la lista completa con vista previa fotograma a fotograma.
- Probar el reconocimiento en vivo con el modelo LSTM (sección "Visualizador").
- Capturar imágenes de referencia por seña, con los landmarks de MediaPipe superpuestos.
- Y mas pruebas a desarrollar a futuro

---

## Base de datos (Supabase)

**Tabla `grabaciones`:**

| Campo | Descripción |
|---|---|
| `id` | ID único |
| `label` | Palabra/seña |
| `categoria` | Categoría a la que pertenece |
| `archivo_path` | Ruta del video (JSON de fotogramas) en Storage |
| `fuente` | Origen de la grabación (app, referencia_admin, etc.) |
| `aprobada` | Si pasó la validación comunitaria |
| `visible` | Si se muestra públicamente |
| `votos_positivos` / `votos_negativos` | Conteo de la validación comunitaria |
| `timestamp` | Fecha de creación |

**Storage bucket:** `contribuciones` — cada grabación se guarda como un archivo `.json` con el arreglo de fotogramas en base64.

---

## Sobre el modelo de reconocimiento

- Arquitectura: LSTM apilado (2 capas LSTM + BatchNormalization + Dropout + Dense).
- Entrada: secuencias de 30 fotogramas × 270 features (mano derecha, mano izquierda, 42 puntos clave de la cara, 6 puntos de pose — todo vía MediaPipe Holistic).
- Actualmente entrenado sobre la categoría **Alimentos** (19 clases).
- Convertido a TensorFlow.js para correr 100% en el navegador, sin servidor de inferencia.

---

## Consideraciones éticas y de comunidad

- El proyecto se desarrolla con la asesoría directa de un miembro de la comunidad sorda.
- Se evita imponer una "forma correcta única" de hacer una seña: el sistema de validación está diseñado para admitir variantes regionales sin descartarlas por desconocimiento.
- Cualquier decisión sensible respecto a cómo representar variantes lingüísticas se conversa primero con la comunidad antes de implementarse.

---

## Autores

**Diego Armando Padilla Serrano** — autor y desarrollador principal del proyecto.

Con la colaboración de:
- **Ignacio Hernández**
- **Felipe Crisóstomo**

Gracias también a la comunidad sorda que participa activamente grabando, validando y guiando las decisiones del proyecto — sin ellos, esto no sería posible.

---

## Licencia

Pendiente de definir.
