"""
evaluar_modelo.py — Mide un modelo entrenado con secuencias que NO usó para entrenar
═════════════════════════════════════════════════════════════════════════════════════
La prueba más honesta de un modelo no es la partición interna del dataset (ahí el firmante, la cámara y
el video son los mismos), sino grabaciones de OTRAS personas. DeafApp las produce:

    py importar_deafapp.py --salida dataset_deafapp      # carpeta aparte, no la de entrenamiento
    py evaluar_modelo.py --datos dataset_deafapp

Solo se evalúan las secuencias cuya etiqueta existe en el modelo; el resto se cuenta aparte
(son señas que el modelo todavía no conoce).

Opciones:
    --modelo, --encoder   rutas de modelo_lsch_lstm.keras y label_encoder.pkl (por defecto, los de esta carpeta)
    --umbral              confianza mínima para dar una respuesta (por defecto 0.75, igual que la API)
    --json                escribe el informe en este archivo
"""

from __future__ import annotations

import argparse
import json
import pickle
import sys
from collections import Counter
from pathlib import Path

import numpy as np

from datos_entrenamiento import cargar_dataset, metricas_por_clase
from formato import SEQUENCE_LENGTH
from preprocesado import Preprocesador

UMBRAL_API = 0.75


def evaluar(probabilidades: np.ndarray, y_real: np.ndarray, clases: list[str], umbral: float = UMBRAL_API) -> dict:
    """Informe a partir de las probabilidades del modelo (N, n_clases) y los índices reales (N,).

    Además de la exactitud calcula lo que vería un usuario de la API: con `umbral`, una respuesta solo se
    da si la confianza lo alcanza. «Respondió» y «acertó entre las respondidas» muestran si el modelo
    sabe cuándo no sabe; un modelo que falla con 100 % de confianza es peor que uno que calla.
    """
    probabilidades = np.asarray(probabilidades, dtype=float)
    y_real = np.asarray(y_real, dtype=int)
    prediccion = probabilidades.argmax(axis=1) if len(y_real) else np.array([], dtype=int)
    confianza = probabilidades.max(axis=1) if len(y_real) else np.array([])
    informe = metricas_por_clase(y_real, prediccion, clases)
    respondidas = confianza >= umbral
    for k in (3, 5):
        if probabilidades.shape[1] >= k and len(y_real):
            primeras = np.argsort(-probabilidades, axis=1)[:, :k]
            informe[f"top{k}"] = round(float(np.mean([y_real[i] in primeras[i] for i in range(len(y_real))])), 4)
    informe["umbral"] = umbral
    informe["respondio"] = int(respondidas.sum())
    informe["acerto_entre_respondidas"] = (
        round(float(np.mean(prediccion[respondidas] == y_real[respondidas])), 4) if respondidas.any() else None
    )
    informe["confianza_media"] = round(float(confianza.mean()), 3) if len(confianza) else None
    informe["confianza_media_si_acierta"] = (
        round(float(confianza[prediccion == y_real].mean()), 3) if np.any(prediccion == y_real) else None
    )
    informe["confianza_media_si_falla"] = (
        round(float(confianza[prediccion != y_real].mean()), 3) if np.any(prediccion != y_real) else None
    )
    return informe


def curva_umbral(probabilidades: np.ndarray, y_real: np.ndarray, umbrales=None) -> list[dict]:
    """Para cada umbral: cuántas secuencias responde el modelo y cuántas de esas acierta."""
    probabilidades = np.asarray(probabilidades, dtype=float)
    y_real = np.asarray(y_real, dtype=int)
    umbrales = np.round(np.arange(0.2, 0.951, 0.05), 2) if umbrales is None else umbrales
    prediccion, confianza = probabilidades.argmax(axis=1), probabilidades.max(axis=1)
    curva = []
    for u in umbrales:
        responde = confianza >= u
        curva.append({"umbral": float(u), "responde": int(responde.sum()),
                      "cobertura": round(float(responde.mean()), 3),
                      "acierto": round(float(np.mean(prediccion[responde] == y_real[responde])), 3) if responde.any() else None})
    return curva


def umbral_sugerido(curva: list[dict], acierto_objetivo: float = 0.8, cobertura_minima: float = 0.1,
                    por_defecto: float | None = None) -> float | None:
    """El umbral más bajo cuyo acierto (entre lo que responde) llega al objetivo sin responder casi nada.

    Un umbral fijo copiado de otro modelo (0,75 en la API, 0,95 en la cámara) no sirve para un modelo
    nuevo: con label smoothing o con pocos datos las confianzas son otras. Se calibra con la validación
    cruzada. Si ningún umbral cumple (la confianza no separa aciertos de errores) devuelve `por_defecto`,
    que es None: mejor no inventar un umbral que dé una falsa sensación de seguridad.
    """
    for fila in curva:
        if fila["acierto"] is not None and fila["acierto"] >= acierto_objetivo and fila["cobertura"] >= cobertura_minima:
            return fila["umbral"]
    return por_defecto


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--datos", required=True, help="carpeta con <etiqueta>/*.npy (por ejemplo dataset_deafapp)")
    ap.add_argument("--modelo", default="modelo_lsch_lstm.keras")
    ap.add_argument("--encoder", default="label_encoder.pkl")
    ap.add_argument("--umbral", type=float, default=UMBRAL_API)
    ap.add_argument("--json", default="", help="escribir el informe en este archivo")
    a = ap.parse_args()

    from tensorflow import keras      # import perezoso: la parte numérica se prueba sin TensorFlow

    ds = cargar_dataset(a.datos)
    with open(a.encoder, "rb") as f:
        clases = [str(c) for c in pickle.load(f).classes_]
    modelo = keras.models.load_model(a.modelo)
    preproc = Preprocesador.cargar(Path(a.modelo).resolve().parent)      # el que se guardó junto al modelo
    if tuple(modelo.input_shape[1:]) != (SEQUENCE_LENGTH, preproc.dimension):
        print(f"El modelo espera {modelo.input_shape[1:]} y su preprocesado entrega {(SEQUENCE_LENGTH, preproc.dimension)}.")
        return 1

    conocidas = np.isin(ds.y, clases)
    desconocidas = Counter(ds.y[~conocidas].tolist())
    if not conocidas.any():
        print("Ninguna etiqueta de esas secuencias existe en el modelo; nada que evaluar.")
        return 1
    indice = {c: i for i, c in enumerate(clases)}
    y_real = np.array([indice[e] for e in ds.y[conocidas]])
    informe = evaluar(modelo.predict(preproc.transformar(ds.X[conocidas]), verbose=0), y_real, clases, a.umbral)
    informe["evaluadas"] = int(conocidas.sum())
    informe["etiquetas_que_el_modelo_no_conoce"] = dict(sorted(desconocidas.items()))

    print(f"Secuencias evaluadas: {informe['evaluadas']}  (de {len(ds)}; {sum(desconocidas.values())} con etiquetas que el modelo no conoce)")
    print(f"Exactitud: {informe['exactitud']:.1%}")
    print(f"Con umbral {a.umbral}: respondió {informe['respondio']} de {informe['n']}"
          + (f"  y acertó {informe['acerto_entre_respondidas']:.0%} de las que respondió" if informe["acerto_entre_respondidas"] is not None else ""))
    print(f"Confianza media: {informe['confianza_media']}  (si acierta {informe['confianza_media_si_acierta']}, si falla {informe['confianza_media_si_falla']})")
    for clase, datos in informe["por_clase"].items():
        print(f"  {clase:<22} {datos['exactitud']:>5.0%}  ({datos['n']})")
    for c in informe["confusiones"][:5]:
        print(f"  confunde {c['real']} → {c['predicha']}  ×{c['veces']}")
    if a.json:
        Path(a.json).write_text(json.dumps(informe, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print("Informe:", Path(a.json).resolve())
    return 0


if __name__ == "__main__":
    sys.exit(main())
