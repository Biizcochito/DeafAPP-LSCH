import cv2
import mediapipe as mp
import os

# 1. Configuración de MediaPipe
mp_drawing = mp.solutions.drawing_utils
mp_hands = mp.solutions.hands

hands = mp_hands.Hands(
    static_image_mode=False,
    max_num_hands=2,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5)

# 2. Nombre del video
# IMPORTANTE: El video "prueba.mp4" debe estar en la misma carpeta que este archivo.
nombre_video = "Saludos.mp4"

# Verificamos si el archivo existe antes de intentar abrirlo
if not os.path.exists(nombre_video):
    print(f"\n[ERROR] ¡No encuentro el archivo '{nombre_video}'!")
    print("Asegúrate de que el video esté PEGADO junto a este script.")
    print(f"La carpeta actual es: {os.getcwd()}\n")
    exit()

# 3. Cargar el video
cap = cv2.VideoCapture(nombre_video)
print(f"¡Exito! Procesando el video: {nombre_video}...")

while cap.isOpened():
    success, image = cap.read()
    if not success:
        print("Fin del video.")
        break

    # Convertir de BGR a RGB para la IA
    image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

    # Procesar
    results = hands.process(image_rgb)

    # Dibujar los huesos si encuentra manos
    if results.multi_hand_landmarks:
        for hand_landmarks in results.multi_hand_landmarks:
            mp_drawing.draw_landmarks(
                image, hand_landmarks, mp_hands.HAND_CONNECTIONS)

    # Mostrar en ventana
    cv2.imshow('Prueba Tesis - Diego', image)

    # Salir con la tecla ESC
    if cv2.waitKey(25) & 0xFF == 27:
        break

cap.release()
cv2.destroyAllWindows()