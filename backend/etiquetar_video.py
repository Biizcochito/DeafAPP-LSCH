"""
etiquetar_video.py — Etiquetador manual de señas en video (con audio sincronizado)
"""

import cv2
import json
import os
import subprocess
import tempfile
from pathlib import Path

import pygame

# ── CONFIGURACIÓN ──────────────────────────────────────────────────
VIDEO_PATH = r"C:\Users\Lissette\Downloads\videos-senas\Alimentos_360p.mp4"


def extraer_audio(video_path: str) -> str:
    tmp = tempfile.NamedTemporaryFile(suffix='.wav', delete=False)
    tmp.close()
    subprocess.run([
        'ffmpeg', '-i', video_path,
        '-vn', '-acodec', 'pcm_s16le',
        '-ar', '44100', '-ac', '2',
        tmp.name, '-y', '-loglevel', 'quiet'
    ], check=True)
    return tmp.name


def etiquetar_video(video_path: str) -> None:
    print("Extrayendo audio...")
    audio_path = extraer_audio(video_path)

    pygame.mixer.init(frequency=44100, size=-16, channels=2, buffer=512)
    pygame.mixer.music.load(audio_path)

    cap          = cv2.VideoCapture(video_path)
    fps          = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duracion     = total_frames / fps
    frame_delay  = max(1, int(1000 / fps))   # ms por frame según FPS real

    print(f"Video: {Path(video_path).name}  |  {duracion:.1f}s  |  {fps:.0f}fps\n")
    print("CONTROLES:")
    print("  [S]     Marcar INICIO de sena")
    print("  [E]     Marcar FIN de sena")
    print("  [SPACE] Pausar / Reanudar")
    print("  [ESC]   Terminar y etiquetar\n")

    marcas     = []
    start_time = None
    paused     = False
    frame      = None

    pygame.mixer.music.play()

    while cap.isOpened():
        if not paused:
            # ── Sincronizar video con el reloj del audio ──────────
            audio_ms = pygame.mixer.music.get_pos()  # posicion del audio en ms
            if audio_ms >= 0:
                target_frame  = int((audio_ms / 1000.0) * fps)
                current_frame = int(cap.get(cv2.CAP_PROP_POS_FRAMES))
                drift         = target_frame - current_frame

                if drift > 3:
                    # Video atrasado → saltar frames para alcanzar el audio
                    cap.set(cv2.CAP_PROP_POS_FRAMES, target_frame)

            ret, frame = cap.read()
            if not ret:
                print("\nVideo terminado.")
                break

        if frame is None:
            cv2.waitKey(frame_delay)
            continue

        current_frame = int(cap.get(cv2.CAP_PROP_POS_FRAMES))
        current_time  = current_frame / fps
        mins = int(current_time // 60)
        secs = current_time % 60

        # HUD
        display = frame.copy()
        h, w    = display.shape[:2]
        overlay = display.copy()
        cv2.rectangle(overlay, (0, 0), (w, 62), (20, 20, 20), -1)
        cv2.addWeighted(overlay, 0.75, display, 0.25, 0, display)

        cv2.putText(display, f"{mins:02d}:{secs:05.2f}",
                    (10, 42), cv2.FONT_HERSHEY_SIMPLEX,
                    1.1, (255, 255, 255), 2, cv2.LINE_AA)

        if start_time is not None:
            cv2.putText(display, f"REC desde {start_time:.1f}s",
                        (210, 42), cv2.FONT_HERSHEY_SIMPLEX,
                        0.85, (0, 60, 255), 2, cv2.LINE_AA)

        cv2.putText(display, f"Marcadas: {len(marcas)}",
                    (w - 210, 42), cv2.FONT_HERSHEY_SIMPLEX,
                    0.8, (0, 200, 80), 2, cv2.LINE_AA)

        if paused:
            cv2.putText(display, "PAUSA",
                        (w // 2 - 60, h // 2),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        1.8, (0, 200, 255), 3, cv2.LINE_AA)

        cv2.imshow("LSCh - Etiquetador", display)

        # frame_delay controla la velocidad del video según su FPS real
        key = cv2.waitKey(frame_delay if not paused else 50) & 0xFF

        if key == 27:   # ESC
            break
        elif key == 32: # SPACE
            paused = not paused
            if paused:
                pygame.mixer.music.pause()
                cap.set(cv2.CAP_PROP_POS_FRAMES, current_frame)
            else:
                pygame.mixer.music.unpause()
        elif key in (ord('s'), ord('S')):
            start_time = current_time
            print(f"  INICIO: {mins:02d}:{secs:05.2f}")
        elif key in (ord('e'), ord('E')):
            if start_time is not None:
                marcas.append({
                    'start': round(start_time, 2),
                    'end':   round(current_time, 2),
                    'label': None,
                })
                print(f"  FIN:    {mins:02d}:{secs:05.2f} -> segmento #{len(marcas)}")
                start_time = None
            else:
                print("  Primero presiona S para marcar el inicio.")

    cap.release()
    cv2.destroyAllWindows()
    pygame.mixer.music.stop()
    pygame.mixer.quit()

    try:
        os.unlink(audio_path)
    except Exception:
        pass

    if not marcas:
        print("\nNo se marcaron senas.")
        return

    # Etiquetar cada segmento
    print(f"\n{'='*55}")
    print("  Escribe el nombre de cada sena")
    print(f"{'='*55}\n")

    for i, marca in enumerate(marcas):
        s  = marca['start']
        e  = marca['end']
        sm, ss = int(s // 60), s % 60
        em, es = int(e // 60), e % 60
        print(f"  [{i+1:02d}] {sm:02d}:{ss:05.2f} -> {em:02d}:{es:05.2f}  ({e-s:.1f}s)")
        nombre = input("  Nombre de la sena: ").strip().lower()
        marca['label'] = nombre

    video_stem  = Path(video_path).stem
    output_path = str(Path(video_path).parent / f"{video_stem}_etiquetas.json")

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump({
            'video':     video_path,
            'fps':       fps,
            'segmentos': marcas,
        }, f, ensure_ascii=False, indent=2)

    print(f"\n  Guardado: {output_path}")
    print(f"  Total senas: {len(marcas)}")
    print("\n  Siguiente paso: py extraer_senas.py")


if __name__ == "__main__":
    etiquetar_video(VIDEO_PATH)
