"""
particion.py — Partición entrenamiento / validación / prueba SIN fuga de datos
═══════════════════════════════════════════════════════════════════════════════
Problema que resuelve: el dataset mezcla secuencias originales con copias aumentadas
(ruido, escala, traslación…) y repeticiones casi idénticas del mismo video. Si se reparte
al azar, una copia de una seña cae en entrenamiento y su gemela en prueba, y la «precisión»
mide memoria, no reconocimiento. En el dataset actual el 88 % de las secuencias de prueba
tenía un gemelo casi idéntico en entrenamiento.

Solución: cada secuencia pertenece a un GRUPO (un original, sus copias aumentadas y las
secuencias casi idénticas a él). Los grupos se reparten enteros: un grupo está en un solo
conjunto. Validación y prueba contienen solo secuencias ORIGINALES (nunca aumentadas).

Convención de nombres de archivo (ver augmentar_dataset.py):
    seq_0003.npy              original
    aug_seq_0003__07.npy      copia aumentada nº 7 de seq_0003
"""

from __future__ import annotations

import zlib
from collections import defaultdict
from pathlib import Path

import numpy as np

from formato import espejar_secuencia

PREFIJO_AUMENTADA = "aug_"
_SEPARADOR = "__"


def es_aumentada(nombre: str) -> bool:
    return Path(nombre).name.startswith(PREFIJO_AUMENTADA)


def origen_de(nombre: str) -> str:
    """'aug_seq_0003__07.npy' → 'seq_0003'; un original devuelve su propio nombre sin extensión."""
    stem = Path(nombre).stem
    if stem.startswith(PREFIJO_AUMENTADA):
        return stem[len(PREFIJO_AUMENTADA):].rsplit(_SEPARADOR, 1)[0]
    return stem


def nombre_aumentada(origen: str, k: int) -> str:
    return f"{PREFIJO_AUMENTADA}{origen}{_SEPARADOR}{k:02d}.npy"


class _Unir:
    def __init__(self, n: int) -> None:
        self.padre = list(range(n))

    def raiz(self, a: int) -> int:
        while self.padre[a] != a:
            self.padre[a] = self.padre[self.padre[a]]
            a = self.padre[a]
        return a

    def unir(self, a: int, b: int) -> None:
        self.padre[self.raiz(a)] = self.raiz(b)


def _xy(X) -> np.ndarray:
    """(N, 30, 270) → (N, 30*90*2): solo x e y de cada punto.

    La profundidad z queda fuera a propósito: las copias del aumento antiguo tenían z recortado a 0
    y por eso, comparando los 270 valores, no parecían copias de su original (medido: 18 de 47
    originales de validación/prueba tenían una copia a 0,006 a 0,013 en x e y, mientras que otro
    original de la misma clase queda a 0,03 o más).
    """
    X = np.asarray(X, dtype=np.float32)
    return X.reshape(X.shape[0], X.shape[1], -1, 3)[..., :2].reshape(X.shape[0], -1)


def _distancias(xy, xy_espejo, i, otros) -> np.ndarray:
    """Distancia media absoluta en x e y entre la secuencia i y las `otros`, también contra su espejo."""
    directa = np.mean(np.abs(xy[otros] - xy[i]), axis=1)
    espejada = np.mean(np.abs(xy[otros] - xy_espejo[i]), axis=1)
    return np.minimum(directa, espejada)


def construir_grupos(clases, nombres, X=None, umbral: float = 0.02) -> np.ndarray:
    """Asigna un id de grupo a cada secuencia.

    Se une (dentro de una misma clase): lo que comparte original (nombre) y, si se pasa X,
    lo que es casi idéntico en x e y (distancia media absoluta < umbral, incluso si una está
    espejada). Esto último atrapa repeticiones del mismo video y copias aumentadas sin marcar
    de datasets anteriores, aunque tengan z dañado.
    """
    clases = np.asarray(clases)
    n = len(clases)
    unir = _Unir(n)
    por_origen: dict[tuple[str, str], int] = {}
    for i in range(n):
        clave = (str(clases[i]), origen_de(nombres[i]))
        if clave in por_origen:
            unir.unir(i, por_origen[clave])
        else:
            por_origen[clave] = i
    if X is not None and umbral > 0:
        xy, xy_espejo = _xy(X), _xy(espejar_secuencia(X))
        for clase in sorted(set(clases.tolist())):
            idx = np.flatnonzero(clases == clase)
            for a in range(len(idx) - 1):
                resto = idx[a + 1:]
                d = _distancias(xy, xy_espejo, idx[a], resto)
                for j in resto[d < umbral]:
                    unir.unir(int(idx[a]), int(j))
    raices = {}
    return np.array([raices.setdefault(unir.raiz(i), len(raices)) for i in range(n)], dtype=int)


def dividir_por_grupos(clases, grupos, es_original, prop_prueba: float = 0.2,
                       prop_valid: float = 0.2, semilla: int = 42) -> dict:
    """Reparte grupos enteros en train / valid / test, estratificado por clase.

    Devuelve {'train','valid','test': índices ordenados, 'avisos': [str]}.
    Las copias aumentadas de grupos de valid/test se descartan por completo.
    """
    clases = np.asarray(clases)
    grupos = np.asarray(grupos)
    es_original = np.asarray(es_original, dtype=bool)
    train: list[int] = []
    valid: list[int] = []
    test: list[int] = []
    avisos: list[str] = []

    for clase in sorted(set(clases.tolist())):
        idx = np.flatnonzero(clases == clase)
        ids = sorted(set(grupos[idx].tolist()))
        miembros = {g: idx[grupos[idx] == g] for g in ids}
        elegibles = [g for g in ids if es_original[miembros[g]].any()]
        solo_copias = [g for g in ids if g not in elegibles]
        rng = np.random.default_rng([semilla, zlib.crc32(str(clase).encode("utf-8"))])
        rng.shuffle(elegibles)

        n = len(elegibles)
        valid_igual_prueba = False
        if n >= 3:
            n_test = max(1, round(n * prop_prueba))
            n_valid = max(1, round(n * prop_valid))
            while n_test + n_valid > n - 1:
                if n_valid > 1:
                    n_valid -= 1
                elif n_test > 1:
                    n_test -= 1
                else:
                    break
        elif n == 2:
            n_test, n_valid, valid_igual_prueba = 1, 0, True
            avisos.append(f"«{clase}»: solo 2 originales independientes; la validación reutiliza la prueba.")
        else:
            n_test = n_valid = 0
            avisos.append(f"«{clase}»: {n} original(es) independiente(s); sin prueba ni validación para esta clase.")

        g_test = elegibles[:n_test]
        g_valid = elegibles[n_test:n_test + n_valid]
        g_train = elegibles[n_test + n_valid:] + solo_copias
        for g in g_train:
            train.extend(miembros[g].tolist())
        for g in g_test:
            test.extend(i for i in miembros[g].tolist() if es_original[i])
        for g in g_valid:
            valid.extend(i for i in miembros[g].tolist() if es_original[i])
        if valid_igual_prueba:
            valid.extend(i for g in g_test for i in miembros[g].tolist() if es_original[i])

    return {"train": np.array(sorted(train), dtype=int), "valid": np.array(sorted(valid), dtype=int),
            "test": np.array(sorted(test), dtype=int), "avisos": avisos}


def proporcion_con_gemelo(X, clases, idx_a, idx_b, umbral: float = 0.02) -> float:
    """Fracción de las secuencias de `idx_b` que tienen una casi idéntica de su clase en `idx_a`.

    Mide la fuga: 0 es lo deseable entre entrenamiento y prueba. Compara solo x e y, también
    contra la versión espejada (ver _xy).
    """
    clases = np.asarray(clases)
    idx_a, idx_b = np.asarray(idx_a, dtype=int), np.asarray(idx_b, dtype=int)
    if len(idx_b) == 0:
        return 0.0
    xy, xy_espejo = _xy(X), _xy(espejar_secuencia(X))
    con = 0
    for j in idx_b:
        candidatos = idx_a[clases[idx_a] == clases[j]]
        if len(candidatos) and float(np.min(_distancias(xy, xy_espejo, j, candidatos))) < umbral:
            con += 1
    return con / len(idx_b)


def resumen_por_clase(clases, split: dict) -> dict[str, dict[str, int]]:
    clases = np.asarray(clases)
    salida: dict[str, dict[str, int]] = defaultdict(lambda: {"train": 0, "valid": 0, "test": 0})
    for conjunto in ("train", "valid", "test"):
        for i in split[conjunto]:
            salida[str(clases[i])][conjunto] += 1
    return dict(salida)


def pliegues_por_grupos(clases, grupos, es_original, k: int = 5, semilla: int = 42) -> list[dict]:
    """Validación cruzada estratificada por grupos: `k` pliegues, cada grupo en un solo conjunto.

    Con ~5 tomas independientes por seña esto equivale a «dejar fuera una toma» y usa TODOS los originales
    como prueba alguna vez (una partición única de 25 secuencias tiene un error de ±10 puntos).

    Devuelve una lista de k dicts {'train': índices, 'test': índices}. En cada pliegue:
      • la prueba son solo secuencias ORIGINALES de los grupos asignados a ese pliegue;
      • el entrenamiento son todos los miembros (originales y copias) de los demás grupos y los grupos
        formados solo por copias; las copias de un grupo de prueba no se usan.
    Si una clase tiene menos grupos que `k`, algunos pliegues no la prueban.
    """
    clases = np.asarray(clases)
    grupos = np.asarray(grupos)
    es_original = np.asarray(es_original, dtype=bool)
    if k < 2:
        raise ValueError("Se necesitan al menos 2 pliegues.")
    pliegue_de_grupo: dict[int, int] = {}
    for clase in sorted(set(clases.tolist())):
        idx = np.flatnonzero(clases == clase)
        elegibles = sorted({int(g) for g in grupos[idx[es_original[idx]]]})
        rng = np.random.default_rng([semilla, zlib.crc32(str(clase).encode("utf-8"))])
        rng.shuffle(elegibles)
        for posicion, g in enumerate(elegibles):
            pliegue_de_grupo[g] = posicion % k
    salida = []
    for f in range(k):
        en_prueba = {g for g, p in pliegue_de_grupo.items() if p == f}
        test = [i for i in range(len(clases)) if es_original[i] and int(grupos[i]) in en_prueba]
        train = [i for i in range(len(clases)) if int(grupos[i]) not in en_prueba]
        salida.append({"train": np.array(train, dtype=int), "test": np.array(test, dtype=int)})
    return salida
