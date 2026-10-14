"""
utils.py — Constantes y funciones compartidas del proyecto LSCh
════════════════════════════════════════════════════════════════
Importado por capturar_secuencias.py, entrenar_modelo.py y reconocer.py.
Centralizar aquí evita duplicar lógica entre scripts.
"""

from __future__ import annotations

import os
import time
import urllib.request
from pathlib import Path
from types import SimpleNamespace

import numpy as np
from mediapipe import Image, ImageFormat
from mediapipe.tasks.python import vision as mp_vision
from mediapipe.tasks.python.core.base_options import BaseOptions

# ── DIMENSIONES DEL TENSOR ─────────────────────────────────────────
# El formato (270 valores por fotograma, 30 fotogramas, los 42 puntos de cara y los 6 de pose)
# vive en formato.py, que no depende de MediaPipe: así lo comparten este módulo, las
# herramientas de importación, el aumento de datos y las pruebas.
from formato import (  # noqa: E402,F401
    FACE_KEY_IDX, N_FEATURES, POSE_KEY_IDX, SEQUENCE_LENGTH,
)

DATASET_PATH    : str = "dataset"
SEQ_TARGET      : int = 100      # objetivo de secuencias por clase

# ── MEDIAPIPE HOLISTIC (API Tasks — mediapipe >= 0.10.x) ────────────
# Desde mediapipe 0.10.x el paquete "mp.solutions" (API legacy) ya no
# se distribuye en todas las plataformas; Holistic solo está disponible
# vía la API Tasks (mediapipe.tasks.python.vision.HolisticLandmarker),
# que requiere un modelo .task descargado en disco.
_draw   = mp_vision.drawing_utils
_styles = mp_vision.drawing_styles

_HAND_CONNECTIONS = mp_vision.HandLandmarksConnections.HAND_CONNECTIONS
_FACE_CONTOURS    = mp_vision.FaceLandmarksConnections.FACE_LANDMARKS_CONTOURS
_POSE_CONNECTIONS = mp_vision.PoseLandmarksConnections.POSE_LANDMARKS

_MODEL_DIR  = Path(__file__).resolve().parent / "models"
# LSCH_MODELO_HOLISTIC permite usar un .task ya descargado en otra ruta (evita bajarlo de nuevo).
_MODEL_PATH = Path(os.environ.get("LSCH_MODELO_HOLISTIC") or _MODEL_DIR / "holistic_landmarker.task")
_MODEL_URL  = (
    "https://storage.googleapis.com/mediapipe-models/holistic_landmarker/"
    "holistic_landmarker/float16/latest/holistic_landmarker.task"
)


def _asegurar_modelo() -> str:
    """Descarga el modelo HolisticLandmarker (.task) si no está en disco."""
    if not _MODEL_PATH.exists():
        _MODEL_DIR.mkdir(parents=True, exist_ok=True)
        print(f"Descargando modelo HolisticLandmarker en {_MODEL_PATH} ...")
        urllib.request.urlretrieve(_MODEL_URL, _MODEL_PATH)
    return str(_MODEL_PATH)


class HolisticProcessor:
    """
    Envoltorio sobre HolisticLandmarker (API Tasks) que imita la interfaz
    `.process(frame_rgb) -> results` de la antigua `mp.solutions.holistic.Holistic`,
    para no tener que tocar los scripts que ya consumen `utils.crear_holistic()`.
    """

    def __init__(self, min_confidence: float = 0.7) -> None:
        options = mp_vision.HolisticLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=_asegurar_modelo()),
            running_mode=mp_vision.RunningMode.VIDEO,
            min_face_detection_confidence=min_confidence,
            min_face_landmarks_confidence=min_confidence,
            min_pose_detection_confidence=min_confidence,
            min_pose_landmarks_confidence=min_confidence,
            min_hand_landmarks_confidence=min_confidence,
        )
        self._landmarker = mp_vision.HolisticLandmarker.create_from_options(options)
        self._t0      = time.perf_counter()
        self._last_ts = -1

    def process(self, frame_rgb: np.ndarray, timestamp_ms: int | None = None) -> SimpleNamespace:
        """Detecta manos/cara/pose en un frame RGB (uint8, HxWx3).

        `timestamp_ms` es el instante del fotograma. Sin él se usa el reloj real (cámara en
        vivo); al reprocesar una grabación se pasa su tiempo de captura para que el
        seguimiento vea la misma cadencia que cuando se grabó.
        """
        mp_image = Image(image_format=ImageFormat.SRGB, data=frame_rgb)

        if timestamp_ms is None:
            timestamp_ms = int((time.perf_counter() - self._t0) * 1000)
        if timestamp_ms <= self._last_ts:
            timestamp_ms = self._last_ts + 1
        self._last_ts = timestamp_ms

        result = self._landmarker.detect_for_video(mp_image, timestamp_ms)
        return SimpleNamespace(
            right_hand_landmarks=result.right_hand_landmarks or None,
            left_hand_landmarks=result.left_hand_landmarks or None,
            face_landmarks=result.face_landmarks or None,
            pose_landmarks=result.pose_landmarks or None,
        )

    def close(self) -> None:
        self._landmarker.close()


def crear_holistic(min_confidence: float = 0.7) -> HolisticProcessor:
    """Inicializa MediaPipe Holistic (API Tasks) con los parámetros del proyecto."""
    return HolisticProcessor(min_confidence)


def extraer_features(results) -> np.ndarray:
    """
    Extrae y concatena los vectores de manos, cara y pose en un solo array.

    Si algún componente no está detectado → rellena con ceros (zero-padding).
    La LSTM aprende que un vector de ceros significa "componente ausente",
    lo que le permite manejar frames donde solo una mano es visible.

    Returns
    -------
    np.ndarray de shape (270,) y dtype float32.
    Orden: [mano_derecha(63) | mano_izq(63) | cara(126) | pose(18)]
    """
    # Mano derecha: (21, 3) → (63,)
    if results.right_hand_landmarks:
        rh = np.array(
            [[lm.x, lm.y, lm.z] for lm in results.right_hand_landmarks],
            dtype=np.float32,
        ).ravel()
    else:
        rh = np.zeros(63, dtype=np.float32)

    # Mano izquierda: (21, 3) → (63,)
    if results.left_hand_landmarks:
        lh = np.array(
            [[lm.x, lm.y, lm.z] for lm in results.left_hand_landmarks],
            dtype=np.float32,
        ).ravel()
    else:
        lh = np.zeros(63, dtype=np.float32)

    # Cara — selección de 40 landmarks → (40, 3) → (120,)
    if results.face_landmarks:
        lms  = results.face_landmarks
        face = np.array(
            [[lms[i].x, lms[i].y, lms[i].z] for i in FACE_KEY_IDX],
            dtype=np.float32,
        ).ravel()
    else:
       face = np.zeros(126, dtype=np.float32)

    # Pose — 6 landmarks clave → (6, 3) → (18,)
    if results.pose_landmarks:
        lms  = results.pose_landmarks
        pose = np.array(
            [[lms[i].x, lms[i].y, lms[i].z] for i in POSE_KEY_IDX],
            dtype=np.float32,
        ).ravel()
    else:
        pose = np.zeros(18, dtype=np.float32)

    return np.concatenate([rh, lh, face, pose])  # (270,)


def dibujar_holistic(frame: np.ndarray, results) -> np.ndarray:
    """Dibuja manos, cara y pose sobre el frame BGR."""
    # Mano derecha
    _draw.draw_landmarks(
        frame, results.right_hand_landmarks, _HAND_CONNECTIONS,
        _styles.get_default_hand_landmarks_style(),
        _styles.get_default_hand_connections_style(),
    )
    # Mano izquierda
    _draw.draw_landmarks(
        frame, results.left_hand_landmarks, _HAND_CONNECTIONS,
        _styles.get_default_hand_landmarks_style(),
        _styles.get_default_hand_connections_style(),
    )
    # Cara (solo contorno, para no saturar la imagen)
    _draw.draw_landmarks(
        frame,
        results.face_landmarks,
        _FACE_CONTOURS,
        landmark_drawing_spec=None,
        connection_drawing_spec=_styles.get_default_face_mesh_contours_style(),
    )
    # Pose (hombros, codos, muñecas)
    _draw.draw_landmarks(
        frame, results.pose_landmarks, _POSE_CONNECTIONS,
        landmark_drawing_spec=_styles.get_default_pose_landmarks_style(),
    )
    return frame

# Índice de cámara por defecto (0 = webcam integrada, 1 = externa)
CAMERA_INDEX_DEFAULT: int = 0
