"""
extraer_senas.py — Extrae segmentos etiquetados y genera dataset .npy
══════════════════════════════════════════════════════════════════════
Lee el JSON generado por etiquetar_video.py, extrae cada fragmento
del video, lo procesa con MediaPipe Holistic y guarda las secuencias
como archivos .npy en el dataset.

Clave: usa resampling (np.linspace) para normalizar cualquier duración
de seña a exactamente SEQUENCE_LENGTH=30 frames, sin importar si la
seña dura 0.5s o 3s.

Uso:
  py extraer_senas.py
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import cv2
import numpy as np

from formato import corregir_aspecto
from utils import (
    DATASET_PATH, N_FEATURES, SEQUENCE_LENGTH,
    crear_holistic, extraer_features,
)

# ── CONFIGURACIÓN ──────────────────────────────────────────────────
# Cambia esta ruta al JSON generado por etiquetar_video.py
JSON_PATH = r"C:\Users\Lissette\Downloads\videos-senas\Alimentos_x5_etiquetas.json"

# Confianza más baja para videos (iluminación variable, cámara fija)
MIN_CONF = 0.5


def resamplear(frames: list[np.ndarray], n: int) -> np.ndarray:
    """
    Normaliza una secuencia de longitud variable a exactamente n frames.

    Usa np.linspace para seleccionar n índices uniformemente distribuidos
    a lo largo de los frames disponibles. Esto permite que señas de
    distinta duración queden todas en el mismo tensor (n, N_FEATURES).

    Parameters
    ----------
    frames : lista de arrays de shape (N_FEATURES,)
    n      : número de frames objetivo (SEQUENCE_LENGTH = 30)

    Returns
    -------
    np.ndarray de shape (n, N_FEATURES) y dtype float32
    """
    indices = np.linspace(0, len(frames) - 1, n, dtype=int)
    return np.array([frames[i] for i in indices], dtype=np.float32)


def extraer_senas(json_path: str) -> None:
    # Cargar etiquetas
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    video_path = data['video']
    fps        = data['fps']
    segmentos  = data['segmentos']

    print("=" * 55)
    print("  Extractor de señas LSCh")
    print("=" * 55)
    print(f"  Video     : {Path(video_path).name}")
    print(f"  Segmentos : {len(segmentos)}")
    print(f"  FPS       : {fps:.0f}")
    print(f"  Dataset   : {os.path.abspath(DATASET_PATH)}\n")

    holistic = crear_holistic(MIN_CONF)
    n_ok     = 0
    n_skip   = 0

    for i, seg in enumerate(segmentos):
        label = seg['label']
        start = seg['start']
        end   = seg['end']

        if not label:
            print(f"  Segmento {i+1}: sin etiqueta, saltando.")
            n_skip += 1
            continue

        print(f"  [{i+1:02d}/{len(segmentos)}] '{label}'  "
              f"({start:.1f}s → {end:.1f}s, {end-start:.1f}s)")

        # Extraer frames del segmento
        cap = cv2.VideoCapture(video_path)
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(start * fps))

        frame_inicio = int(start * fps)
        frame_fin    = int(end   * fps)
        frames: list[np.ndarray] = []

        while True:
            pos = int(cap.get(cv2.CAP_PROP_POS_FRAMES))
            if pos >= frame_fin:
                break
            ret, frame = cap.read()
            if not ret:
                break

            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            frame_rgb.flags.writeable = False
            results = holistic.process(frame_rgb)
            frame_rgb.flags.writeable = True

            # Formato de referencia (16:9): el dataset actual ya lo es, un video de otra proporción se convierte.
            vec = corregir_aspecto(extraer_features(results), frame.shape[1] / frame.shape[0])
            frames.append(vec)

        cap.release()

        # Verificar mínimo de frames
        if len(frames) < 10:
            print(f"    Saltado: solo {len(frames)} frames detectados.")
            n_skip += 1
            continue

        # Resamplear a SEQUENCE_LENGTH frames
        seq = resamplear(frames, SEQUENCE_LENGTH)   # (30, 264)

        # Guardar .npy
        ruta = os.path.join(DATASET_PATH, label)
        os.makedirs(ruta, exist_ok=True)
        n_existentes = sum(1 for f in os.listdir(ruta) if f.endswith('.npy'))
        filepath = os.path.join(ruta, f"seq_{n_existentes:04d}.npy")
        np.save(filepath, seq)

        print(f"    OK → {filepath}  "
              f"({len(frames)} frames → resampleados a {SEQUENCE_LENGTH})")
        n_ok += 1

    print(f"\n{'='*55}")
    print(f"  Completado: {n_ok} señas guardadas, {n_skip} saltadas")
    print(f"  Dataset actualizado en: {os.path.abspath(DATASET_PATH)}")
    print(f"{'='*55}")
    print("\n  Siguiente paso: py entrenar_modelo.py")


if __name__ == "__main__":
    extraer_senas(JSON_PATH)
