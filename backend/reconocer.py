"""
reconocer.py — Reconocimiento de señas en tiempo real
══════════════════════════════════════════════════════
Carga el modelo LSTM entrenado y clasifica señas en vivo.
Requiere: modelo_lsch_lstm.keras  y  label_encoder.pkl

Presiona [ESC] para salir.
"""

from __future__ import annotations

import pickle
import threading
from collections import deque

import cv2
import numpy as np
import pyttsx3
from tensorflow import keras

from formato import ESPEJAR_ENTRADA, corregir_aspecto
from preprocesado import Preprocesador
from utils import (

    N_FEATURES, SEQUENCE_LENGTH,
    crear_holistic, dibujar_holistic, extraer_features,
)

# ── CONFIGURACIÓN ──────────────────────────────────────────────────
CAMERA_INDEX : int   = 0      # cambia si tu webcam es el índice 1
MIN_CONF     : float = 0.7
THRESHOLD    : float = 0.95   # confianza mínima para mostrar predicción
PRED_CADA    : int   = 3      # predecir cada N frames (reduce carga GPU)

# ── CARGA DE MODELO Y ENCODER ──────────────────────────────────────
print("Cargando modelo...")
try:
    modelo = keras.models.load_model("modelo_lsch_lstm.keras")
except OSError:
    raise FileNotFoundError(
        "No se encontro 'modelo_lsch_lstm.keras'.\n"
        "Ejecuta primero entrenar_modelo.py."
    )

try:
    with open("label_encoder.pkl", "rb") as f:
        le = pickle.load(f)
except FileNotFoundError:
    raise FileNotFoundError(
        "No se encontro 'label_encoder.pkl'.\n"
        "Ejecuta primero entrenar_modelo.py."
    )

preproc = Preprocesador.cargar(".")     # el mismo que usó el entrenamiento (o el heredado, crudo)
if tuple(modelo.input_shape[1:]) != (SEQUENCE_LENGTH, preproc.dimension):
    raise SystemExit(
        f"El modelo espera {modelo.input_shape[1:]} y su preprocesado entrega {(SEQUENCE_LENGTH, preproc.dimension)}.\n"
        "¿Falta preprocesado.json junto al modelo? Reentrena con entrenar_modelo.py."
    )
if preproc.umbral:
    THRESHOLD = preproc.umbral          # calibrado con la validación cruzada del entrenamiento

print(f"Modelo listo. Clases: {list(le.classes_)}\n")

# ── TEXT-TO-SPEECH ─────────────────────────────────────────────────
motor_voz = pyttsx3.init()
motor_voz.setProperty('rate', 150)    # velocidad de habla
motor_voz.setProperty('volume', 1.0)  # volumen máximo

def hablar(texto: str) -> None:
    """Habla el texto en un hilo separado para no bloquear la cámara."""
    def _hablar():
        motor_voz.say(texto)
        motor_voz.runAndWait()
    threading.Thread(target=_hablar, daemon=True).start()


def main() -> None:
    holistic = crear_holistic(MIN_CONF)
    cap      = cv2.VideoCapture(CAMERA_INDEX)

    if not cap.isOpened():
        raise RuntimeError(f"No se pudo abrir la camara (indice {CAMERA_INDEX})")

    buffer             = deque(maxlen=SEQUENCE_LENGTH)
    prediccion         = ""
    confianza          = 0.0
    frame_count        = 0
    ultima_prediccion  = ""   # para no repetir la misma palabra

    print("Reconocimiento activo. [ESC] para salir.\n")

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        # Los puntos se calculan sobre la imagen SIN voltear, igual que el video con el que se
        # creó el dataset y que las grabaciones de DeafApp (ver formato.ESPEJAR_ENTRADA).
        # El efecto espejo se aplica después, solo para mostrar la imagen.
        if ESPEJAR_ENTRADA:
            frame = cv2.flip(frame, 1)
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        frame_rgb.flags.writeable = False
        results = holistic.process(frame_rgb)
        frame_rgb.flags.writeable = True

        frame = dibujar_holistic(frame, results)
        # Formato de referencia (16:9) aunque la webcam sea 4:3: es lo que vio el modelo al entrenar.
        vec   = corregir_aspecto(extraer_features(results), frame.shape[1] / frame.shape[0])
        if not ESPEJAR_ENTRADA:
            frame = cv2.flip(frame, 1)
        buffer.append(vec)
        frame_count += 1

        # Inferencia cada PRED_CADA frames cuando el buffer está lleno
        mano_visible = (
            results.right_hand_landmarks is not None
            or results.left_hand_landmarks is not None
        )
        if len(buffer) == SEQUENCE_LENGTH and frame_count % PRED_CADA == 0 and mano_visible:
            X     = np.expand_dims(
                np.array(list(buffer), dtype=np.float32), axis=0
            )   # (1, 30, 264)
            probs = modelo.predict(preproc.transformar(X), verbose=0)[0]
            idx   = int(np.argmax(probs))
            conf  = float(probs[idx])

            if conf >= THRESHOLD:
                prediccion = le.classes_[idx]
                confianza  = conf
                # Hablar solo cuando cambia la predicción
                if prediccion != ultima_prediccion:
                    hablar(prediccion)
                    ultima_prediccion = prediccion
            else:
                prediccion = ""
                confianza  = 0.0

        # ── HUD ───────────────────────────────────────────────────
        h, w = frame.shape[:2]
        overlay = frame.copy()
        cv2.rectangle(overlay, (0, 0), (w, 80), (20, 20, 20), -1)
        cv2.addWeighted(overlay, 0.72, frame, 0.28, 0, frame)

        if prediccion:
            cv2.putText(frame, prediccion, (20, 65),
                        cv2.FONT_HERSHEY_SIMPLEX, 2.5,
                        (0, 220, 80), 4, cv2.LINE_AA)
            barra = f"{confianza * 100:.0f}%"
            cv2.putText(frame, barra, (160, 65),
                        cv2.FONT_HERSHEY_SIMPLEX, 1.2,
                        (200, 200, 200), 2, cv2.LINE_AA)
        else:
            cv2.putText(frame, "...", (20, 60),
                        cv2.FONT_HERSHEY_SIMPLEX, 1.5,
                        (100, 100, 100), 2, cv2.LINE_AA)

        # Barra de confianza horizontal
        if confianza > 0:
            cv2.rectangle(frame, (0, h - 8), (int(w * confianza), h),
                          (0, 200, 80), -1)

        cv2.imshow("LSCh - Reconocimiento en Tiempo Real", frame)
        if cv2.waitKey(1) & 0xFF == 27:
            break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
