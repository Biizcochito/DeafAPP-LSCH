"""
aumento_rasgos.py — Aumento de datos sobre los rasgos normalizados (versión "manos")
═════════════════════════════════════════════════════════════════════════════════════
Se aplica al vuelo, solo a las secuencias de ENTRENAMIENTO, después de partir el dataset: por
construcción no puede filtrar copias de una secuencia de prueba al entrenamiento, y no hace falta
guardar copias en disco ni migrar nada.

Por qué sobre rasgos y no sobre las coordenadas crudas: las magnitudes tienen sentido físico. En
coordenadas de imagen, desplazar las manos ±0,04 sin mover la cara equivale a casi media anchura de
cara, es decir, cambia «dónde está la mano respecto a la cara» (frente, boca, mentón), que es parte de
la seña. Aquí los desplazamientos se miden en anchos de cara y las deformaciones de la mano en
unidades de palma.

Diseño de los 128 valores por fotograma de "manos" (ver rasgos.py), por mano:
    0-59   forma: 20 puntos (x, y, z) relativos a la muñeca, en unidades de palma
    60-62  posición de la muñeca (x, y, z) respecto a la cara, en anchos de cara
    63     presencia (0 o 1)
La mano derecha ocupa 0-63 y la izquierda 64-127.
"""

from __future__ import annotations

import numpy as np

_MANO = 64
_FORMA = 60
_POS = slice(60, 63)
_PRESENCIA = 63


def _manos(F: np.ndarray):
    return (F[:, :_MANO], F[:, _MANO:2 * _MANO])


def espejar(F: np.ndarray) -> np.ndarray:
    """Intercambia mano derecha e izquierda y refleja x (forma y posición): el mismo gesto de un zurdo."""
    F = np.asarray(F, dtype=np.float32).copy()
    T = F.shape[0]
    derecha, izquierda = F[:, :_MANO].copy(), F[:, _MANO:2 * _MANO].copy()
    for bloque in (derecha, izquierda):
        forma = bloque[:, :_FORMA].reshape(T, 20, 3)
        forma[..., 0] *= -1.0
        bloque[:, 60] *= -1.0
        bloque[:, :_FORMA] = forma.reshape(T, _FORMA)
    F[:, :_MANO], F[:, _MANO:2 * _MANO] = izquierda, derecha
    return F


def aumentar(F: np.ndarray, rng: np.random.Generator, espejo: float = 0.2) -> np.ndarray:
    """Una variación de una secuencia de rasgos "manos" (30, 128). No modifica la entrada.

    Técnicas, cada una con su propia probabilidad:
      • recorte y estiramiento en el tiempo (gesto más rápido o con otro encuadre temporal)
      • rotación en el plano (cámara ladeada, mano girada) de la forma y de la posición
      • desplazamiento y escala global de la posición de las manos (otra persona, otro brazo)
      • ruido en la forma (±0,02 palmas) y en la posición (±0,015 caras)
      • pérdida de 1 a 3 fotogramas de la mano (fallos de detección)
      • espejo (firmante zurdo): intercambia manos y refleja x
    Lo ausente (presencia 0) sigue en ceros.
    """
    F = np.asarray(F, dtype=np.float32).copy()
    T = F.shape[0]

    # tiempo
    if rng.random() < 0.7:
        largo = int(rng.integers(int(0.8 * T), T + 1))
        inicio = int(rng.integers(0, T - largo + 1))
        F = F[np.linspace(inicio, inicio + largo - 1, T).round().astype(int)]

    manos = _manos(F)
    theta = np.deg2rad(rng.normal(0.0, 7.0)) if rng.random() < 0.7 else 0.0
    c, s = np.cos(theta), np.sin(theta)
    desplazamiento = rng.normal(0.0, 0.08, 2) if rng.random() < 0.7 else np.zeros(2)
    escala_pos = rng.uniform(0.9, 1.1) if rng.random() < 0.5 else 1.0

    for mano in manos:
        presente = mano[:, _PRESENCIA] > 0.5
        forma = mano[:, :_FORMA].reshape(T, 20, 3)
        pos = mano[:, _POS]
        # rotación en el plano (x, y)
        x, y = forma[..., 0].copy(), forma[..., 1].copy()
        forma[..., 0], forma[..., 1] = c * x - s * y, s * x + c * y
        px, py = pos[:, 0].copy(), pos[:, 1].copy()
        pos[:, 0], pos[:, 1] = c * px - s * py, s * px + c * py
        # posición: escala y desplazamiento globales
        pos[:, :2] = pos[:, :2] * escala_pos + desplazamiento
        # ruido
        forma += rng.normal(0.0, 0.02, forma.shape).astype(np.float32)
        pos += rng.normal(0.0, 0.015, pos.shape).astype(np.float32)
        # lo ausente se queda en cero
        forma[~presente] = 0.0
        pos[~presente] = 0.0
        mano[:, :_FORMA] = forma.reshape(T, _FORMA)
        mano[:, _POS] = pos

    # fotogramas perdidos
    if rng.random() < 0.3:
        for t in rng.choice(T, size=int(rng.integers(1, 4)), replace=False):
            F[t, :_MANO] = 0.0
            F[t, _MANO:] = 0.0

    if rng.random() < espejo:
        F = espejar(F)

    return F.astype(np.float32)


def aumentar_lote(F: np.ndarray, y: np.ndarray, copias: int, semilla: int = 0, espejo: float = 0.2):
    """Devuelve (F, y) con los originales y `copias` variaciones de cada uno (orden: originales primero)."""
    rng = np.random.default_rng(semilla)
    nuevos, etiquetas = [F], [y]
    for _ in range(copias):
        nuevos.append(np.stack([aumentar(f, rng, espejo) for f in F]))
        etiquetas.append(y)
    return np.concatenate(nuevos), np.concatenate(etiquetas)
