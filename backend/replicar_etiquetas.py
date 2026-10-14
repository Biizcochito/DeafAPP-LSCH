"""
replicar_etiquetas.py — Replica etiquetas JSON para video repetido N veces
═══════════════════════════════════════════════════════════════════════════
Toma el JSON de etiquetas de una vuelta del video y genera
automáticamente las etiquetas para todas las repeticiones.

Ejemplo: video original de 63s repetido 5 veces → 315s total
  Vuelta 1: arroz  3.2s →  4.8s
  Vuelta 2: arroz 66.2s → 67.8s  (+ 63s)
  Vuelta 3: arroz 129.2s → 130.8s (+ 63s × 2)
  ...
"""

import json
from pathlib import Path

# ── CONFIGURACIÓN ──────────────────────────────────────────────────
JSON_ORIGINAL  = r"C:\Users\Lissette\Downloads\videos-senas\Alimentos_360p_etiquetas.json"
VIDEO_NUEVO    = r"C:\Users\Lissette\Downloads\videos-senas\Alimentos_x5.mp4"
DURACION_VIDEO = 63.0   # duración en segundos de UNA vuelta
N_REPETICIONES = 5      # cuántas veces se repite el video


def replicar_etiquetas(json_path: str, video_nuevo: str,
                       duracion: float, n_reps: int) -> None:

    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    segmentos_originales = data['segmentos']
    fps                  = data['fps']

    # Filtrar solo los que tienen etiqueta
    segmentos_validos = [
        s for s in segmentos_originales if s.get('label')
    ]

    print(f"Segmentos originales con etiqueta: {len(segmentos_validos)}")
    print(f"Repeticiones: {n_reps}")
    print(f"Duración por vuelta: {duracion}s\n")

    todos_los_segmentos = []

    for vuelta in range(n_reps):
        offset = duracion * vuelta
        for seg in segmentos_validos:
            nuevo_seg = {
                'start': round(seg['start'] + offset, 2),
                'end':   round(seg['end']   + offset, 2),
                'label': seg['label'],
            }
            todos_los_segmentos.append(nuevo_seg)
        print(f"  Vuelta {vuelta + 1}: {len(segmentos_validos)} señas "
              f"({offset:.0f}s → {offset + duracion:.0f}s)")

    # Guardar nuevo JSON
    output_path = str(Path(video_nuevo).parent /
                      f"{Path(video_nuevo).stem}_etiquetas.json")

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump({
            'video':     video_nuevo,
            'fps':       fps,
            'segmentos': todos_los_segmentos,
        }, f, ensure_ascii=False, indent=2)

    print(f"\n  Total segmentos generados: {len(todos_los_segmentos)}")
    print(f"  Guardado en: {output_path}")
    print(f"\n  Siguiente paso: actualiza JSON_PATH en extraer_senas.py")
    print(f"  con: {output_path}")


if __name__ == "__main__":
    replicar_etiquetas(JSON_ORIGINAL, VIDEO_NUEVO,
                       DURACION_VIDEO, N_REPETICIONES)
