"""
datos_entrenamiento.py — Carga del dataset, partición sin fuga y métricas
═══════════════════════════════════════════════════════════════════════════
Todo lo que entrenar_modelo.py necesita ANTES de tocar TensorFlow. Vive aparte para poder
probarlo sin instalar TensorFlow (ver tests/test_datos_entrenamiento.py).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from aumento_rasgos import aumentar_lote
from calidad import z_recortado
from formato import N_FEATURES, SEQUENCE_LENGTH
from preprocesado import Preprocesador
from particion import (
    construir_grupos, dividir_por_grupos, es_aumentada, proporcion_con_gemelo, resumen_por_clase,
)


@dataclass
class Dataset:
    X: np.ndarray                        # (N, 30, 270) float32
    y: np.ndarray                        # (N,) etiquetas de texto
    nombres: list[str]                   # nombre de archivo de cada secuencia
    es_original: np.ndarray              # (N,) bool: ni aumentada marcada ni dañada
    danada: np.ndarray | None = None     # (N,) bool: copia antigua sin marcar, con z recortado
    ignorados: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        if self.danada is None:
            self.danada = np.zeros(len(self.y), dtype=bool)

    def __len__(self) -> int:
        return len(self.y)

    def subconjunto(self, mascara) -> "Dataset":
        mascara = np.asarray(mascara, dtype=bool)
        return Dataset(self.X[mascara], self.y[mascara], [n for n, m in zip(self.nombres, mascara) if m],
                       self.es_original[mascara], self.danada[mascara], self.ignorados)

    def sin_danadas(self) -> tuple["Dataset", int]:
        """Quita las copias antiguas con z recortado. Devuelve (dataset, cuántas quitó)."""
        quitar = int(self.danada.sum())
        return (self.subconjunto(~self.danada) if quitar else self), quitar


MIN_ORIGINALES = 3      # con menos no hay entrenamiento, validación y prueba independientes


def cargar_dataset(raiz: str | Path) -> Dataset:
    """Lee dataset/<clase>/*.npy. Ignora carpetas que empiezan por «_» o «.» y formas distintas de (30, 270)."""
    raiz = Path(raiz)
    if not raiz.is_dir():
        raise FileNotFoundError(f"No existe la carpeta del dataset: {raiz}")
    secuencias: list[np.ndarray] = []
    etiquetas: list[str] = []
    nombres: list[str] = []
    ignorados: list[str] = []
    for carpeta in sorted(d for d in raiz.iterdir() if d.is_dir() and not d.name.startswith(("_", "."))):
        for archivo in sorted(carpeta.glob("*.npy")):
            try:
                seq = np.load(archivo, allow_pickle=False)
            except Exception as error:               # archivo dañado: se anota y se sigue
                ignorados.append(f"{carpeta.name}/{archivo.name}: {error}")
                continue
            if seq.shape != (SEQUENCE_LENGTH, N_FEATURES) or not np.all(np.isfinite(seq)):
                ignorados.append(f"{carpeta.name}/{archivo.name}: forma {seq.shape} o valores no finitos")
                continue
            secuencias.append(seq.astype(np.float32))
            etiquetas.append(carpeta.name)
            nombres.append(archivo.name)
    if not secuencias:
        raise RuntimeError(f"No hay secuencias válidas en '{raiz}'. Captura, importa o aumenta primero.")
    X = np.stack(secuencias)
    sin_marca = np.array([not es_aumentada(n) for n in nombres])
    danada = np.array([bool(m) and z_recortado(s) for m, s in zip(sin_marca, X)])
    return Dataset(X, np.array(etiquetas), nombres, sin_marca & ~danada, danada, ignorados)


def seleccionar_para_entrenar(ds: Dataset, incluir_copias: bool = False,
                              incluir_danadas: bool = False) -> tuple[Dataset, dict[str, int]]:
    """Deja lo que se usa para entrenar y cuenta lo que se aparta.

    Por defecto solo los ORIGINALES: el entrenamiento aumenta al vuelo (aumento_rasgos.py) y no necesita
    copias guardadas en disco; las copias antiguas con z recortado son datos que no existen en vivo.
      incluir_copias   conserva también las `aug_*.npy` generadas por augmentar_dataset.py
      incluir_danadas  conserva también las copias antiguas con z recortado
    """
    copia_guardada = ~ds.es_original & ~ds.danada
    mantener = ds.es_original.copy()
    if incluir_copias:
        mantener |= copia_guardada
    if incluir_danadas:
        mantener |= ds.danada
    apartadas = {"copias_guardadas": int((copia_guardada & ~mantener).sum()),
                 "copias_antiguas_danadas": int((ds.danada & ~mantener).sum())}
    return (ds.subconjunto(mantener) if not mantener.all() else ds), apartadas


def preparar_pliegue(ds: Dataset, idx_train, idx_test, version: str = "manos", rellenar: int = 4,
                     copias: int = 25, semilla: int = 0, espejo: float = 0.2):
    """Entrada de la red para un pliegue: (X_train, y_train, X_test, preprocesador).

    Los rasgos se calculan, el entrenamiento se aumenta (solo él) y la estandarización se ajusta con el
    entrenamiento ya aumentado. La prueba pasa por el mismo preprocesador y nunca se aumenta.
    """
    idx_train, idx_test = np.asarray(idx_train, dtype=int), np.asarray(idx_test, dtype=int)
    previo = Preprocesador(version, rellenar)
    F, y = previo.rasgos(ds.X[idx_train]), ds.y[idx_train]
    if copias > 0:
        if version != "manos":
            raise ValueError("El aumento sobre rasgos solo está definido para la versión \"manos\".")
        F, y = aumentar_lote(F, y, copias, semilla, espejo)
    preproc = Preprocesador.ajustar(F, version, rellenar)
    X_test = (preproc.transformar(ds.X[idx_test]) if len(idx_test)
              else np.zeros((0, SEQUENCE_LENGTH, preproc.dimension), dtype=np.float32))
    return preproc.estandarizar(F), y, X_test, preproc


def excluir_clases_pequenas(ds: Dataset, minimo: int = MIN_ORIGINALES,
                            umbral_gemelo: float = 0.02) -> tuple[Dataset, dict[str, int]]:
    """Quita las clases con menos de `minimo` originales INDEPENDIENTES (sin contar copias aumentadas
    ni repeticiones casi idénticas). Una clase así no se puede validar: su exactitud sería ruido.

    Devuelve (dataset sin esas clases, {clase_omitida: originales_independientes}).
    """
    if minimo <= 1:
        return ds, {}
    grupos = construir_grupos(ds.y, ds.nombres, ds.X, umbral_gemelo)
    omitidas: dict[str, int] = {}
    for clase in sorted(set(ds.y.tolist())):
        miembros = np.flatnonzero(ds.y == clase)
        independientes = len({int(grupos[i]) for i in miembros if ds.es_original[i]})
        if independientes < minimo:
            omitidas[clase] = independientes
    if not omitidas:
        return ds, {}
    return ds.subconjunto(~np.isin(ds.y, list(omitidas))), omitidas


def preparar_particion(ds: Dataset, prop_prueba: float = 0.2, prop_valid: float = 0.2,
                       semilla: int = 42, umbral_gemelo: float = 0.02) -> dict:
    """Parte el dataset por grupos y devuelve índices, avisos y el diagnóstico de fuga."""
    grupos = construir_grupos(ds.y, ds.nombres, ds.X, umbral_gemelo)
    split = dividir_por_grupos(ds.y, grupos, ds.es_original, prop_prueba, prop_valid, semilla)
    split["grupos"] = grupos
    split["fuga_valid"] = proporcion_con_gemelo(ds.X, ds.y, split["train"], split["valid"], umbral_gemelo)
    split["fuga_test"] = proporcion_con_gemelo(ds.X, ds.y, split["train"], split["test"], umbral_gemelo)
    split["por_clase"] = resumen_por_clase(ds.y, split)
    return split


def metricas_por_clase(y_real: np.ndarray, y_pred: np.ndarray, clases: list[str]) -> dict:
    """Exactitud global, por clase y las confusiones más frecuentes. Índices = posición en `clases`."""
    y_real = np.asarray(y_real, dtype=int)
    y_pred = np.asarray(y_pred, dtype=int)
    if len(y_real) == 0:
        return {"n": 0, "exactitud": None, "por_clase": {}, "confusiones": []}
    por_clase = {}
    for i, nombre in enumerate(clases):
        mascara = y_real == i
        if mascara.any():
            por_clase[nombre] = {"n": int(mascara.sum()), "exactitud": round(float(np.mean(y_pred[mascara] == i)), 3)}
    confusiones: dict[tuple[str, str], int] = {}
    for real, pred in zip(y_real, y_pred):
        if real != pred:
            clave = (clases[real], clases[pred])
            confusiones[clave] = confusiones.get(clave, 0) + 1
    top = sorted(confusiones.items(), key=lambda kv: -kv[1])[:10]
    return {
        "n": int(len(y_real)),
        "exactitud": round(float(np.mean(y_real == y_pred)), 4),
        "por_clase": por_clase,
        "confusiones": [{"real": r, "predicha": p, "veces": n} for (r, p), n in top],
    }
