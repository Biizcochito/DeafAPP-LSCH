# Proyecto LSCh — reconocimiento de Lengua de Señas Chilena

Backend del proyecto: prepara las secuencias de señas, entrena el modelo que las reconoce y lo sirve por una
API. Se relaciona con **DeafApp**, la web donde las personas graban señas (comparten el mismo proyecto de
Supabase).

```
 DeafApp (web)              Supabase                      Este repositorio
 ─────────────              ────────                      ────────────────
 persona graba  ──►  grabaciones (+ bucket contribuciones)
                          │  el equipo modera (aprobada = true)
                          ▼
                    importar_deafapp.py ─►  dataset/<seña>/deafapp_<id>.npy ─┐
 capturar_secuencias.py (cámara) ────────►  dataset/<seña>/seq_XXXX.npy ─────┤
                                                                             ▼
                                              entrenar_modelo.py   (rasgos → aumento al vuelo → validación cruzada)
                                                 ├─► modelo_lsch_lstm.keras + label_encoder.pkl
                                                 ├─► preprocesado.json   (cómo preparar la entrada, incluido el umbral)
                                                 └─► informe_entrenamiento.json
                                                                             ▼
                                              api_flask.py / reconocer.py  (interpretación en vivo)
```

## Formato de datos

Fuente única: [`formato.py`](formato.py). Cada **fotograma** son 270 valores (x, y, z normalizados) y una
**secuencia** son 30 fotogramas: un array `(30, 270)` `float32`.

| Bloque | Valores | Contenido |
|---|---|---|
| 0 – 62 | 63 | mano derecha (21 puntos) |
| 63 – 125 | 63 | mano izquierda (21 puntos) |
| 126 – 251 | 126 | 42 puntos de la cara |
| 252 – 269 | 18 | pose: hombros, codos y muñecas |

Un bloque de ceros significa «no detectado». Los `.npy` guardan siempre este formato crudo.

**Convención de imagen.** Los puntos se calculan sobre la imagen **sin voltear** (`ESPEJAR_ENTRADA = False`),
igual que el video con el que se creó el dataset y que las grabaciones de DeafApp. El efecto espejo que se ve
en pantalla se aplica *después* de calcular los puntos. Voltear antes intercambia las manos y refleja `x`, así
que nunca se deben mezclar datos creados con una y otra convención.

**Relación de aspecto.** Los puntos de MediaPipe son `x/ancho` e `y/alto`, así que la misma escena vista por una cámara
de otra proporción llega con `x` e `y` a escalas distintas y la forma de la mano se deforma. El dataset es video
16:9, que es la **referencia** (`ASPECTO_REFERENCIA`): todo lo que entra (importador, API, cámara y captura) se
convierte con `formato.corregir_aspecto` a lo que habría salido con una cámara 16:9. Con 16:9 no cambia nada, por eso
el dataset y el modelo actuales no se tocan. El aspecto sale del propio fotograma (las grabaciones antiguas de DeafApp
no guardan `frameAspectRatio`; las de la muestra llegan en 3:4, 4:3 y 16:9) o, con puntos de la web, de
`frameAspectRatio` (4:3 si falta). Sin corregirlo, la validación por tomas bajaba de 49 % (16:9) a 47 % (4:3), 39 %
(3:4) y 33 % (9:16, celular en vertical).

## Qué ve el modelo (`rasgos.py`)

El modelo no mira el video: solo los puntos de las manos. Pero llegaban como **coordenadas de imagen**, es
decir, dónde está la persona, a qué distancia de la cámara y si la mano existe (ceros). Ahora el entrenamiento
las convierte, por mano, en:

* **forma**: los 20 puntos de la mano relativos a la muñeca y al tamaño de la palma (no depende de dónde está
  ni de qué tan cerca);
* **posición** de la muñeca respecto a la cara, en anchos de cara (frente, boca, mentón, pecho);
* **presencia** de la mano (0 o 1), y los huecos de detección de hasta 4 fotogramas se interpolan.

Son 128 valores por fotograma. **La cara es solo la regla** (su centro y su ancho dan el origen y la unidad
para medir dónde está la mano); no entra como rasgo de expresión. Se probó añadir el movimiento de la cara y
empeoró el resultado. Se usa la cara y no la pose porque siempre está disponible, también en las grabaciones de
DeafApp, que no traen pose.

`preprocesado.py` guarda esa transformación (y la estandarización ajustada con el entrenamiento) en
`preprocesado.json` junto al modelo. API, cámara y evaluación la cargan de ahí, así el modelo recibe en vivo
exactamente lo que vio al entrenar. Sin ese archivo se asume el comportamiento anterior (coordenadas crudas),
así que los modelos viejos siguen funcionando.

## Instalación

```bash
pip install -r requirements.txt
```

El modelo de MediaPipe (`holistic_landmarker.task`) se descarga solo la primera vez. Si ya lo tienes, define
`LSCH_MODELO_HOLISTIC` con su ruta.

## Flujo de trabajo

```bash
py importar_deafapp.py --solo-listar     # qué hay aprobado en DeafApp (no descarga nada)
py palabras_faltantes.py --plan alimentos,saludos   # qué grabaciones pedir para completar un vocabulario inicial
py importar_deafapp.py                   # trae lo aprobado al dataset (solo lectura en Supabase)
py capturar_secuencias.py                # o graba con la cámara
py entrenar_modelo.py                    # valida, entrena y escribe modelo + preprocesado + informe
py evaluar_modelo.py --datos dataset_deafapp   # prueba con grabaciones de OTRAS personas (ver abajo)
py api_flask.py                          # sirve el modelo (o: py reconocer.py para la cámara local)
```

### Importar desde DeafApp (`importar_deafapp.py`)

* Lee con la clave pública las filas de `grabaciones` con `aprobada = true`, descarga cada JSON del bucket
  `contribuciones` y procesa sus fotogramas con el mismo Holistic del backend. Así **todas** las grabaciones
  (antiguas y nuevas) siguen el mismo camino y también se obtiene la pose, que la web no calcula.
* **No escribe nada** en Supabase ni toca las grabaciones originales.
* Lleva los puntos al formato de referencia 16:9 (ver «Relación de aspecto»); lo importado antes de este cambio se
  rehace solo en la siguiente ejecución (`conversion` en el manifiesto).
* Es idempotente (misma ruta y misma versión de moderación = sin cambios) y espeja la moderación: si una
  grabación deja de estar aprobada, su `.npy` se retira.
* Lo omitido queda con su motivo en `dataset/_deafapp.json` (por ejemplo, menos de 50 % de fotogramas con mano).
* `--usar-puntos-web` usa los puntos que calculó el navegador (solo grabaciones nuevas, sin pose).
* Filtros: `--categorias`, `--etiquetas`, `--limite`, `--min-manos`.
* Para medir el modelo con otras personas, importa a una carpeta **aparte** (`--salida dataset_deafapp`) y
  evalúalo con `evaluar_modelo.py`; no la mezcles con la de entrenamiento.

### Pedir más grabaciones (`palabras_faltantes.py`)

Con 1 o 2 grabaciones por palabra el modelo no aprende; con ~10 de personas distintas, sí. Este informe cruza el
catálogo de DeafApp (`catalogo_palabras.json`, 531 palabras) con las grabaciones **aprobadas** (solo lectura) y,
con `--dataset dataset`, los originales independientes del dataset local. No cambia la web ni muestra nada a los
usuarios: es una lista para que el equipo sepa qué pedir y a quién.

```bash
py palabras_faltantes.py --dataset dataset                    # resumen por categoría y palabras más cercanas al objetivo
py palabras_faltantes.py --categoria alimentos                # una categoría completa
py palabras_faltantes.py --plan alimentos,saludos             # cuántas personas hacen falta
py palabras_faltantes.py --objetivo 15 --csv faltan.csv       # lista completa para compartir (Excel)
```

Con el objetivo de 10 grabaciones por palabra, hoy (2026-10-08): de 506 palabras distintas **ninguna está completa**,
34 tienen algo y 472 no tienen ninguna; faltarían unas 4.900 grabaciones en total. Cubrir todo el catálogo no es
realista de golpe. Un vocabulario inicial de **Alimentos + Saludos** son 35 palabras: si 10 personas distintas
graban cada una una vez, faltan 247 grabaciones. `catalogo_palabras.json` es una copia del catálogo de la web
(`src/catalog/signCatalog.js`); si cambia, se regenera con `node exportar_catalogo.cjs <ruta a signCatalog.js> catalogo_palabras.json`.
Solo ve las aprobadas: una palabra con grabaciones pendientes de moderación aparece con menos de las que tiene.

### Entrenamiento (`entrenar_modelo.py`)

1. Usa los **originales**. Ignora las copias `aug_*.npy` guardadas por `augmentar_dataset.py` y las copias
   antiguas dañadas (ver «Dataset anterior»): el entrenamiento aumenta al vuelo.
2. **Aumento sobre rasgos** (`aumento_rasgos.py`), solo en entrenamiento: rotación, desplazamiento y escala de
   la posición de las manos (medidos en anchos de cara), ruido en la forma (en palmas), recortes de tiempo,
   fotogramas perdidos y espejo (zurdos). Por construcción no puede filtrar copias de una secuencia de prueba.
3. **Validación cruzada por grupos**: cada original se prueba una vez, sin que su toma ni sus copias estén en el
   entrenamiento (un grupo = un original + repeticiones casi idénticas, detectadas comparando x e y, también
   espejadas). Es el número que importa; el modelo guardado se reentrena después con todos los originales.
4. Red pequeña por defecto (`--arquitectura cnn`, 2 × Conv1D); también `gru` y la `lstm` anterior.
5. Las clases con menos de 3 originales independientes quedan fuera (`--min-originales 1` las incluye).
6. Escribe `informe_entrenamiento.json`: exactitud global y por clase, confusiones, top-3 y top-5, curva de
   confianza y configuración.

Argumentos: `--dataset`, `--salida`, `--arquitectura`, `--epocas`, `--copias`, `--pliegues`, `--rasgos`,
`--min-originales`, `--incluir-copias`, `--incluir-danadas`, `--sin-modelo-final`, `--semilla`.

### API (`api_flask.py`)

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/estado` | estado, clases y si Supabase está conectado |
| POST | `/predecir` | recibe un fotograma (`frame` base64 + `device_id`), acumula 30 y responde (ventana deslizante) |
| POST | `/clasificar` | recibe un clip completo (los fotogramas o sus puntos) y responde: una seña por consulta |
| POST | `/contribuir` | guarda una secuencia `(30, 270)` en base64 y la sube a Supabase |
| POST | `/limpiar_buffer` | reinicia el buffer de un dispositivo |

Las dos rutas de predicción devuelven `prediccion`, `confianza` y `frames` como siempre, y además `candidatos`: las 3
señas más probables (`[{"sena": ..., "confianza": ...}]`; en `/predecir` va vacío hasta tener 30 fotogramas).

**`/clasificar`** es el uso que encaja con cómo se entrenó el modelo (un segmento de seña = 30 fotogramas) y con
cómo graban la web y la app del celular. No guarda estado ni usa el buffer de ningún dispositivo. Acepta una de tres
entradas:

| Entrada | Quién la usa | Qué hace el servidor |
|---|---|---|
| `{"frames": ["<jpeg base64>", ...], "intervalo_ms": 100}` (10 a 120 fotogramas) | **la app del celular**, que no calcula puntos | calcula los puntos con el mismo MediaPipe con que se armó el dataset, toma el aspecto del fotograma y clasifica |
| `{"training": {...}, "aspecto": 1.333}` | la web, que ya calcula los puntos en el navegador (sin video ni pose) | corrige el aspecto (4:3 si falta) y clasifica |
| `{"secuencia": "<base64 float32 (30, 270)>", "aspecto": 1.778}` | pruebas y otros clientes | aspecto opcional; por defecto 16:9, sin corrección |

Responde `prediccion` (si la confianza llega al umbral), `confianza`, `candidatos` (las 3 señas más probables),
`manos` (fracción de fotogramas con alguna mano) y `fuente`. **Si se ven manos en menos del 30 % de los fotogramas no
adivina nada**: `candidatos` vacío y un `aviso`. Con `frames` el cuerpo puede llegar a 32 MB (las demás rutas, 6 MB):
las grabaciones antiguas de DeafApp pesan 16 a 20 MB por clip, así que conviene mandar fotogramas pequeños. Fotogramas
que no son imagen dan 400, y si falta MediaPipe, 503. Probado por HTTP real con grabaciones de DeafApp: `carne`
(vertical, de celular) → `carne 0,72`, `pollo` → `pollo 0,58`, `cerdo` → `cerdo 0,30`, las tres en primer lugar; 0,6 a
2,3 s por clip de 30 fotogramas (incluye crear MediaPipe y subir 16 a 20 MB). La API corre en Python con TensorFlow:
para usarla desde la web publicada hay que alojarla en algún sitio (la web es estática) o llevar el modelo al
navegador.

Variables de entorno (todas opcionales):

| Variable | Qué hace |
|---|---|
| `LSCH_PUERTO` | puerto (por defecto 5000) |
| `LSCH_HOST` | `0.0.0.0` (por defecto) deja entrar a otros equipos de la red; `127.0.0.1` solo a este PC |
| `LSCH_CORS_ORIGINS` | webs que pueden llamar a la API desde el navegador, separadas por comas (por defecto cualquiera) |
| `LSCH_API_TOKEN` | exige el encabezado `X-API-Token` en los POST |
| `LSCH_RUTAS_PUBLICAS` | POST que no exigen el token aunque haya uno (por defecto `/clasificar`) |
| `LSCH_UMBRAL` | confianza mínima para dar `prediccion` (por defecto la de `preprocesado.json`, o 0,75) |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | otro proyecto de Supabase |

Sin `LSCH_API_TOKEN`, cualquiera con acceso a la red puede usar los POST: defínelo si la API se expone fuera de tu red
local. Una web estática no puede esconder un token (quedaría visible en su código), por eso `/clasificar`, que no
guarda nada y no tiene estado, es pública por defecto y el token protege lo que escribe o gasta (`/contribuir`,
`/predecir`).

### Servir la API desde tu PC (capstone)

La API necesita Python y TensorFlow, y la web publicada es estática, así que para el capstone el servidor es este PC.
`/clasificar` solo necesita MediaPipe y OpenCV cuando recibe fotogramas (con `training` o `secuencia`, no): si no están instalados, el servidor
arranca igual y solo `/predecir` responde 503 con un mensaje claro.

1. **Instalar** (una vez): `pip install -r requirements.txt`. El repositorio incluye el modelo entrenado
   (`modelo_lsch_lstm.keras`, `label_encoder.pkl`, `preprocesado.json`; validación cruzada 57 %). Para reentrenarlo:
   `py entrenar_modelo.py`.
2. **Arrancar**: doble clic en `iniciar_api.bat` (escucha en `127.0.0.1:5000` y deja pasar a la web publicada y a
   `localhost:8081`; las variables se editan al principio del archivo). Usa `waitress`, un servidor de verdad y apto
   para Windows. Para que otros dispositivos de tu red (un celular) entren, pon `LSCH_HOST=0.0.0.0`; Windows pedirá
   permiso en el firewall.
3. **Comprobar en local**: `py probar_api.py`. Hace lo que haría la web (`/estado`, CORS, `/clasificar` con una
   secuencia, una entrada inválida) y dice qué falla. Usa una secuencia del dataset de entrenamiento: prueba la
   conexión, no el acierto.
4. **Exponerla a la web con HTTPS**: la web va por HTTPS y el navegador bloquea llamadas a una API sin HTTPS.
   `iniciar_tunel.bat` abre un túnel de Cloudflare (`cloudflared`; `winget install --id Cloudflare.cloudflared` o la
   descarga oficial) y muestra una dirección `https://algo.trycloudflare.com`. Compruébala con
   `py probar_api.py --url https://algo.trycloudflare.com`.
5. **Llamarla desde la web** (la web aún no tiene una pantalla que lo haga):

   ```js
   const r = await fetch(`${API}/clasificar`, {method: "POST", headers: {"Content-Type": "application/json"},
                                               body: JSON.stringify({training})});   // el mismo bloque que guarda cada grabación
   const {candidatos} = await r.json();                                              // [{sena, confianza}, ...] (3 señas)
   ```

Límites de este arreglo: el PC tiene que estar encendido y con internet mientras se usa; la dirección de un túnel
rápido cambia cada vez que se reinicia (una fija exige una cuenta de Cloudflare con un dominio propio); y exponer un
PC a internet conviene hacerlo con `LSCH_HOST=127.0.0.1` y `LSCH_API_TOKEN` definido. Probado en este equipo por HTTP
real: token, CORS, `/predecir` con fotogramas, y 20 peticiones simultáneas a `/clasificar` (~49 ms de media). **No
probado**: el túnel de Cloudflare (no se abrió ningún túnel) ni el acceso desde otro dispositivo.

## Qué se midió

Los datos actuales son 19 palabras de alimentos × **5 tomas independientes de una sola persona** (la toma 1 y
la 2 son casi la misma: `seq_0000` ≈ `seq_0030`). Para medir sin engaños, cada pliegue deja fuera **una toma
completa de todas las palabras**. Azar con 19 clases: 5 %.

| Configuración | Exactitud con una toma nueva |
|---|---|
| LSTM, coordenadas crudas, sin aumento (el entrenador anterior, con datos limpios) | 28 % |
| LSTM, coordenadas crudas, con el aumento anterior | 34 % |
| LSTM, rasgos normalizados, sin aumento | 38 % |
| LSTM, rasgos normalizados + aumento sobre rasgos | 44 % |
| GRU pequeña, rasgos normalizados + aumento | 46 % |
| Conv1D pequeña, rasgos normalizados + aumento | 52 % |
| **`entrenar_modelo.py` actual** (Conv1D, 5 pliegues por grupos, 114 originales) | **57 %** |

(Los pasos intermedios son experimentos con 2 semillas y ~20 secuencias por pliegue: las diferencias pequeñas entre
filas contiguas están dentro del ruido; lo consistente es el orden general.)

* **La cifra que se reportaba antes (≈92 %) no era real.** Mezclaba originales y copias entre entrenamiento y
  prueba: el 88 % de las secuencias de prueba tenía una gemela casi idéntica en entrenamiento.
* **Corregir la relación de aspecto** (ver «Formato de datos») subió con otras personas de 3 a 4 aciertos de 6 (la
  confianza media, de 0,28 a 0,44). Son 6 grabaciones: un indicio, no una medida. Una de ellas es vertical (3:4).
* **El mismo gesto visto desde otro encuadre.** Con el mismo encuadre las coordenadas crudas y los rasgos
  aciertan ~50 %; si la persona está más cerca o más lejos, las coordenadas crudas caen a 22 % y 12 %, y los
  rasgos siguen en 49 %. Es lo que pasará con una persona nueva y otra cámara.
* **Con otras personas** (6 grabaciones de DeafApp de `carne`, `cerdo` y `pollo`): el modelo anterior acertó 0 de
  6, siempre «fideos» con 86–100 % de confianza; el actual acierta 3 de 6 y se muestra poco seguro (0,28). Son
  muy pocas grabaciones: sirve de indicio, no de medida.
* **La confianza no distingue aciertos de errores** (0,68 al acertar, 0,69 al fallar): ningún umbral filtra bien,
  y por eso el informe no calibra uno. En cambio **la seña correcta está entre las 3 primeras en el 89 %** de
  los casos (91 % entre las 5 primeras). Por eso `/predecir` ofrece `candidatos`.
* El aumento anterior no ayudaba: desplazaba las manos sin mover la cara (±0,04 de imagen son casi media cara,
  es decir, cambia «dónde está la mano»), y más copias empeoraban (13 % con 100 por clase).
* **Recortar el reposo de un clip no ayuda** (se probó y se descartó). En las 112 grabaciones de DeafApp la mano ya
  está en pantalla en el primer fotograma (66 %) y en el último (73 %), a la misma altura que durante la seña
  (mediana 2,4 caras bajo el centro de la cara frente a 2,7), y casi no hay fotogramas sin manos al principio ni al
  final (mediana 0). Recortar por movimiento empeoró un poco la recuperación de «misma palabra» (43 % → 36 %, dentro
  del ruido de 47 consultas), no cambió el resultado del modelo con otras personas (3 de 6) y cortaba el 75 % de los
  segmentos del propio dataset, que ya vienen recortados. Ni la presencia ni la posición de la mano separan «señando»
  de «reposo»; solo el movimiento lo hace un poco (0,04 frente a 0,14 caras por fotograma).

Por palabra (validación cruzada): `carne molida`, `porotos`, `pure` y `vianesa` 100 %; `aliño`, `pavo`,
`pescado` y `pollo` 17 %. Confusiones frecuentes: `pollo`↔`pescado`, `arroz`↔`fideos`, `sal`→`azucar`.

## Dataset anterior

El aumento anterior recortaba todas las coordenadas a [0, 1]. La profundidad z de MediaPipe es negativa para lo
cercano a la cámara, así que **551 de las 665 secuencias** (19 clases × 29 copias de la toma 1) tienen z = 0 donde
el original tenía profundidad. Además, esas copias parecen distintas de su original comparando los 270 valores
y por eso la «fuga 0 %» que se midió al principio era falsa: comparando solo x e y, 18 de 47 originales de
validación y prueba tenían una copia a distancia 0,006–0,013 en el entrenamiento.

El entrenamiento ya las ignora. `migrar_dataset.py` las mueve a `dataset_legado/` (sin borrar, reversible con
`--revertir`) y `calidad.py` las detecta. `augmentar_dataset.py` sigue disponible si quieres copias guardadas
(`--incluir-copias` en el entrenamiento), pero ya no hace falta.

## Límites y siguientes pasos

* **Datos**: una sola persona y 5 tomas por palabra. Es el límite principal: más personas y más repeticiones
  valen más que cualquier cambio de modelo. DeafApp tiene 112 grabaciones aprobadas en 85 etiquetas, casi todas
  con 1 o 2 ejemplos; solo `carne`, `cerdo` y `pollo` coinciden con estas 19 palabras.
* **Interpretación en vivo**: se entrena con segmentos de seña completos reescalados a 30 fotogramas, y `/predecir` y
  `reconocer.py` clasifican una ventana deslizante de 30 fotogramas sin saber cuándo empieza o termina la seña, y
  sin una clase «sin seña». Con una webcam no hay datos fiables para detectar el inicio y el fin automáticamente (ver
  «Recortar el reposo…»). Lo que encaja es **una seña por clip**, con inicio y fin marcados por la persona (cuenta
  atrás o botón, como la grabación de la web): `/clasificar`. Una interpretación continua de frases no está resuelta.
* **Vocabulario**: el modelo solo conoce 19 palabras de las 531 del catálogo; una palabra que no conoce recibe
  igualmente alguna de las 19 (aunque con poca confianza). Ampliarlo depende de tener grabaciones (ver
  `palabras_faltantes.py`).
* **Alojamiento**: la API necesita Python y TensorFlow; la web publicada es estática. Para el capstone la API corre en
  un PC con un túnel (ver «Servir la API desde tu PC»). A largo plazo la opción más sólida es ejecutar el modelo en el
  navegador (la red es diminuta y la web ya calcula allí los puntos), pero no está hecho: exige portar los rasgos y la
  red a JS y comprobar que dan lo mismo que Python.
* **Revisar a mano** los originales casi idénticos entre palabras distintas (aceite↔sal, aliño↔pescado,
  arroz↔fideos, carne↔cerdo, pescado↔pollo): probablemente segmentos con poca mano.

## Pruebas

```bash
py -m unittest discover -s tests -t .
```

No necesitan TensorFlow, MediaPipe, cámara ni red: la API, el importador y la preparación de datos se prueban
con dependencias simuladas.

## Qué contiene cada archivo

| Archivo | Rol |
|---|---|
| `formato.py` | dimensiones, índices de cara/pose, convención de imagen y corrección de la relación de aspecto |
| `rasgos.py`, `aumento_rasgos.py`, `preprocesado.py` | rasgos normalizados, aumento sobre rasgos y preprocesado compartido |
| `utils.py` | MediaPipe Holistic, extracción de los 270 valores y dibujo |
| `capturar_secuencias.py`, `reconocer.py` | captura y reconocimiento con cámara local |
| `etiquetar_video.py`, `replicar_etiquetas.py`, `extraer_senas.py` | dataset a partir de video: etiquetado manual, réplica de etiquetas en videos repetidos y extracción de los `.npy` |
| `importar_deafapp.py`, `convertir_deafapp.py`, `extractor_frames.py`, `config.py` | puente con DeafApp |
| `palabras_faltantes.py`, `catalogo_palabras.json`, `exportar_catalogo.cjs` | qué palabras necesitan más grabaciones y copia del catálogo de la web |
| `particion.py`, `datos_entrenamiento.py`, `entrenar_modelo.py`, `evaluar_modelo.py` | grupos y validación cruzada sin fuga, carga de datos, entrenamiento y evaluación |
| `calidad.py`, `migrar_dataset.py`, `augmentar_dataset.py` | revisión del dataset anterior y copias guardadas (opcional) |
| `api_flask.py`, `buffers.py`, `etiquetas.py` | API y validación de entradas |
| `iniciar_api.bat`, `iniciar_tunel.bat`, `probar_api.py` | arrancar la API en este PC, abrir el túnel HTTPS y comprobar que responde |
| `modelo_lsch_lstm.keras`, `label_encoder.pkl`, `preprocesado.json`, `informe_entrenamiento.json` | modelo entrenado y su informe (se regeneran con `entrenar_modelo.py`) |
