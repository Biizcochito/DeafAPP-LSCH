"""
rasgos.py — De los 270 valores crudos a rasgos que describen la seña y no el encuadre
═══════════════════════════════════════════════════════════════════════════════════════
Las secuencias guardan coordenadas de imagen: dónde está la persona, a qué distancia de la cámara y
si la mano existe (ceros). Eso domina las distancias y el modelo aprende el encuadre en vez de la
seña. Este módulo calcula, sobre las mismas secuencias (30, 270), rasgos invariantes a posición y
tamaño. No cambia el formato de los `.npy`: se aplica al cargar, al entrenar y al predecir.

Versiones (`version`):
  "crudo"       los 270 valores tal cual (comportamiento anterior)
  "centrado"    los mismos 270 valores con x, y, z relativos al centro y ancho de la cara
  "manos"       por mano: forma (21 puntos relativos a la muñeca y al tamaño de la palma), posición de la
                muñeca respecto a la cara y presencia; sin cara ni pose (128 valores por fotograma)
  "manos_mov"   "manos" más la velocidad de cada muñeca (134)

La CARA no es un rasgo: es la regla. Su centro y su ancho (pómulo a pómulo), medianos de la secuencia,
dan el origen y la unidad para medir dónde está cada mano (frente, boca, mentón, pecho) y quitan la
posición y el tamaño de la persona. Se usa la cara y no la pose porque siempre está disponible,
también en las grabaciones de DeafApp, que no traen pose. Los gestos de la cara (boca, cejas) se
descartan a propósito: medidos con validación por tomas, añadirlos empeoró el resultado.
"""

from __future__ import annotations

import numpy as np

from formato import FACE_KEY_IDX, IDX_FACE, IDX_LH, IDX_RH, N_FEATURES, SEQUENCE_LENGTH

VERSIONES = ("crudo", "centrado", "manos", "manos_mov")

_I_MEJ_IZQ = FACE_KEY_IDX.index(234)
_I_MEJ_DER = FACE_KEY_IDX.index(454)
_MIN_ESCALA = 1e-3
_PUNTOS_MANO = 21
_PALMA = 9                      # base del dedo medio: palma = distancia muñeca → este punto


def rellenar_huecos(X: np.ndarray, max_hueco: int = 4) -> np.ndarray:
    """Interpola linealmente las manos perdidas durante pocos fotogramas entre dos fotogramas con mano.

    MediaPipe pierde la mano un instante (desenfoque, oclusión): en el dataset, 52 de 114 originales
    tienen huecos dentro del tramo activo, y un hueco entra al modelo como un salto a cero. Solo se
    rellenan huecos de hasta `max_hueco` fotogramas con mano a ambos lados; los largos y los bordes
    quedan como están (ahí la mano de verdad no estaba).
    """
    P = _puntos(X).copy()
    if max_hueco <= 0:
        return P.reshape(P.shape[0], SEQUENCE_LENGTH, N_FEATURES)
    for zona in (IDX_RH, IDX_LH):
        a, b = zona[0] // 3, zona[1] // 3
        for n in range(P.shape[0]):
            mano = P[n, :, a:b, :]
            presente = np.any(mano != 0, axis=(1, 2))
            t = 0
            while t < SEQUENCE_LENGTH:
                if presente[t]:
                    t += 1
                    continue
                fin = t
                while fin < SEQUENCE_LENGTH and not presente[fin]:
                    fin += 1
                if t > 0 and fin < SEQUENCE_LENGTH and (fin - t) <= max_hueco:
                    for k in range(t, fin):
                        w = (k - (t - 1)) / (fin - (t - 1))
                        mano[k] = (1 - w) * mano[t - 1] + w * mano[fin]
                t = fin
    return P.reshape(P.shape[0], SEQUENCE_LENGTH, N_FEATURES)


def dimension(version: str) -> int:
    """Valores por fotograma de cada versión."""
    return {"crudo": N_FEATURES, "centrado": N_FEATURES, "manos": 128, "manos_mov": 134}[_validar(version)]


def _validar(version: str) -> str:
    if version not in VERSIONES:
        raise ValueError(f"Versión de rasgos desconocida: {version!r} (válidas: {', '.join(VERSIONES)})")
    return version


def _puntos(X: np.ndarray) -> np.ndarray:
    X = np.asarray(X, dtype=np.float32)
    if X.ndim == 2:
        X = X[None]
    if X.shape[1:] != (SEQUENCE_LENGTH, N_FEATURES):
        raise ValueError(f"Se esperaba (N, {SEQUENCE_LENGTH}, {N_FEATURES}) y llegó {X.shape}")
    return X.reshape(X.shape[0], SEQUENCE_LENGTH, -1, 3)


def _referencia(P: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Centro (N, 2) y escala (N,) de la cara de cada secuencia (mediana de los fotogramas con cara)."""
    cara = P[:, :, IDX_FACE[0] // 3:IDX_FACE[1] // 3, :]
    hay = np.any(cara != 0, axis=(2, 3))                                   # (N, T)
    centro_f = cara[..., :2].mean(axis=2)                                  # (N, T, 2)
    ancho_f = np.linalg.norm(cara[:, :, _I_MEJ_IZQ, :2] - cara[:, :, _I_MEJ_DER, :2], axis=-1)
    centros = np.zeros((P.shape[0], 2), dtype=np.float32)
    escalas = np.ones(P.shape[0], dtype=np.float32)
    for n in range(P.shape[0]):
        validos = hay[n] & (ancho_f[n] > _MIN_ESCALA)
        if validos.any():
            centros[n] = np.median(centro_f[n][validos], axis=0)
            escalas[n] = np.median(ancho_f[n][validos])
    return centros, escalas


def _centrado(P: np.ndarray) -> np.ndarray:
    centro, escala = _referencia(P)
    presente = np.any(P != 0, axis=-1)
    salida = P.copy()
    salida[..., :2] = (P[..., :2] - centro[:, None, None, :]) / escala[:, None, None, None]
    salida[..., 2] = P[..., 2] / escala[:, None, None]
    salida[~presente] = 0.0                                                # lo ausente sigue siendo cero
    return salida


def _manos(P: np.ndarray, con_movimiento: bool) -> np.ndarray:
    centro, escala = _referencia(P)
    N, T = P.shape[0], P.shape[1]
    bloques, munecas = [], []
    for zona in (IDX_RH, IDX_LH):
        mano = P[:, :, zona[0] // 3:zona[1] // 3, :]                       # (N, T, 21, 3)
        presente = np.any(mano != 0, axis=(2, 3))                          # (N, T)
        muneca = mano[:, :, 0, :]
        palma = np.linalg.norm(mano[:, :, _PALMA, :2] - muneca[:, :, :2], axis=-1)
        palma = np.where(presente & (palma > _MIN_ESCALA), palma, 1.0)
        forma = (mano[:, :, 1:, :] - muneca[:, :, None, :]) / palma[:, :, None, None]
        forma = np.where(presente[:, :, None, None], forma, 0.0).reshape(N, T, -1)        # 60
        pos = np.zeros((N, T, 3), dtype=np.float32)
        pos[..., :2] = (muneca[..., :2] - centro[:, None, :]) / escala[:, None, None]
        pos[..., 2] = muneca[..., 2] / escala[:, None]
        pos = np.where(presente[..., None], pos, 0.0)
        bloques.append(np.concatenate([forma, pos, presente[..., None].astype(np.float32)], axis=-1))   # 64
        munecas.append((pos, presente))
    salida = np.concatenate(bloques, axis=-1)                              # (N, T, 128)
    if con_movimiento:
        velocidades = []
        for pos, presente in munecas:
            vel = np.zeros_like(pos)
            ambos = presente[:, 1:] & presente[:, :-1]
            vel[:, 1:] = np.where(ambos[..., None], pos[:, 1:] - pos[:, :-1], 0.0)
            velocidades.append(vel)
        salida = np.concatenate([salida] + velocidades, axis=-1)           # + 6
    return salida.astype(np.float32)


def extraer_rasgos(X: np.ndarray, version: str = "manos", rellenar: int = 0) -> np.ndarray:
    """(N, 30, 270) o (30, 270) → (N, 30, dimension(version)). Una secuencia suelta devuelve (1, 30, d).

    `rellenar` > 0 interpola antes los huecos de detección de hasta ese número de fotogramas.
    """
    _validar(version)
    P = _puntos(rellenar_huecos(X, rellenar) if rellenar > 0 else X)
    if version == "crudo":
        return P.reshape(P.shape[0], SEQUENCE_LENGTH, N_FEATURES).copy()
    if version == "centrado":
        return _centrado(P).reshape(P.shape[0], SEQUENCE_LENGTH, N_FEATURES)
    return _manos(P, con_movimiento=(version == "manos_mov"))


def resumen_temporal(F: np.ndarray) -> np.ndarray:
    """(N, 30, d) → (N, 4*d): media de cada tercio de la secuencia y desviación total.

    Para modelos clásicos (vecinos, SVM, bosques) que no leen secuencias: conserva «qué pasa al
    principio, en medio y al final» sin depender del instante exacto de cada fotograma.
    """
    F = np.asarray(F, dtype=np.float32)
    tercios = np.array_split(np.arange(F.shape[1]), 3)
    return np.concatenate([F[:, t].mean(axis=1) for t in tercios] + [F.std(axis=1)], axis=1)
