"""
extractor_frames.py — Fotogramas JPEG → secuencia (30, 270) con el Holistic del backend
═══════════════════════════════════════════════════════════════════════════════════════
Es el mismo procesamiento que `extraer_senas.py` aplica a un video, pero partiendo de los
fotogramas que guarda DeafApp. Las importaciones pesadas (OpenCV, MediaPipe) están dentro de
la función para que el resto del puente se pueda probar sin ellas.
"""

from __future__ import annotations

import numpy as np

from convertir_deafapp import secuencia_desde_vectores
from formato import ESPEJAR_ENTRADA, N_FEATURES, corregir_aspecto


def _decodificar(cv2, datos: bytes, bandera):
    """cv2.imdecode, pero None (en vez de una excepción) si el búfer está vacío o dañado."""
    if not datos:
        return None
    try:
        return cv2.imdecode(np.frombuffer(datos, np.uint8), bandera)
    except cv2.error:
        return None


def extraer_secuencia(jpegs: list[bytes], intervalo_ms: int = 100, min_confianza: float = 0.5,
                      espejar: bool = ESPEJAR_ENTRADA) -> np.ndarray:
    """Procesa los fotogramas en orden con un detector nuevo (sin estado de otra grabación).

    `intervalo_ms` es el tiempo real entre fotogramas al grabar; se pasa como marca de tiempo
    para que el seguimiento de MediaPipe vea la misma cadencia que en la captura.
    `min_confianza` 0.5 es el valor que usa extraer_senas.py para video (el 0.7 de la cámara
    en vivo descarta demasiadas manos en imágenes comprimidas).
    """
    import cv2
    import utils

    # Antes de arrancar MediaPipe: si ningún fotograma se puede leer como imagen, es un error del cliente, no un clip
    # «sin manos». Se decodifica a 1/8 de tamaño (rápido y casi sin memoria) solo para comprobarlo.
    if not any(_decodificar(cv2, d, cv2.IMREAD_REDUCED_COLOR_8) is not None for d in jpegs):
        raise ValueError("Ningún fotograma se pudo leer como imagen.")

    holistic = utils.crear_holistic(min_confianza)
    vectores: list[np.ndarray] = []
    try:
        for i, datos in enumerate(jpegs):
            imagen = _decodificar(cv2, datos, cv2.IMREAD_COLOR)
            if imagen is None:
                vectores.append(np.zeros(N_FEATURES, dtype=np.float32))
                continue
            if espejar:
                imagen = cv2.flip(imagen, 1)
            rgb = cv2.cvtColor(imagen, cv2.COLOR_BGR2RGB)
            resultado = holistic.process(rgb, timestamp_ms=int(i * intervalo_ms))
            # La relación de aspecto sale del propio fotograma (las grabaciones antiguas no la guardan):
            # se convierte a lo que habría salido con una cámara 16:9, el formato del dataset.
            aspecto = imagen.shape[1] / imagen.shape[0]
            vectores.append(corregir_aspecto(utils.extraer_features(resultado), aspecto))
    finally:
        holistic.close()
    return secuencia_desde_vectores(vectores)
