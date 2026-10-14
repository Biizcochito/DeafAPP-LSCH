"""
capturar_secuencias.py — Recolector de secuencias LSTM para LSCh
═════════════════════════════════════════════════════════════════
Versión 2.0 — MediaPipe Holistic (mano derecha + mano izquierda + cara + pose)

Pipeline:
    Webcam → Holistic → vec(270,) → deque(30) → .npy(30, 270)

Dataset generado:
    dataset/
    ├── A/  seq_0000.npy  seq_0001.npy  ...
    └── Z/  ...

Controles:
    [A–Z / N para Ñ]  Seleccionar clase e iniciar grabación
    [SPACE]           Cancelar grabación
    [ESC]             Salir
"""

from __future__ import annotations

import os
import socket
from collections import deque

import cv2
import numpy as np

from formato import ESPEJAR_ENTRADA, corregir_aspecto
from utils import (
    DATASET_PATH, N_FEATURES, SEQUENCE_LENGTH, SEQ_TARGET,
    crear_holistic, dibujar_holistic, extraer_features,
)

# ── CONFIGURACIÓN ──────────────────────────────────────────────────
CAMERA_INDEX : int   = 0       # cambia a 1 si tu webcam es el índice 1
MIN_CONF     : float = 0.7
UDP_IP       : str   = "127.0.0.1"
UDP_PORT     : int   = 5055

# ── ESTADOS FSM ────────────────────────────────────────────────────
IDLE, RECORDING, SAVED = 0, 1, 2

# ── MAPA DE TECLAS ─────────────────────────────────────────────────
KEYMAP: dict[int, str] = {ord(c): c.upper() for c in "abcdefghijklmnopqrstuvwxyz"}
KEYMAP[241] = "N"   # Ñ — mapeado a N por compatibilidad de teclado


def contar_secuencias(clase: str) -> int:
    ruta = os.path.join(DATASET_PATH, clase)
    if not os.path.isdir(ruta):
        return 0
    return sum(1 for f in os.listdir(ruta) if f.endswith(".npy"))


def guardar_secuencia(buffer: deque, clase: str, idx: int) -> None:
    """Apila 30 vectores (270,) → tensor (30, 270) y lo guarda como .npy"""
    ruta = os.path.join(DATASET_PATH, clase)
    os.makedirs(ruta, exist_ok=True)
    seq = np.array(list(buffer), dtype=np.float32)   # (30, 270)
    assert seq.shape == (SEQUENCE_LENGTH, N_FEATURES), \
        f"Shape invalido: {seq.shape}"
    np.save(os.path.join(ruta, f"seq_{idx:04d}.npy"), seq)


def dibujar_hud(img, state, clase, n_frames, n_sesion, n_disco):
    h, w = img.shape[:2]
    PALETA = {
        IDLE:      ((128, 128, 128), "IDLE"),
        RECORDING: ((0,   55,  220), "REC"),
        SAVED:     ((0,   170,  40), "GUARDADO"),
    }
    color, texto = PALETA[state]
    overlay = img.copy()
    cv2.rectangle(overlay, (0, 0), (w, 52), (20, 20, 20), -1)
    cv2.addWeighted(overlay, 0.72, img, 0.28, 0, img)
    cv2.putText(img, texto, (12, 36),
                cv2.FONT_HERSHEY_SIMPLEX, 1.0, color, 2, cv2.LINE_AA)
    if clase:
        info = f"Clase: {clase}  Sesion: {n_sesion}  Disco: {n_disco}/{SEQ_TARGET}"
        cv2.putText(img, info, (180, 36),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (230, 230, 230), 1, cv2.LINE_AA)
    if state == RECORDING:
        pct = n_frames / SEQUENCE_LENGTH
        cv2.rectangle(img, (0, h - 18), (int(w * pct), h), color, -1)
        cv2.putText(img, f"{n_frames}/{SEQUENCE_LENGTH} frames",
                    (8, h - 3), cv2.FONT_HERSHEY_SIMPLEX,
                    0.5, (255, 255, 255), 1, cv2.LINE_AA)
    return img


def main() -> None:
    sock     = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    holistic = crear_holistic(MIN_CONF)
    cap      = cv2.VideoCapture(CAMERA_INDEX)

    if not cap.isOpened():
        raise RuntimeError(
            f"No se pudo abrir la camara (indice {CAMERA_INDEX}). "
            "Prueba cambiando CAMERA_INDEX a 0 o 1 en este archivo."
        )

    state           = IDLE
    etiqueta        = None
    buffer          = deque(maxlen=SEQUENCE_LENGTH)
    saved_countdown = 0
    seq_por_sesion  = 0
    seq_en_disco    = 0

    print("=" * 55)
    print("  LSCh Capturador v2.0 (mano + cara + pose)")
    print("=" * 55)
    print(f"  Features por frame : {N_FEATURES}")
    print(f"  Frames por secuencia: {SEQUENCE_LENGTH}")
    print("  [A-Z]   Seleccionar clase y grabar")
    print("  [SPACE] Cancelar grabacion")
    print("  [ESC]   Salir\n")

    try:
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            # Puntos sobre la imagen SIN voltear (ver formato.ESPEJAR_ENTRADA); el espejo es
            # solo para mostrar. Así lo capturado en vivo es compatible con el video y con DeafApp.
            if ESPEJAR_ENTRADA:
                frame = cv2.flip(frame, 1)
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            frame_rgb.flags.writeable = False
            results = holistic.process(frame_rgb)
            frame_rgb.flags.writeable = True

            frame = dibujar_holistic(frame, results)
            vec   = extraer_features(results)
            if not ESPEJAR_ENTRADA:
                frame = cv2.flip(frame, 1)
            sock.sendto(vec.tobytes(), (UDP_IP, UDP_PORT))

            if state == RECORDING:
                mano_visible = (
                    results.right_hand_landmarks is not None
                    or results.left_hand_landmarks is not None
                )
                if mano_visible:
                    # Se guarda en el formato de referencia (16:9) aunque la webcam sea 4:3; al avatar (UDP) sigue
                    # llegando el vector tal cual salió de MediaPipe.
                    buffer.append(corregir_aspecto(vec, frame.shape[1] / frame.shape[0]))
                    if len(buffer) == SEQUENCE_LENGTH:
                        idx = seq_en_disco + seq_por_sesion
                        guardar_secuencia(buffer, etiqueta, idx)
                        seq_por_sesion += 1
                        buffer.clear()
                        state           = SAVED
                        saved_countdown = 30
                        print(f"  OK [{etiqueta}] seq_{idx:04d}.npy  "
                              f"(sesion: {seq_por_sesion})")
                else:
                    buffer.clear()

            elif state == SAVED:
                saved_countdown -= 1
                if saved_countdown <= 0:
                    state = IDLE

            frame = dibujar_hud(frame, state, etiqueta,
                                len(buffer), seq_por_sesion, seq_en_disco)
            cv2.imshow("LSCh - Capturador", frame)

            key = cv2.waitKey(1) & 0xFF
            if key == 27:
                break
            elif key == 32:
                buffer.clear()
                state = IDLE
                print("  Cancelado.")
            elif key in KEYMAP and state != RECORDING:
                etiqueta       = KEYMAP[key]
                seq_en_disco   = contar_secuencias(etiqueta)
                seq_por_sesion = 0
                buffer.clear()
                state = RECORDING
                print(f"\n  Grabando '{etiqueta}'  ({seq_en_disco} en disco)")

    finally:
        cap.release()
        cv2.destroyAllWindows()
        sock.close()
        print(f"\n  Dataset en: {os.path.abspath(DATASET_PATH)}")


if __name__ == "__main__":
    main()
