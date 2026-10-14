import cv2
import mediapipe as mp
import pickle
import numpy as np
from collections import deque

with open('modelo_señas.pkl', 'rb') as f:
    modelo = pickle.load(f)

mpHands = mp.solutions.hands
hands = mpHands.Hands(static_image_mode=False, min_detection_confidence=0.7)
mpDraw = mp.solutions.drawing_utils

cap = cv2.VideoCapture(1)
# Creamos una cola para guardar las últimas 5 predicciones
predicciones_buffer = deque(maxlen=5)

print("Iniciando IA suave... Presiona ESC para salir.")

while True:
    ret, img = cap.read()
    if not ret: break

    img = cv2.flip(img, 1)
    imgRGB = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    results = hands.process(imgRGB)

    if results.multi_hand_landmarks:
        for hand_landmarks in results.multi_hand_landmarks:
            data = []
            for lm in hand_landmarks.landmark:
                data.extend([lm.x, lm.y, lm.z])

            # Predicción
            prediccion = modelo.predict([np.array(data)])[0]
            predicciones_buffer.append(prediccion)

            # Votación: Qué letra salió más veces en los últimos 5 frames
            letra_final = max(set(predicciones_buffer), key=predicciones_buffer.count)

            cv2.putText(img, f"Letra: {letra_final}", (50, 80),
                        cv2.FONT_HERSHEY_SIMPLEX, 2, (0, 255, 0), 3)
            mpDraw.draw_landmarks(img, hand_landmarks, mpHands.HAND_CONNECTIONS)

    cv2.imshow("IA de Señas en Tiempo Real", img)
    if cv2.waitKey(1) & 0xFF == 27: break

cap.release()
cv2.destroyAllWindows()