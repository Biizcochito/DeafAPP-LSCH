import cv2
import mediapipe as mp
import json
import os

# --- CONFIGURACIÓN ---
nombre_video = "prueba.mp4"  # El video de tu amigo
nombre_archivo_salida = "datos_seña.json" # El archivo que vamos a crear

# 1. Inicializar MediaPipe
mp_hands = mp.solutions.hands
hands = mp_hands.Hands(
    static_image_mode=False,
    max_num_hands=2,
    min_detection_confidence=0.5)

# 2. Verificar video
if not os.path.exists(nombre_video):
    print(f"ERROR: No encuentro {nombre_video}")
    exit()

cap = cv2.VideoCapture(nombre_video)
datos_grabados = [] # Aquí guardaremos toda la información frame a frame

print(f"Procesando {nombre_video}... Esto puede tardar un poco.")

frame_count = 0
while cap.isOpened():
    success, image = cap.read()
    if not success:
        break

    # Convertir a RGB
    image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    results = hands.process(image_rgb)

    frame_data = {
        "frame": frame_count,
        "manos": []
    }

    if results.multi_hand_landmarks:
        # Si detecta manos, guardamos los 21 puntos de cada una
        for i, hand_landmarks in enumerate(results.multi_hand_landmarks):
            mano_info = {
                "indice_mano": i, # 0 para la primera mano, 1 para la segunda
                "puntos": []
            }

            for lm in hand_landmarks.landmark:
                # Guardamos X, Y, Z de cada punto (dedo)
                mano_info["puntos"].append({
                    "x": lm.x,
                    "y": lm.y,
                    "z": lm.z
                })

            frame_data["manos"].append(mano_info)

    datos_grabados.append(frame_data)
    frame_count += 1

    # Imprimir progreso cada 30 frames para saber que no se pegó
    if frame_count % 30 == 0:
        print(f"Procesando frame {frame_count}...")

cap.release()

# 3. Guardar en JSON
with open(nombre_archivo_salida, 'w') as f:
    json.dump(datos_grabados, f)

print(f"\n¡LISTO! Se creó el archivo '{nombre_archivo_salida}' con {frame_count} cuadros grabados.")
print("Este es el archivo que luego le daremos a Unity.")