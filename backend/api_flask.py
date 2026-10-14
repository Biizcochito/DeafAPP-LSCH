"""
api_flask.py — API Flask del sistema LSCh con Supabase
═══════════════════════════════════════════════════════
Endpoints:
    GET  /estado         → verifica que el servidor está activo
    POST /predecir       → recibe frames del celular, devuelve la seña
    POST /clasificar     → recibe los puntos de un clip completo (sin video) y devuelve la seña
    POST /contribuir     → guarda grabaciones nuevas (y las sube a Supabase)
    POST /limpiar_buffer → reinicia el buffer de un dispositivo

Variables de entorno (todas opcionales):
    LSCH_API_TOKEN       si se define, los POST exigen el encabezado  X-API-Token: <valor>
    LSCH_RUTAS_PUBLICAS  POST que no exigen el token aunque haya uno, separadas por comas (por defecto
                         /clasificar: una web estática no puede esconder un token y esa ruta no guarda nada)
    LSCH_CORS_ORIGINS    orígenes permitidos para navegadores, separados por comas (por defecto «*»)
    LSCH_HOST            0.0.0.0 (por defecto: también otros equipos de la red) o 127.0.0.1 (solo este PC)
    LSCH_PUERTO          puerto (por defecto 5000)
    LSCH_UMBRAL          confianza mínima para responder (por defecto la calibrada en preprocesado.json)
    SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY    ver config.py

La aplicación se arma con crear_app(...) recibiendo sus dependencias (modelo, MediaPipe,
Supabase). Así se prueba sin TensorFlow ni cámara (tests/test_api.py) y el servidor real solo
las conecta al final de este archivo.
"""

from __future__ import annotations

import base64
import binascii
import hmac
import logging
import os
from datetime import datetime
from typing import Callable, Optional, Sequence

import numpy as np
from flask import Flask, jsonify, request

from buffers import BuferesPorDispositivo, normalizar_device_id
from convertir_deafapp import ASPECTO_WEB_POR_DEFECTO, porcentaje_con_manos, secuencia_desde_puntos_web
from etiquetas import limpiar_etiqueta, ruta_segura
from formato import ESPEJAR_ENTRADA, N_FEATURES, SEQUENCE_LENGTH, corregir_aspecto

log = logging.getLogger("lsch.api")

UMBRAL_CONFIANZA = 0.75
MAX_CUERPO_BYTES = 6_000_000          # un frame JPEG en base64 cabe de sobra
MAX_FRAME_BYTES = 4_000_000
MAX_CUERPO_CLIP_BYTES = 32_000_000    # solo /clasificar con fotogramas
MAX_VALOR_ABS = 10.0                  # x, y, z normalizados: nada razonable pasa de esto
MIN_FOTOGRAMAS_CLIP = 10              # límites de /clasificar con fotogramas
MAX_FOTOGRAMAS_CLIP = 120
MIN_MANOS_CLIP = 0.3                  # con menos fotogramas con mano no se adivina nada
VERSION_API = "1.2"
RUTAS_PUBLICAS_POR_DEFECTO = ("/clasificar",)


class ServicioNoDisponible(RuntimeError):
    """Una parte opcional (por ejemplo MediaPipe) no está instalada o no arrancó: responde 503, no 500."""


def crear_app(
    *,
    clases: Sequence[str],
    predecir: Callable[[np.ndarray], np.ndarray],
    procesar_frame: Callable[[bytes], np.ndarray],
    subir_contribucion: Optional[Callable[[str, str, str], bool]] = None,
    token: Optional[str] = None,
    origenes_cors: Optional[str] = "*",
    carpeta_contribuciones: str = "contribuciones",
    umbral: float = UMBRAL_CONFIANZA,
    max_dispositivos: int = 200,
    rutas_publicas: Sequence[str] = RUTAS_PUBLICAS_POR_DEFECTO,
    procesar_clip: Optional[Callable[[list, int], np.ndarray]] = None,
) -> Flask:
    """
    clases               nombres de las clases, en el orden del LabelEncoder
    predecir(X)          X (1, 30, 270) float32 → probabilidades (n_clases,)
    procesar_frame(b)    bytes de una imagen → vector (270,); lanza ValueError si no es imagen y
                         ServicioNoDisponible si MediaPipe no está disponible (la API responde 503)
    subir_contribucion   (etiqueta, nombre_archivo, ruta_local) → True si se subió; opcional
    rutas_publicas       POST que NO exigen el token aunque haya uno: una web estática no puede esconder un
                         token (quedaría visible en su código), y /clasificar no guarda nada ni tiene estado
    procesar_clip(js, ms) lista de JPEG (bytes) y milisegundos entre fotogramas → secuencia (30, 270) en el formato
                         de referencia; lanza ValueError si no se puede usar y ServicioNoDisponible si falta
                         MediaPipe. Sin él, /clasificar no acepta fotogramas.
    """
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = MAX_CUERPO_BYTES
    buferes = BuferesPorDispositivo(SEQUENCE_LENGTH, max_dispositivos)

    if origenes_cors:
        try:
            from flask_cors import CORS
            CORS(app, origins=[o.strip() for o in origenes_cors.split(",") if o.strip()])
        except ImportError:                      # sin flask-cors el servidor sigue, solo sin CORS
            log.warning("flask-cors no está instalado: se omite CORS.")

    def _cuerpo_json() -> dict:
        datos = request.get_json(silent=True)
        return datos if isinstance(datos, dict) else {}

    def _aspecto(datos: dict, por_defecto: float | None) -> float | None:
        valor = datos.get("aspecto")
        if valor is None:
            return por_defecto
        if isinstance(valor, bool) or not isinstance(valor, (int, float)):
            raise ValueError("aspecto debe ser un número (ancho/alto de la cámara)")
        return float(valor)

    def _decodificar_base64(valor: object, maximo: int) -> bytes:
        if not isinstance(valor, str) or not valor:
            raise ValueError("vacío")
        if len(valor) > maximo * 4 // 3 + 8:
            raise ValueError("demasiado grande")
        try:
            return base64.b64decode(valor, validate=True)
        except (binascii.Error, ValueError):
            raise ValueError("base64 no válido") from None

    @app.before_request
    def _limite_por_ruta():
        # Un clip de 30 fotogramas puede pesar decenas de MB (las grabaciones antiguas de DeafApp: 16 a 20 MB);
        # el resto de rutas sigue con el límite pequeño.
        if request.path == "/clasificar":
            request.max_content_length = MAX_CUERPO_CLIP_BYTES

    @app.before_request
    def _exigir_token():
        if token and request.method == "POST" and request.path not in rutas_publicas and not request.path.startswith("/admin/training"):
            enviado = request.headers.get("X-API-Token", "")
            if not hmac.compare_digest(enviado.encode("utf-8"), token.encode("utf-8")):
                return jsonify({"error": "No autorizado"}), 401
        return None

    @app.errorhandler(413)
    def _demasiado_grande(_error):
        return jsonify({"error": "Solicitud demasiado grande"}), 413

    @app.errorhandler(ServicioNoDisponible)
    def _servicio_no_disponible(error):
        log.warning("Servicio no disponible: %s", error)
        return jsonify({"error": str(error)}), 503

    @app.errorhandler(Exception)
    def _error_inesperado(error):
        from werkzeug.exceptions import HTTPException
        if isinstance(error, HTTPException):
            return jsonify({"error": error.description}), error.code
        log.exception("Error no controlado")
        return jsonify({"error": "Error interno del servidor"}), 500

    # ── ENDPOINTS ──────────────────────────────────────────────────

    @app.route("/estado", methods=["GET"])
    def estado():
        return jsonify({
            "estado":   "activo",
            "clases":   list(clases),
            "supabase": subir_contribucion is not None,
            "version":  VERSION_API,
        })

    @app.route("/predecir", methods=["POST"])
    def _predecir():
        datos = _cuerpo_json()
        device_id = normalizar_device_id(datos.get("device_id", "default"))
        try:
            imagen = _decodificar_base64(datos.get("frame"), MAX_FRAME_BYTES)
        except ValueError as motivo:
            return jsonify({"error": f"Campo 'frame' no válido ({motivo})"}), 400

        try:
            vec = procesar_frame(imagen)
        except ValueError:
            return jsonify({"error": "Frame invalido"}), 400

        buffer = buferes.obtener(device_id)
        buffer.append(vec)
        n_frames = len(buffer)

        candidatos: list[dict] = []
        if n_frames == SEQUENCE_LENGTH:
            X = np.expand_dims(np.array(list(buffer), dtype=np.float32), axis=0)
            probs = np.asarray(predecir(X)).reshape(-1)
            # Las 3 señas más probables, siempre: con pocos datos la confianza no separa bien aciertos de
            # errores, y la seña correcta está entre las 3 primeras bastante más a menudo que de primera.
            candidatos = [{"sena": str(clases[i]), "confianza": round(float(probs[i]), 3)}
                          for i in np.argsort(-probs)[:3]]
            idx = int(np.argmax(probs))
            confianza = float(probs[idx])
            if confianza >= umbral:
                return jsonify({
                    "prediccion": str(clases[idx]),
                    "confianza":  round(confianza, 3),
                    "frames":     n_frames,
                    "candidatos": candidatos,
                })

        return jsonify({"prediccion": None, "confianza": 0.0, "frames": n_frames, "candidatos": candidatos})

    @app.route("/clasificar", methods=["POST"])
    def clasificar():
        """Traduce UNA seña a partir de un clip completo, sin estado ni ventana deslizante.

        Es el uso que encaja con cómo se entrenó el modelo (un segmento de seña = una secuencia de 30
        fotogramas) y con cómo graban la web y la app del celular. Una de tres entradas:
          {"frames": ["<b64 jpeg>", ...], "intervalo_ms": 100}
                                   los fotogramas tal como los captura la cámara (10 a 120); el servidor calcula
                                   los puntos con el mismo MediaPipe con que se armó el dataset. Es lo que usa
                                   la app del celular, que no calcula puntos. Cuerpo: hasta 32 MB (las demás
                                   rutas, 6 MB); conviene mandar fotogramas pequeños.
          {"training": {...}, "aspecto": 1.333}
                                   el bloque `training` que DeafApp guarda con cada grabación (puntos calculados
                                   en el navegador; sin video) y la relación ancho/alto de la cámara (4/3 si falta)
          {"secuencia": "<b64>", "aspecto": 1.778}
                                   float32 (30, 270) en el formato del proyecto; aspecto opcional (por defecto 16/9,
                                   la referencia, sin corrección)
        Responde con prediccion (si la confianza llega al umbral), confianza, las 3 señas más probables en
        `candidatos` y `manos`, la fracción de fotogramas con alguna mano. Si casi no se ven manos no se adivina
        nada: candidatos vacío y un `aviso`.
        """
        datos = _cuerpo_json()
        try:
            if isinstance(datos.get("frames"), list):
                fuente = "frames"
                frames = datos["frames"]
                if not (MIN_FOTOGRAMAS_CLIP <= len(frames) <= MAX_FOTOGRAMAS_CLIP):
                    raise ValueError(f"se esperan entre {MIN_FOTOGRAMAS_CLIP} y {MAX_FOTOGRAMAS_CLIP} fotogramas y llegaron {len(frames)}")
                intervalo = datos.get("intervalo_ms", 100)
                if isinstance(intervalo, bool) or not isinstance(intervalo, (int, float)) or not (30 <= intervalo <= 1000):
                    raise ValueError("intervalo_ms debe ser un número entre 30 y 1000")
                jpegs = [_decodificar_base64(f.split(",", 1)[1] if isinstance(f, str) and f.startswith("data:") else f, MAX_FRAME_BYTES)
                         for f in frames]
                if procesar_clip is None:
                    raise ServicioNoDisponible("Este servidor no procesa fotogramas; envía los puntos (training o secuencia).")
                secuencia = procesar_clip(jpegs, int(intervalo))
            elif isinstance(datos.get("training"), dict):
                fuente = "training"
                secuencia = secuencia_desde_puntos_web(datos["training"], aspecto=_aspecto(datos, ASPECTO_WEB_POR_DEFECTO))
            elif "secuencia" in datos:
                fuente = "secuencia"
                crudo = _decodificar_base64(datos["secuencia"], SEQUENCE_LENGTH * N_FEATURES * 4)
                if len(crudo) != SEQUENCE_LENGTH * N_FEATURES * 4:
                    raise ValueError(f"tamaño incorrecto: {len(crudo) // 4} valores")
                secuencia = np.frombuffer(crudo, dtype=np.float32).reshape(SEQUENCE_LENGTH, N_FEATURES)
                secuencia = corregir_aspecto(secuencia, _aspecto(datos, None))
            else:
                return jsonify({"error": "Falta 'frames', 'training' o 'secuencia'"}), 400
            if not np.all(np.isfinite(secuencia)) or float(np.max(np.abs(secuencia))) > MAX_VALOR_ABS:
                raise ValueError("valores fuera de rango")
        except ValueError as motivo:
            return jsonify({"error": f"Clip no válido ({motivo})"}), 400

        manos = porcentaje_con_manos(secuencia)
        respuesta = {"prediccion": None, "confianza": 0.0, "frames": SEQUENCE_LENGTH, "candidatos": [],
                     "manos": round(manos, 2), "fuente": fuente}
        if manos < MIN_MANOS_CLIP:
            respuesta["aviso"] = "No se detectaron manos en el clip. Muéstralas a la cámara, con buena luz, y vuelve a intentar."
            return jsonify(respuesta)
        probs = np.asarray(predecir(np.expand_dims(secuencia.astype(np.float32), axis=0))).reshape(-1)
        respuesta["candidatos"] = [{"sena": str(clases[i]), "confianza": round(float(probs[i]), 3)}
                                   for i in np.argsort(-probs)[:3]]
        idx = int(np.argmax(probs))
        confianza = float(probs[idx])
        if confianza >= umbral:
            respuesta.update(prediccion=str(clases[idx]), confianza=round(confianza, 3))
        return jsonify(respuesta)

    @app.route("/contribuir", methods=["POST"])
    def contribuir():
        datos = _cuerpo_json()
        etiqueta = limpiar_etiqueta(datos.get("label"))
        if etiqueta is None:
            return jsonify({"error": "Campo 'label' ausente o no válido"}), 400
        try:
            crudo = _decodificar_base64(datos.get("secuencia"), SEQUENCE_LENGTH * N_FEATURES * 4)
        except ValueError as motivo:
            return jsonify({"error": f"Campo 'secuencia' no válido ({motivo})"}), 400

        if len(crudo) != SEQUENCE_LENGTH * N_FEATURES * 4:
            return jsonify({"error": f"Tamano incorrecto: {len(crudo) // 4}"}), 400
        secuencia = np.frombuffer(crudo, dtype=np.float32).reshape(SEQUENCE_LENGTH, N_FEATURES)
        if not np.all(np.isfinite(secuencia)) or float(np.max(np.abs(secuencia))) > MAX_VALOR_ABS:
            return jsonify({"error": "La secuencia contiene valores fuera de rango"}), 400

        nombre = f"{etiqueta}_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}.npy"
        destino = ruta_segura(carpeta_contribuciones, etiqueta, nombre)
        destino.parent.mkdir(parents=True, exist_ok=True)
        np.save(destino, secuencia)

        subido = False
        if subir_contribucion is not None:
            try:
                subido = bool(subir_contribucion(etiqueta, nombre, str(destino)))
            except Exception:                    # Supabase caído no debe perder la contribución local
                log.exception("No se pudo subir la contribución a Supabase")

        return jsonify({
            "exito":    True,
            "mensaje":  f'Contribucion guardada para "{etiqueta}"',
            "supabase": subido,
        })

    @app.route("/limpiar_buffer", methods=["POST"])
    def limpiar_buffer():
        buferes.limpiar(normalizar_device_id(_cuerpo_json().get("device_id", "default")))
        return jsonify({"exito": True})

    return app


# ── CONEXIÓN CON LAS PIEZAS REALES ─────────────────────────────────

def _conectar_supabase():
    """Devuelve subir_contribucion o None si Supabase no está disponible."""
    try:
        from supabase import create_client
        import config
        cliente = create_client(config.SUPABASE_URL, config.SUPABASE_KEY)
    except Exception as error:
        print(f"  Supabase no disponible: {error}")
        return None
    print("  Supabase conectado ✓")

    def subir(etiqueta: str, nombre: str, ruta_local: str) -> bool:
        with open(ruta_local, "rb") as f:
            cliente.storage.from_("contribuciones").upload(f"contribuciones/{etiqueta}/{nombre}", f)
        cliente.table("contribuciones").insert({
            "label": etiqueta, "archivo": nombre, "timestamp": datetime.now().isoformat(),
        }).execute()
        return True

    return subir


def _crear_desde_recursos() -> Flask:
    import pickle
    import threading

    from tensorflow import keras

    from preprocesado import Preprocesador

    print("Cargando modelo...")
    modelo = keras.models.load_model("modelo_lsch_lstm.keras")
    with open("label_encoder.pkl", "rb") as f:
        encoder = pickle.load(f)
    clases = [str(c) for c in encoder.classes_]
    preproc = Preprocesador.cargar(".")               # el mismo que usó el entrenamiento (o el heredado, crudo)
    if tuple(modelo.input_shape[1:]) != (SEQUENCE_LENGTH, preproc.dimension):
        raise SystemExit(
            f"El modelo espera {modelo.input_shape[1:]} y su preprocesado entrega {(SEQUENCE_LENGTH, preproc.dimension)}. "
            "¿Falta preprocesado.json junto al modelo? Reentrena con entrenar_modelo.py."
        )
    if modelo.output_shape[-1] != len(clases):
        raise SystemExit("El modelo y label_encoder.pkl no corresponden (distinto número de clases). Reentrena.")
    print(f"  Modelo listo. Clases: {clases}")

    candado_holistic = threading.Lock()
    candado_modelo = threading.Lock()
    mediapipe: dict = {}                         # se crea la primera vez que llega un fotograma

    def procesar_frame(imagen: bytes) -> np.ndarray:
        # MediaPipe y OpenCV solo hacen falta para /predecir (fotogramas). /clasificar recibe puntos ya
        # calculados, así que el servidor arranca y responde aunque no estén instalados.
        with candado_holistic:
            if not mediapipe:
                try:
                    import cv2
                    from utils import crear_holistic, extraer_features
                    mediapipe.update(cv2=cv2, extraer=extraer_features, holistic=crear_holistic(min_confidence=0.7))
                except Exception as error:
                    raise ServicioNoDisponible(
                        "El procesamiento de fotogramas necesita MediaPipe y OpenCV "
                        f"(pip install -r requirements.txt): {error}") from error
            cv2 = mediapipe["cv2"]
            frame = cv2.imdecode(np.frombuffer(imagen, dtype=np.uint8), cv2.IMREAD_COLOR)
            if frame is None:
                raise ValueError("no es una imagen")
            if ESPEJAR_ENTRADA:
                frame = cv2.flip(frame, 1)
            resultados = mediapipe["holistic"].process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
            # al formato de referencia 16:9 (el del dataset), según la proporción real del fotograma
            return corregir_aspecto(mediapipe["extraer"](resultados), frame.shape[1] / frame.shape[0])

    cupo_clips = threading.Semaphore(2)          # cada clip crea su propio MediaPipe: se limitan los simultáneos

    def procesar_clip(jpegs: list, intervalo_ms: int) -> np.ndarray:
        try:
            from extractor_frames import extraer_secuencia
        except ImportError as error:
            raise ServicioNoDisponible(f"El procesamiento de fotogramas necesita MediaPipe y OpenCV: {error}") from error
        with cupo_clips:
            try:
                return extraer_secuencia(jpegs, intervalo_ms, 0.5)
            except ImportError as error:
                raise ServicioNoDisponible(f"El procesamiento de fotogramas necesita MediaPipe y OpenCV: {error}") from error

    def predecir(X: np.ndarray) -> np.ndarray:
        entrada = preproc.transformar(X)         # (1, 30, 270) crudo → lo que el modelo vio al entrenar
        with candado_modelo:                     # Keras no garantiza seguridad entre hilos
            return modelo(entrada, training=False).numpy()[0]

    token = os.environ.get("LSCH_API_TOKEN") or None
    if token is None:
        print("  Aviso: LSCH_API_TOKEN no está definido; cualquiera con acceso a la red puede usar los POST.")
    umbral = float(os.environ.get("LSCH_UMBRAL") or preproc.umbral or UMBRAL_CONFIANZA)
    print(f"  Preprocesado: {preproc.version}" + (" (heredado)" if preproc.es_heredado else "") + f"  |  umbral de confianza: {umbral}")
    publicas = os.environ.get("LSCH_RUTAS_PUBLICAS")
    rutas_publicas = RUTAS_PUBLICAS_POR_DEFECTO if publicas is None else tuple(r.strip() for r in publicas.split(",") if r.strip())
    if token:
        print(f"  Token exigido en los POST salvo en: {', '.join(rutas_publicas) or 'ninguna ruta'}")
    return crear_app(
        clases=clases, predecir=predecir, procesar_frame=procesar_frame,
        subir_contribucion=_conectar_supabase(), token=token, umbral=umbral,
        origenes_cors=os.environ.get("LSCH_CORS_ORIGINS", "*"), rutas_publicas=rutas_publicas,
        procesar_clip=procesar_clip,
    )


if __name__ == "__main__":
    puerto = int(os.environ.get("LSCH_PUERTO", "5000"))
    # 0.0.0.0 deja entrar a otros dispositivos de la red (celulares); 127.0.0.1 solo a este PC, que es lo
    # que conviene detrás de un túnel (el túnel conecta desde el propio equipo).
    host = os.environ.get("LSCH_HOST", "0.0.0.0")
    app = _crear_desde_recursos()
    print("\n" + "=" * 55)
    print("  API LSCh activa")
    print("=" * 55)
    print(f"  URL local    : http://localhost:{puerto}")
    if host == "0.0.0.0":
        print(f"  URL red local: http://<tu-ip>:{puerto}")
    print("\n  Endpoints:")
    print("    GET  /estado")
    print("    POST /clasificar      (un clip → las 3 señas más probables)")
    print("    POST /predecir")
    print("    POST /contribuir")
    print("    POST /limpiar_buffer")
    print("=" * 55 + "\n")
    try:
        from waitress import serve               # servidor de verdad (y apto para Windows) en vez del de desarrollo
    except ImportError:
        print("  (waitress no está instalado: se usa el servidor de desarrollo de Flask)")
        app.run(host=host, port=puerto, debug=False, threaded=True)
    else:
        serve(app, host=host, port=puerto, threads=8)
