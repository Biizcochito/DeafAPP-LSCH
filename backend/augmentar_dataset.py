"""
augmentar_dataset.py — Aumentación de datos para secuencias LSTM (LSCh)
════════════════════════════════════════════════════════════════════════
Toma cada secuencia ORIGINAL de las clases con pocas muestras y genera variaciones realistas
para robustecer el entrenamiento. Cada clase se completa hasta OBJETIVO_MUESTRAS (30) en total:
1 original → 29 copias; 6 originales → 4 copias de cada uno.

Técnicas (combinaciones aleatorias):
  • Ruido gaussiano    → simula temblor natural de la mano
  • Escala espacial    → mano más cerca/lejos de la cámara
  • Traslación         → mano en distinta posición del encuadre
  • Warp temporal      → gesto más rápido o más lento
  • Espejo horizontal  → firmante zurdo / ángulo lateral

Cambios respecto a la versión anterior (todos corrigen defectos medidos en el dataset):
  • Las variaciones se guardan como  aug_<original>__NN.npy.  Así el entrenamiento puede
    mantener cada original junto con sus copias y no mezclarlas entre entrenamiento y prueba
    (ver particion.py). Antes se guardaban como seq_XXXX y no se podían distinguir.
  • Solo se modifican los puntos PRESENTES. Antes el ruido y la traslación llenaban de valores
    los componentes ausentes (una mano que no estaba pasaba a «estar»).
  • Ya no se recorta z a [0, 1]. La profundidad es negativa para lo cercano a la cámara; el
    recorte la dejaba en 0 en las copias (ver calidad.py). x e y tampoco se recortan: los
    puntos reales pueden salir un poco del encuadre.
  • El espejo no convierte los componentes ausentes en x = 1.
  • Cada variación usa una semilla propia y estable, y el proceso es repetible sin duplicar.

Uso:
    py augmentar_dataset.py
    py augmentar_dataset.py --objetivo 60          # más copias por clase
    py augmentar_dataset.py --por-original 5       # copias fijas por original
"""

from __future__ import annotations

import argparse
import zlib
from pathlib import Path

import numpy as np

from formato import IDX_LH, IDX_POSE, IDX_RH, N_FEATURES, SEQUENCE_LENGTH, espejar_secuencia
from calidad import z_recortado
from particion import es_aumentada, nombre_aumentada

# ── CONFIGURACIÓN ──────────────────────────────────────────────────
DATASET_PATH     : str = "dataset"
OBJETIVO_MUESTRAS: int = 30     # muestras por clase a las que se llega; con más originales no se aumenta


def _presente(seq: np.ndarray) -> np.ndarray:
    """Máscara (T, F): True donde el punto (x, y, z) existe (no es un bloque de ceros)."""
    puntos = seq.reshape(seq.shape[0], -1, 3)
    return np.repeat(np.any(puntos != 0, axis=2), 3, axis=1)


# ── TÉCNICAS DE AUGMENTACIÓN ────────────────────────────────────────

def agregar_ruido(seq: np.ndarray, sigma: float) -> np.ndarray:
    """Ruido gaussiano sobre los puntos presentes. sigma típico: 0.003 – 0.02."""
    ruido = np.random.normal(0, sigma, seq.shape).astype(np.float32)
    return np.where(_presente(seq), seq + ruido, seq)


def escalar_espacial(seq: np.ndarray) -> np.ndarray:
    """Escala manos y pose (no la cara): el firmante más cerca o más lejos."""
    factor = np.random.uniform(0.90, 1.10)
    out = seq.copy()
    presente = _presente(out)
    for inicio, fin in (IDX_RH, IDX_LH, IDX_POSE):
        out[:, inicio:fin] = np.where(presente[:, inicio:fin], out[:, inicio:fin] * factor, out[:, inicio:fin])
    return out


def trasladar(seq: np.ndarray) -> np.ndarray:
    """Desplaza x e y de manos y pose: el firmante en otra posición del encuadre."""
    dx = np.random.uniform(-0.04, 0.04)
    dy = np.random.uniform(-0.04, 0.04)
    out = seq.copy()
    presente = _presente(out)
    for inicio, fin in (IDX_RH, IDX_LH, IDX_POSE):
        for i in range(inicio, fin, 3):
            out[:, i]     = np.where(presente[:, i],     out[:, i] + dx,     out[:, i])
            out[:, i + 1] = np.where(presente[:, i + 1], out[:, i + 1] + dy, out[:, i + 1])
    return out


def warp_temporal(seq: np.ndarray) -> np.ndarray:
    """Cambia la velocidad del gesto: factor < 1 más rápido, > 1 más lento."""
    factor = np.random.uniform(0.75, 1.30)
    n_intermedio = max(10, int(SEQUENCE_LENGTH * factor))
    idx_intermedio = np.linspace(0, SEQUENCE_LENGTH - 1, n_intermedio).astype(int)
    seq_intermedio = seq[idx_intermedio]
    idx_final = np.linspace(0, len(seq_intermedio) - 1, SEQUENCE_LENGTH).astype(int)
    return seq_intermedio[idx_final].astype(np.float32)


def espejo_horizontal(seq: np.ndarray) -> np.ndarray:
    """Refleja x (1 − x) e intercambia derecha/izquierda, sin tocar lo ausente."""
    return espejar_secuencia(seq)


def generar_variacion(seq: np.ndarray) -> np.ndarray:
    """Combinación aleatoria de técnicas; siempre con un ruido mínimo para garantizar variación."""
    seq_aug = agregar_ruido(seq.copy(), sigma=np.random.uniform(0.003, 0.008))
    if np.random.random() < 0.70:
        seq_aug = escalar_espacial(seq_aug)
    if np.random.random() < 0.70:
        seq_aug = trasladar(seq_aug)
    if np.random.random() < 0.50:
        seq_aug = warp_temporal(seq_aug)
    if np.random.random() < 0.30:
        seq_aug = espejo_horizontal(seq_aug)
    if np.random.random() < 0.50:
        seq_aug = agregar_ruido(seq_aug, sigma=np.random.uniform(0.002, 0.010))
    return seq_aug.astype(np.float32)


# ── AUMENTACIÓN DEL DATASET ────────────────────────────────────────

def copias_por_original(n_originales: int, objetivo: int = OBJETIVO_MUESTRAS) -> int:
    """Copias de cada original para que la clase llegue a `objetivo` muestras en total.

    1 original → 29 copias (30 en total, el diseño original); 6 originales → 4 copias cada uno (30).
    Una clase con `objetivo` originales o más no se aumenta.
    """
    if n_originales <= 0 or n_originales >= objetivo:
        return 0
    return -(-(objetivo - n_originales) // n_originales)          # división hacia arriba


def augmentar_dataset(path: str, por_original: int | None = None, objetivo: int = OBJETIVO_MUESTRAS) -> int:
    """Genera copias para las clases con menos de `objetivo` originales y devuelve cuántas creó.

    `por_original` fija las copias de cada original; si es None se calculan para que cada clase
    llegue a `objetivo` muestras (copias_por_original).
    """
    root = Path(path)
    clases = sorted(d.name for d in root.iterdir() if d.is_dir() and not d.name.startswith(("_", ".")))

    print("=" * 55)
    print("  Aumentación de datos — LSCh")
    print("=" * 55)
    print(f"  Se aumentan clases con < {objetivo} originales")
    if por_original is None:
        print(f"  Copias: las necesarias para llegar a {objetivo} muestras por clase (aug_<original>__NN.npy)\n")
    else:
        print(f"  Copias: {por_original} por original (aug_<original>__NN.npy)\n")

    total_nuevas = 0
    total_danadas = 0
    for clase in clases:
        carpeta = root / clase
        archivos = [f for f in sorted(carpeta.glob("*.npy")) if not es_aumentada(f.name)]
        originales: list[tuple[Path, np.ndarray]] = []
        danadas = 0
        for archivo in archivos:
            try:
                seq = np.load(archivo, allow_pickle=False)
            except Exception:
                print(f"    Saltado {archivo.name}: no se pudo leer")
                continue
            if seq.shape != (SEQUENCE_LENGTH, N_FEATURES):
                print(f"    Saltado {archivo.name}: forma {seq.shape}")
            elif z_recortado(seq):
                danadas += 1                      # copia antigua con z recortado: no sirve de origen
            else:
                originales.append((archivo, seq))
        total_danadas += danadas

        copias = por_original if por_original is not None else copias_por_original(len(originales), objetivo)
        if len(originales) >= objetivo or copias == 0:
            print(f"  {clase:<22} {len(originales):>4} originales — OK, sin cambios")
            continue

        nuevas = 0
        for archivo, seq_orig in originales:
            for k in range(copias):
                destino = carpeta / nombre_aumentada(archivo.stem, k)
                if destino.exists():
                    continue                      # repetible: no duplica ni cambia lo ya generado
                np.random.seed(zlib.crc32(f"{clase}/{archivo.stem}/{k}".encode("utf-8")))
                np.save(destino, generar_variacion(seq_orig))
                nuevas += 1
        total_nuevas += nuevas
        print(f"  {clase:<22} {len(originales):>4} originales → +{nuevas} copias aumentadas")

    print(f"\n{'=' * 55}")
    print(f"  Copias generadas : {total_nuevas}")
    if total_danadas:
        print(f"  Aviso: {total_danadas} secuencia(s) con z recortado (copias antiguas) no se usaron como origen.")
        print("         Ejecuta  py migrar_dataset.py --aplicar  para retirarlas.")
    print("  Siguiente paso   : py entrenar_modelo.py")
    print("=" * 55)
    return total_nuevas


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Aumenta las clases con pocos originales.")
    ap.add_argument("--dataset", default=DATASET_PATH)
    ap.add_argument("--objetivo", type=int, default=OBJETIVO_MUESTRAS,
                    help="muestras por clase a las que se quiere llegar (por defecto 30)")
    ap.add_argument("--por-original", type=int, default=None,
                    help="fija las copias de cada original en vez de calcularlas desde --objetivo")
    a = ap.parse_args()
    augmentar_dataset(a.dataset, a.por_original, a.objetivo)
