"""
formato.py — Formato de datos del proyecto LSCh (fuente única)
═══════════════════════════════════════════════════════════════
No depende de MediaPipe ni de TensorFlow, así que lo comparten `utils.py`, las
herramientas de importación, el aumento de datos y las pruebas.

Cada fotograma es un vector de 270 valores (x, y, z normalizados):

    [ mano derecha 63 | mano izquierda 63 | cara 126 | pose 18 ]

y una secuencia son SEQUENCE_LENGTH (30) fotogramas: un array (30, 270) float32.
Un bloque de ceros significa «componente no detectado».
"""

from __future__ import annotations

import numpy as np

SEQUENCE_LENGTH: int = 30     # T — fotogramas por secuencia
PUNTOS_MANO:     int = 21

# De los 468 puntos del Face Mesh de MediaPipe se usan 42 que codifican los marcadores
# no manuales relevantes en LSCh: cejas, ojos, nariz, boca, mejillas, frente y mentón.
# Son exactamente los mismos que guarda la web de DeafApp (faceIndices).
FACE_KEY_IDX: list[int] = [
    70, 63, 105, 66, 107,
    336, 296, 334, 293, 300,
    33, 160, 158, 133, 153, 144,
    362, 385, 387, 263, 373, 380,
    1, 2, 98, 327,
    61, 291, 0, 17, 39, 269,
    78, 308, 14, 317,
    234, 454,
    10, 338, 152, 175,
]

# Solo hombros, codos y muñecas (contexto postural de la seña).
POSE_KEY_IDX: list[int] = [11, 12, 13, 14, 15, 16]

_COORDS = 3
N_MANO: int = PUNTOS_MANO * _COORDS              # 63
N_CARA: int = len(FACE_KEY_IDX) * _COORDS        # 126
N_POSE: int = len(POSE_KEY_IDX) * _COORDS        # 18
N_FEATURES: int = 2 * N_MANO + N_CARA + N_POSE   # 270

IDX_RH   = (0, N_MANO)
IDX_LH   = (N_MANO, 2 * N_MANO)
IDX_FACE = (2 * N_MANO, 2 * N_MANO + N_CARA)
IDX_POSE = (2 * N_MANO + N_CARA, N_FEATURES)

# ── CONVENCIÓN DE IMAGEN ───────────────────────────────────────────
# False: los puntos se calculan sobre la imagen SIN voltear, tal como llega de la cámara o
#        del video. Es la convención del video con el que se creó el dataset
#        (extraer_senas.py), de las grabaciones de DeafApp y de la API.
#        Medido con una grabación real: sobre la misma imagen, la mano que MediaPipe Holistic
#        llama «derecha» cae en la ranura 0 con la misma x que calcula la web, y la
#        «izquierda» en la ranura 1.
# True:  se voltea la imagen antes de procesarla (efecto espejo). Intercambia las manos y
#        refleja la x, así que NO debe mezclarse con datos creados con False.
# El espejo para mostrar la imagen al usuario se hace siempre DESPUÉS de calcular los puntos.
ESPEJAR_ENTRADA: bool = False


# ── RELACIÓN DE ASPECTO ────────────────────────────────────────────
# Los puntos de MediaPipe son x/ancho e y/alto de la imagen, así que la MISMA escena vista por una cámara de otra
# proporción llega con x e y a escalas distintas y la forma de la mano se deforma. Medido con la validación por
# tomas: 49 % de acierto con 16:9 (el dataset), 47 % con 4:3, 39 % con 3:4 y 33 % con 9:16 (celular en vertical).
# El dataset es video 16:9, así que ese es el formato de REFERENCIA: todo lo que entra (importador, API, cámara) se
# convierte a «lo que habría salido con una cámara 16:9» y los `.npy` siguen siendo homogéneos. Con aspecto 16:9
# la corrección no hace nada, por eso el modelo y el dataset actuales no cambian.
ASPECTO_REFERENCIA: float = 16 / 9
ASPECTO_MIN, ASPECTO_MAX = 0.2, 5.0


def corregir_aspecto(seq: np.ndarray, aspecto: float | None) -> np.ndarray:
    """Convierte puntos capturados con una cámara de relación ancho/alto `aspecto` al formato de referencia (16:9).

    x_norm = x_en_unidades_de_alto / aspecto  →  x_referencia = x_norm * aspecto / ASPECTO_REFERENCIA. z se escala
    igual que x (en MediaPipe z usa la escala de x). Solo toca los puntos presentes: lo ausente sigue en ceros.
    Acepta cualquier forma (…, 270). `aspecto` None o la referencia devuelven una copia sin cambios.
    """
    seq = np.asarray(seq, dtype=np.float32)
    if aspecto is None:
        return seq.copy()
    if not np.isfinite(aspecto) or not (ASPECTO_MIN <= aspecto <= ASPECTO_MAX):
        raise ValueError(f"Relación de aspecto no válida: {aspecto!r} (entre {ASPECTO_MIN} y {ASPECTO_MAX}).")
    factor = float(aspecto) / ASPECTO_REFERENCIA
    if abs(factor - 1.0) < 1e-9:
        return seq.copy()
    out = seq.copy()
    puntos = out.reshape(*out.shape[:-1], -1, _COORDS)
    presente = np.any(puntos != 0, axis=-1)
    puntos[..., 0] = np.where(presente, puntos[..., 0] * factor, 0.0)
    puntos[..., 2] = np.where(presente, puntos[..., 2] * factor, 0.0)
    return out


def espejar_secuencia(seq: np.ndarray) -> np.ndarray:
    """Equivale a haber volteado la imagen: x → 1 − x e intercambia mano derecha/izquierda.

    Solo toca los puntos presentes: un componente ausente (ceros) se queda ausente en lugar
    de convertirse en x = 1.
    """
    seq = np.asarray(seq, dtype=np.float32)
    out = seq.copy()
    for inicio in range(0, seq.shape[-1], _COORDS):
        bloque = out[..., inicio:inicio + _COORDS]
        presente = np.any(bloque != 0, axis=-1)
        bloque[..., 0] = np.where(presente, 1.0 - bloque[..., 0], 0.0)
    rh = out[..., IDX_RH[0]:IDX_RH[1]].copy()
    lh = out[..., IDX_LH[0]:IDX_LH[1]].copy()
    out[..., IDX_RH[0]:IDX_RH[1]] = lh
    out[..., IDX_LH[0]:IDX_LH[1]] = rh
    return out
