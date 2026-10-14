"""
convertir_deafapp.py — De una grabación de DeafApp a una secuencia (30, 270)
═════════════════════════════════════════════════════════════════════════════
Solo numpy y la biblioteca estándar: se puede probar sin MediaPipe ni cámara.

Una grabación de DeafApp (JSON guardado en Supabase Storage) trae:
  - frames: lista de imágenes JPEG en base64 (30 normalmente)
  - label, categoria, intervalMs
  - training (solo grabaciones nuevas, schema 2): puntos de cara y manos calculados en el
    navegador, en coordenadas del video sin voltear, con etiquetas de mano anatómicas.

Dos caminos hacia el MISMO formato:
  1. frames → MediaPipe Holistic del backend (extractor_frames.py). Es el camino por defecto:
     sirve para TODAS las grabaciones (antiguas y nuevas), usa un único detector y además
     calcula la pose, que la web no captura.
  2. training → secuencia_desde_puntos_web(): sin MediaPipe, pero solo para grabaciones nuevas
     y con la pose en ceros. Útil para comprobar o cuando MediaPipe no está disponible.
"""

from __future__ import annotations

import base64
import binascii

import numpy as np

from formato import (
    FACE_KEY_IDX, IDX_FACE, IDX_LH, IDX_RH, N_FEATURES, PUNTOS_MANO, SEQUENCE_LENGTH,
    ESPEJAR_ENTRADA, corregir_aspecto, espejar_secuencia,
)

MIN_FOTOGRAMAS = 10   # con menos, la seña no se puede normalizar a 30 fotogramas con sentido


def decodificar_frames(grabacion: dict) -> list[bytes]:
    """Devuelve los JPEG de la grabación como bytes. Acepta base64 con o sin prefijo data:."""
    salida: list[bytes] = []
    for frame in grabacion.get("frames") or []:
        if not isinstance(frame, str) or not frame:
            raise ValueError("La grabación trae un fotograma vacío o con formato inválido.")
        carga = frame.split(",", 1)[1] if frame.startswith("data:") else frame
        try:
            salida.append(base64.b64decode(carga, validate=True))
        except (binascii.Error, ValueError) as error:
            raise ValueError("Un fotograma no es base64 válido.") from error
    return salida


def remuestrear(vectores: list[np.ndarray], n: int = SEQUENCE_LENGTH) -> np.ndarray:
    """Normaliza cualquier cantidad de fotogramas a exactamente `n` (como extraer_senas.py)."""
    indices = np.linspace(0, len(vectores) - 1, n).round().astype(int)
    return np.stack([vectores[i] for i in indices]).astype(np.float32)


def secuencia_desde_vectores(vectores: list[np.ndarray]) -> np.ndarray:
    """Valida los vectores por fotograma (270,) y devuelve la secuencia (30, 270)."""
    if len(vectores) < MIN_FOTOGRAMAS:
        raise ValueError(f"Solo {len(vectores)} fotogramas; se necesitan al menos {MIN_FOTOGRAMAS}.")
    for v in vectores:
        if np.shape(v) != (N_FEATURES,):
            raise ValueError(f"Vector de forma {np.shape(v)}; se esperaba ({N_FEATURES},).")
    return remuestrear([np.asarray(v, dtype=np.float32) for v in vectores])


def porcentaje_con_manos(secuencia: np.ndarray) -> float:
    """Fracción de fotogramas con al menos una mano detectada."""
    rh = np.any(secuencia[:, IDX_RH[0]:IDX_RH[1]] != 0, axis=1)
    lh = np.any(secuencia[:, IDX_LH[0]:IDX_LH[1]] != 0, axis=1)
    return float(np.mean(rh | lh))


def _puntos(valor, cantidad: int) -> np.ndarray | None:
    if valor is None:
        return None
    arr = np.asarray(valor, dtype=np.float32)
    if arr.shape != (cantidad, 3) or not np.all(np.isfinite(arr)):
        raise ValueError(f"Puntos con forma {arr.shape}; se esperaba ({cantidad}, 3).")
    return arr


ASPECTO_WEB_POR_DEFECTO = 4 / 3     # lo que usa la web de DeafApp si la grabación no guarda frameAspectRatio


def aspecto_de_grabacion(grabacion: dict) -> float:
    """Relación ancho/alto con que se capturó una grabación de DeafApp (frameAspectRatio), o la de la web."""
    valor = grabacion.get("frameAspectRatio")
    return float(valor) if isinstance(valor, (int, float)) and not isinstance(valor, bool) and valor > 0 else ASPECTO_WEB_POR_DEFECTO


def secuencia_desde_puntos_web(training: dict, espejar: bool = ESPEJAR_ENTRADA,
                               aspecto: float | None = None) -> np.ndarray:
    """Convierte el bloque `training` de una grabación nueva en una secuencia (30, 270).

    Las etiquetas de mano de la web ya son anatómicas y las coordenadas son del video sin
    voltear, igual que Holistic sobre la imagen sin voltear: right → ranura 0, left → ranura 1,
    x sin cambios. La pose queda en ceros (la web no la captura).
    """
    if training.get("coordinateSystem") != "normalized-unmirrored-video":
        raise ValueError("Sistema de coordenadas desconocido; solo se admite video sin voltear.")
    if list(training.get("faceIndices") or []) != FACE_KEY_IDX:
        raise ValueError("Los índices de cara de la grabación no coinciden con los del backend.")
    muestras = training.get("samples") or []
    vectores = []
    for muestra in muestras:
        v = np.zeros(N_FEATURES, dtype=np.float32)
        derecha = _puntos(muestra.get("right"), PUNTOS_MANO)
        izquierda = _puntos(muestra.get("left"), PUNTOS_MANO)
        cara = _puntos(muestra.get("face"), len(FACE_KEY_IDX))
        if derecha is not None:
            v[IDX_RH[0]:IDX_RH[1]] = derecha.ravel()
        if izquierda is not None:
            v[IDX_LH[0]:IDX_LH[1]] = izquierda.ravel()
        if cara is not None:
            v[IDX_FACE[0]:IDX_FACE[1]] = cara.ravel()
        vectores.append(v)
    secuencia = secuencia_desde_vectores(vectores)
    if espejar:
        secuencia = espejar_secuencia(secuencia)         # primero el espejo (en el espacio de la captura)…
    return corregir_aspecto(secuencia, aspecto)          # …y después se lleva al formato de referencia 16:9
