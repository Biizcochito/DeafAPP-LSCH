"""Secuencias sintéticas con la forma de las reales (z de ambos signos, componentes ausentes en cero)."""
from __future__ import annotations

import numpy as np

# Bloques de 3 valores (x, y, z): mano derecha 0-20, izquierda 21-41, cara 42-83, pose 84-89.
RH, LH, CARA, POSE = slice(0, 21), slice(21, 42), slice(42, 84), slice(84, 90)


def secuencia_natural(semilla: int = 0, derecha: bool = True, izquierda: bool = False) -> np.ndarray:
    rng = np.random.default_rng(semilla)
    puntos = np.zeros((30, 90, 3), dtype=np.float32)

    def poblar(zona: slice, centro_z: float) -> None:
        n = zona.stop - zona.start
        base = rng.uniform(0.25, 0.75, (1, n, 2))
        movimiento = np.cumsum(rng.normal(0, 0.006, (30, 1, 2)), axis=0)
        puntos[:, zona, :2] = base + movimiento
        puntos[:, zona, 2] = rng.normal(centro_z, 0.04, (30, n))

    poblar(CARA, -0.01)
    poblar(POSE, -0.2)
    if derecha:
        poblar(RH, -0.05)
    if izquierda:
        poblar(LH, -0.05)
    return puntos.reshape(30, 270)


def secuencia_con_z_recortado(semilla: int = 0) -> np.ndarray:
    """Lo que producía el aumento antiguo: todo recortado a [0, 1], así que z nunca es negativo."""
    return np.clip(secuencia_natural(semilla), 0.0, 1.0).astype(np.float32)
