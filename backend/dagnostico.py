import sys
print(f"Versión de Python: {sys.version}")

try:
    import mediapipe as mp
    print(f"MediaPipe se importó desde: {mp.__file__}")
    print("Intentando acceder a solutions...")
    print(f"Solutions existe: {mp.solutions}")
    print("¡TODO FUNCIONA! Ya puedes correr test_manos.py")
except Exception as e:
    print(f"\n[ERROR FATAL]: {e}")
    print(f"Contenido de mediapipe: {dir(mp)}")