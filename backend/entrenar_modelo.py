"""
entrenar_modelo.py — Entrenamiento para LSCh
═════════════════════════════════════════════
Versión 4.0 — TensorFlow/Keras (CPU o GPU/CUDA si está disponible)

Input:   dataset/  (archivos .npy de forma (30, 270))
Outputs: modelo_lsch_lstm.keras    (el nombre se mantiene por compatibilidad con la API y reconocer.py,
                                    aunque la arquitectura por defecto ya no es una LSTM)
         label_encoder.pkl
         preprocesado.json         (cómo transformar una secuencia cruda antes de dársela al modelo)
         informe_entrenamiento.json

Qué cambió respecto a la versión 3 (todo medido, ver README):
  • Rasgos normalizados (rasgos.py): la forma de cada mano relativa a la muñeca y su posición relativa a
    la cara, no coordenadas de imagen. La cara es solo la regla (centro y ancho), no un rasgo.
  • Aumento al vuelo sobre esos rasgos (aumento_rasgos.py), solo en entrenamiento; ya no hace falta
    guardar copias en disco ni migrar el dataset: se entrena con los ORIGINALES.
  • Red más pequeña por defecto (Conv1D); con ~100 secuencias una LSTM de 128/64 sobreajusta.
  • Evaluación honesta por validación cruzada por grupos (particion.pliegues_por_grupos): cada original se
    prueba una vez, sin que su toma ni sus copias estén en el entrenamiento. Es el número que importa.
  • El modelo que se guarda se reentrena con TODOS los originales (más datos = mejor modelo); su
    exactitud esperada es la de la validación cruzada, no la de sus propios datos.
"""

from __future__ import annotations

import argparse
import json
import pickle
from datetime import datetime
from pathlib import Path

import numpy as np
from sklearn.preprocessing import LabelEncoder

import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers

from datos_entrenamiento import (
    MIN_ORIGINALES, cargar_dataset, excluir_clases_pequenas, metricas_por_clase, preparar_pliegue,
    seleccionar_para_entrenar,
)
from evaluar_modelo import UMBRAL_API, curva_umbral, evaluar, umbral_sugerido
from formato import ESPEJAR_ENTRADA, N_FEATURES, SEQUENCE_LENGTH
from particion import construir_grupos, pliegues_por_grupos

# ── HIPERPARÁMETROS ────────────────────────────────────────────────
DATASET_PATH : str   = "dataset"
ARQUITECTURAS = ("cnn", "gru", "lstm")
EPOCAS       : int   = 80
BATCH_SIZE   : int   = 32
COPIAS       : int   = 25       # variaciones al vuelo de cada original de entrenamiento
PLIEGUES     : int   = 5
RASGOS       : str   = "manos"
RELLENAR     : int   = 4        # huecos de detección de mano de hasta este largo se interpolan
SUAVIZADO    : float = 0.1      # label smoothing: evita confianzas de 100 % con pocos datos
SEMILLA      : int   = 42


def verificar_gpu() -> None:
    """Informa si TensorFlow detectó una GPU disponible."""
    gpus = tf.config.list_physical_devices("GPU")
    if gpus:
        print(f"  GPU detectada: {[g.name for g in gpus]}")
    else:
        print("  No se detecto GPU. Entrenando en CPU (suficiente para este tamaño de dataset).")


def construir_modelo(arquitectura: str, dimension: int, n_clases: int) -> keras.Model:
    """
    cnn   (por defecto) 2 × Conv1D(64, 5) → máximo global → Dropout 0,5 → softmax. Pequeña y rápida.
    gru   GRU(64) → Dropout 0,5 → softmax.
    lstm  la arquitectura anterior: LSTM(128) → LSTM(64) → Dense(64) → softmax.
    La entrada es (30 fotogramas, `dimension` rasgos por fotograma).
    """
    if arquitectura not in ARQUITECTURAS:
        raise ValueError(f"Arquitectura desconocida: {arquitectura!r} (válidas: {', '.join(ARQUITECTURAS)})")
    entrada = layers.Input(shape=(SEQUENCE_LENGTH, dimension))
    if arquitectura == "cnn":
        capas = [layers.Conv1D(64, 5, padding="same", activation="relu"), layers.BatchNormalization(),
                 layers.Conv1D(64, 5, padding="same", activation="relu"), layers.GlobalMaxPooling1D(),
                 layers.Dropout(0.5), layers.Dense(n_clases, activation="softmax")]
    elif arquitectura == "gru":
        capas = [layers.GRU(64), layers.Dropout(0.5), layers.Dense(n_clases, activation="softmax")]
    else:
        capas = [layers.LSTM(128, return_sequences=True), layers.BatchNormalization(), layers.Dropout(0.3),
                 layers.LSTM(64), layers.BatchNormalization(), layers.Dropout(0.3),
                 layers.Dense(64, activation="relu"), layers.Dense(n_clases, activation="softmax")]
    modelo = keras.Sequential([entrada] + capas, name=f"LSCh_{arquitectura}")
    modelo.compile(
        optimizer=keras.optimizers.Adam(learning_rate=1e-3 if arquitectura == "lstm" else 2e-3),
        loss=keras.losses.CategoricalCrossentropy(label_smoothing=SUAVIZADO),
        metrics=["accuracy"],
    )
    return modelo


def entrenar(arquitectura: str, X: np.ndarray, y_idx: np.ndarray, n_clases: int, epocas: int, semilla: int) -> keras.Model:
    keras.utils.set_random_seed(semilla)
    modelo = construir_modelo(arquitectura, X.shape[2], n_clases)
    modelo.fit(X, keras.utils.to_categorical(y_idx, n_clases), epochs=epocas, batch_size=BATCH_SIZE, verbose=0)
    return modelo


def main(dataset: str = DATASET_PATH, salida: str = ".", arquitectura: str = "cnn", epocas: int = EPOCAS,
         copias: int = COPIAS, pliegues: int = PLIEGUES, rasgos: str = RASGOS,
         min_originales: int = MIN_ORIGINALES, incluir_copias: bool = False, incluir_danadas: bool = False,
         sin_modelo_final: bool = False, semilla: int = SEMILLA) -> None:
    carpeta_salida = Path(salida)
    carpeta_salida.mkdir(parents=True, exist_ok=True)
    print("=" * 60)
    print("  LSCh — Entrenamiento v4.0")
    print("=" * 60)
    verificar_gpu()
    print()

    # 1. Datos: originales, sin copias dañadas ni copias en disco (se aumenta al vuelo)
    ds = cargar_dataset(dataset)
    for linea in ds.ignorados:
        print(f"  Ignorado: {linea}")
    ds, apartadas = seleccionar_para_entrenar(ds, incluir_copias, incluir_danadas)
    print(f"  Dataset: {len(ds)} secuencias de entrenamiento en {len(set(ds.y.tolist()))} clases")
    if apartadas["copias_guardadas"]:
        print(f"  Se ignoran {apartadas['copias_guardadas']} copias aug_*.npy (el entrenamiento aumenta al vuelo; --incluir-copias las usa).")
    if apartadas["copias_antiguas_danadas"]:
        print(f"  Se ignoran {apartadas['copias_antiguas_danadas']} copias antiguas con z recortado (datos dañados).")
    ds, omitidas = excluir_clases_pequenas(ds, min_originales)
    if omitidas:
        print(f"  Clases fuera (< {min_originales} originales independientes): " + ", ".join(f"{c} ({n})" for c, n in omitidas.items()))
    if len(ds) == 0:
        raise RuntimeError(f"Ninguna clase llega a {min_originales} originales independientes.")

    le = LabelEncoder().fit(ds.y)
    clases = [str(c) for c in le.classes_]
    y_idx = le.transform(ds.y)
    n_clases = len(clases)

    # 2. Validación cruzada por grupos
    grupos = construir_grupos(ds.y, ds.nombres, ds.X)
    independientes = [len({int(grupos[i]) for i in np.flatnonzero((ds.y == c) & ds.es_original)}) for c in clases]
    k = min(pliegues, max(independientes))
    informe_cv: dict | None = None
    umbral = None
    if k >= 2:
        print(f"\n  Validación cruzada por grupos: {k} pliegues (originales independientes por clase: {min(independientes)} a {max(independientes)})")
        todas_probs, todas_reales = [], []
        for f, p in enumerate(pliegues_por_grupos(ds.y, grupos, ds.es_original, k, semilla)):
            if len(p["test"]) == 0:
                continue
            Xtr, ytr, Xte, _ = preparar_pliegue(ds, p["train"], p["test"], rasgos, RELLENAR, copias, semilla + f)
            modelo = entrenar(arquitectura, Xtr, le.transform(ytr), n_clases, epocas, semilla + f)
            probs = modelo.predict(Xte, verbose=0)
            real = y_idx[p["test"]]
            todas_probs.append(probs); todas_reales.append(real)
            print(f"    pliegue {f + 1}/{k}: {np.mean(probs.argmax(axis=1) == real):.0%} de {len(real)} secuencias (entrenó con {len(p['train'])} originales)")
            keras.backend.clear_session()
        probs, reales = np.concatenate(todas_probs), np.concatenate(todas_reales)
        informe_cv = evaluar(probs, reales, clases, UMBRAL_API)
        print(f"\n  Exactitud por validación cruzada: {informe_cv['exactitud']:.1%} sobre {informe_cv['n']} originales no vistos")
        print(f"  Con el umbral de la API ({UMBRAL_API}): responde {informe_cv['respondio']} de {informe_cv['n']}"
              + (f" y acierta {informe_cv['acerto_entre_respondidas']:.0%} de las que responde" if informe_cv["acerto_entre_respondidas"] is not None else ""))
        for c in informe_cv["confusiones"][:5]:
            print(f"    {c['real']} → {c['predicha']}  ×{c['veces']}")
        curva = curva_umbral(probs, reales)
        umbral = umbral_sugerido(curva)
        informe_cv["curva_umbral"] = curva
        informe_cv["umbral_sugerido"] = umbral
        informe_cv["confianza_informativa"] = umbral is not None
        if umbral is None:
            print("  AVISO: ningún umbral de confianza separa aciertos de errores (confianza media al acertar "
                  f"{informe_cv['confianza_media_si_acierta']}, al fallar {informe_cv['confianza_media_si_falla']}).")
            print("         Filtrar por confianza no sirve con este modelo; conviene mostrar las 3 señas más probables"
                  f" (acierta {informe_cv.get('top3', 0):.0%} de las veces entre las 3 primeras).")
        else:
            fila = next(f for f in curva if f["umbral"] == umbral)
            print(f"  Umbral de confianza calibrado: {umbral} (responde {fila['cobertura']:.0%} de las secuencias"
                  + (f" y acierta {fila['acierto']:.0%} de las que responde)" if fila["acierto"] is not None else ")"))
        if "top3" in informe_cv:
            print(f"  La seña correcta está entre las 3 primeras en {informe_cv['top3']:.0%} de los casos"
                  + (f" y entre las 5 primeras en {informe_cv['top5']:.0%}" if "top5" in informe_cv else ""))
    else:
        print("\n  Aviso: ninguna clase tiene 2 grupos independientes; no hay validación cruzada posible.")

    # 3. Modelo final con todos los originales
    if sin_modelo_final:
        print("\n  --sin-modelo-final: no se guarda ningún modelo.")
    else:
        print(f"\n  Entrenando el modelo final con los {len(ds)} originales...")
        Xtr, ytr, _, pre = preparar_pliegue(ds, np.arange(len(ds)), [], rasgos, RELLENAR, copias, semilla)
        modelo = entrenar(arquitectura, Xtr, le.transform(ytr), n_clases, epocas, semilla)
        modelo.save(carpeta_salida / "modelo_lsch_lstm.keras")
        with open(carpeta_salida / "label_encoder.pkl", "wb") as f:
            pickle.dump(le, f)
        pre.umbral = umbral
        pre.guardar(carpeta_salida)
        print("  Guardados: modelo_lsch_lstm.keras, label_encoder.pkl, preprocesado.json")

    informe = {
        "fecha": datetime.now().isoformat(timespec="seconds"),
        "formato": {"secuencia": SEQUENCE_LENGTH, "valores": N_FEATURES, "espejar_entrada": ESPEJAR_ENTRADA},
        "configuracion": {"arquitectura": arquitectura, "rasgos": rasgos, "rellenar": RELLENAR, "copias": copias,
                          "epocas": epocas, "pliegues": k, "semilla": semilla, "suavizado": SUAVIZADO},
        "clases": clases,
        "clases_omitidas": omitidas,
        "apartadas": apartadas,
        "secuencias": len(ds),
        "validacion_cruzada": informe_cv,
        "nota": "La exactitud esperada del modelo guardado es la de la validación cruzada: el modelo final "
                "se entrenó con todos los originales y no tiene datos de prueba propios.",
    }
    with open(carpeta_salida / "informe_entrenamiento.json", "w", encoding="utf-8") as f:
        json.dump(informe, f, indent=2, ensure_ascii=False)
    print("  Informe: informe_entrenamiento.json")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Entrena con dataset/ y escribe modelo, encoder, preprocesado e informe.")
    ap.add_argument("--dataset", default=DATASET_PATH)
    ap.add_argument("--salida", default=".", help="carpeta donde se escriben los archivos")
    ap.add_argument("--arquitectura", choices=ARQUITECTURAS, default="cnn")
    ap.add_argument("--epocas", type=int, default=EPOCAS)
    ap.add_argument("--copias", type=int, default=COPIAS, help="variaciones al vuelo por original (0 = sin aumento)")
    ap.add_argument("--pliegues", type=int, default=PLIEGUES)
    ap.add_argument("--rasgos", default=RASGOS, help="versión de rasgos (ver rasgos.py); el aumento solo admite «manos»")
    ap.add_argument("--min-originales", type=int, default=MIN_ORIGINALES,
                    help="las clases con menos originales independientes quedan fuera (1 = no excluir ninguna)")
    ap.add_argument("--incluir-copias", action="store_true", help="usar también las copias aug_*.npy guardadas")
    ap.add_argument("--incluir-danadas", action="store_true", help="usar también las copias antiguas con z recortado")
    ap.add_argument("--sin-modelo-final", action="store_true", help="solo validar; no guardar modelo")
    ap.add_argument("--semilla", type=int, default=SEMILLA)
    a = ap.parse_args()
    main(a.dataset, a.salida, a.arquitectura, a.epocas, a.copias, a.pliegues, a.rasgos, a.min_originales,
         a.incluir_copias, a.incluir_danadas, a.sin_modelo_final, a.semilla)
