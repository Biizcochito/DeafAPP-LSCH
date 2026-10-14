"""
calidad.py — Detección de secuencias dañadas por versiones antiguas del aumento de datos
══════════════════════════════════════════════════════════════════════════════════════════
La versión anterior de augmentar_dataset.py recortaba TODAS las coordenadas a [0, 1]. Pero la
profundidad z de MediaPipe es negativa para los puntos más cercanos a la cámara, así que cada
copia aumentada quedó con z = 0 en lugar de su valor real (y las manos ausentes recibían
ruido y se volvían «presentes»). En el dataset original eran 551 de 665 secuencias: ninguna
tenía un solo z negativo, mientras que las naturales tienen entre 60 % y 76 %.
"""

from __future__ import annotations

import numpy as np

UMBRAL_Z_NEGATIVO = 0.02   # menos que esto, con puntos presentes, es sospechoso


def _puntos_presentes(secuencia: np.ndarray) -> np.ndarray:
    puntos = np.asarray(secuencia, dtype=np.float32).reshape(secuencia.shape[0], -1, 3)
    return puntos[np.any(puntos != 0, axis=2)]


def proporcion_z_negativo(secuencia: np.ndarray) -> float:
    """Fracción de puntos presentes con z < 0 (nan si no hay puntos)."""
    presentes = _puntos_presentes(secuencia)
    return float(np.mean(presentes[:, 2] < 0)) if len(presentes) else float("nan")


def z_recortado(secuencia: np.ndarray, umbral: float = UMBRAL_Z_NEGATIVO) -> bool:
    """True si la secuencia tiene puntos pero ninguno (o casi) con z negativo: rasgo del recorte."""
    p = proporcion_z_negativo(secuencia)
    return bool(not np.isnan(p) and p < umbral)


def proporcion_sospechosas(X: np.ndarray) -> float:
    """Fracción de secuencias de X con z recortado."""
    if len(X) == 0:
        return 0.0
    return float(np.mean([z_recortado(s) for s in X]))
