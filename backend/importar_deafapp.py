"""
importar_deafapp.py — Trae las grabaciones APROBADAS de DeafApp al dataset de entrenamiento
═══════════════════════════════════════════════════════════════════════════════════════════
Lee de Supabase (solo lectura, con la clave pública) las filas de `grabaciones` con
aprobada = true, descarga cada JSON del bucket `contribuciones`, lo convierte a una secuencia
(30, 270) y la guarda en  dataset/<etiqueta>/deafapp_<id>.npy.

    py importar_deafapp.py --solo-listar          # qué hay, sin descargar nada
    py importar_deafapp.py                        # importa todo lo aprobado
    py importar_deafapp.py --categorias alimentos --limite 5

Garantías:
  • No escribe nada en Supabase ni modifica las grabaciones originales.
  • Es idempotente: lo ya importado (misma ruta y misma versión de moderación) no se repite.
  • Espeja la moderación: si una grabación deja de estar aprobada, su .npy se retira.
  • Un único camino para todas: fotogramas → Holistic (`--usar-puntos-web` usa en su lugar los
    puntos calculados por el navegador; solo existen en grabaciones nuevas y sin pose).
  • Lo que se omite queda anotado con su motivo en  dataset/_deafapp.json.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter
from pathlib import Path
from urllib.parse import quote

import numpy as np
import requests

import config
from convertir_deafapp import (
    aspecto_de_grabacion, decodificar_frames, porcentaje_con_manos, secuencia_desde_puntos_web,
)
from etiquetas import limpiar_etiqueta, ruta_segura
from formato import N_FEATURES, SEQUENCE_LENGTH

VERSION_MANIFIESTO = 1
VERSION_CONVERSION = 2        # 2: los puntos se llevan al formato de referencia 16:9 (formato.corregir_aspecto)
MAX_BYTES = 30_000_000        # tope por grabación (la web usa 25 MB)
NOMBRE_MANIFIESTO = "_deafapp.json"


def crear_sesion(clave: str) -> requests.Session:
    sesion = requests.Session()
    sesion.headers.update({"apikey": clave, "Authorization": f"Bearer {clave}"})
    return sesion


def listar_aprobadas(sesion: requests.Session, url: str) -> list[dict]:
    filas: list[dict] = []
    for desde in range(0, 10_000, 100):
        r = sesion.get(f"{url}/rest/v1/grabaciones", timeout=30, params={
            "select": "id,label,categoria,archivo_path,moderation_version",
            "aprobada": "eq.true", "order": "id", "limit": 100, "offset": desde,
        })
        r.raise_for_status()
        lote = r.json()
        filas.extend(lote)
        if len(lote) < 100:
            return filas
    raise RuntimeError("Hay más de 10.000 grabaciones aprobadas; ajusta el proceso antes de seguir.")


def descargar_grabacion(sesion: requests.Session, url: str, ruta: str) -> dict:
    if not isinstance(ruta, str) or ".." in ruta or not ruta.endswith(".json"):
        raise ValueError("Ruta de grabación no válida.")
    ultimo = None
    for destino in (f"{url}/storage/v1/object/public/contribuciones/{quote(ruta)}",
                    f"{url}/storage/v1/object/contribuciones/{quote(ruta)}"):
        with sesion.get(destino, stream=True, timeout=120) as r:
            if r.status_code in (400, 404):
                ultimo = r.status_code
                continue
            r.raise_for_status()
            partes, total = [], 0
            for trozo in r.iter_content(1 << 20):
                total += len(trozo)
                if total > MAX_BYTES:
                    raise ValueError("Grabación demasiado grande para este proceso.")
                partes.append(trozo)
            return json.loads(b"".join(partes))
    raise ValueError(f"No se encontró el archivo en el almacenamiento (HTTP {ultimo}).")


def guardar_npy(destino: Path, secuencia: np.ndarray) -> None:
    destino.parent.mkdir(parents=True, exist_ok=True)
    temporal = destino.with_suffix(".npy.tmp")
    with open(temporal, "wb") as f:
        np.save(f, secuencia.astype(np.float32))
    os.replace(temporal, destino)


def cargar_manifiesto(ruta: Path) -> dict:
    try:
        datos = json.loads(ruta.read_text(encoding="utf-8"))
        if datos.get("version") == VERSION_MANIFIESTO and isinstance(datos.get("items"), dict):
            return datos
    except (OSError, ValueError):
        pass
    return {"version": VERSION_MANIFIESTO, "items": {}}


def convertir(grabacion: dict, modo: str, args) -> tuple[np.ndarray, str]:
    """Devuelve (secuencia, fuente). Lanza ValueError con el motivo si no se puede usar."""
    if modo == "puntos-web":
        if not grabacion.get("training"):
            raise ValueError("sin puntos de la web (grabación anterior al 2026-10)")
        return secuencia_desde_puntos_web(grabacion["training"], aspecto=aspecto_de_grabacion(grabacion)), "puntos-web"
    try:
        from extractor_frames import extraer_secuencia
    except ImportError as error:
        raise SystemExit(
            f"Falta una dependencia para procesar fotogramas ({error}). Instala requirements.txt "
            "o usa --usar-puntos-web (solo grabaciones nuevas, sin pose)."
        )
    jpegs = decodificar_frames(grabacion)
    intervalo = grabacion.get("intervalMs")
    intervalo = intervalo if isinstance(intervalo, (int, float)) and 30 <= intervalo <= 1000 else 100
    return extraer_secuencia(jpegs, int(intervalo), args.min_confianza), "frames"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--salida", default="dataset", help="carpeta del dataset (por defecto: dataset)")
    ap.add_argument("--prefijo", default="deafapp", help="prefijo de los archivos importados")
    ap.add_argument("--categorias", default="", help="solo estas categorías, separadas por comas")
    ap.add_argument("--etiquetas", default="", help="solo estas etiquetas, separadas por comas")
    ap.add_argument("--limite", type=int, default=0, help="procesar como máximo N grabaciones")
    ap.add_argument("--min-manos", type=float, default=0.5, help="mínimo de fotogramas con mano (0 a 1)")
    ap.add_argument("--min-confianza", type=float, default=0.5, help="confianza mínima de MediaPipe")
    ap.add_argument("--usar-puntos-web", action="store_true", help="usar los puntos del navegador en vez de reprocesar")
    ap.add_argument("--solo-listar", action="store_true", help="mostrar lo aprobado y salir")
    ap.add_argument("--forzar", action="store_true", help="reprocesar aunque ya esté importado")
    ap.add_argument("--url", default=config.SUPABASE_URL)
    ap.add_argument("--clave", default=config.SUPABASE_KEY)
    args = ap.parse_args()

    modo = "puntos-web" if args.usar_puntos_web else "frames"
    sesion = crear_sesion(args.clave)
    filas = listar_aprobadas(sesion, args.url.rstrip("/"))
    cats = {c.strip() for c in args.categorias.split(",") if c.strip()}
    etqs = {limpiar_etiqueta(e) for e in args.etiquetas.split(",") if e.strip()}
    if cats:
        filas = [f for f in filas if f.get("categoria") in cats]
    if etqs:
        filas = [f for f in filas if limpiar_etiqueta(f.get("label")) in etqs]

    print(f"Grabaciones aprobadas{' (filtradas)' if cats or etqs else ''}: {len(filas)}")
    for etiqueta, n in sorted(Counter(str(f.get("label")) for f in filas).items()):
        print(f"  {etiqueta:<22} {n}")
    if args.solo_listar:
        return 0

    salida = Path(args.salida)
    ruta_manifiesto = salida / NOMBRE_MANIFIESTO
    manifiesto = cargar_manifiesto(ruta_manifiesto)
    items = manifiesto["items"]
    vigentes = {str(f["id"]) for f in filas} if not (cats or etqs or args.limite) else None

    resumen: Counter = Counter()
    motivos: Counter = Counter()
    pendientes = filas[: args.limite] if args.limite else filas
    for n, fila in enumerate(pendientes, 1):
        clave = str(fila["id"])
        previo = items.get(clave)
        npy_previo = salida / previo["npy"] if previo and previo.get("npy") else None
        if (previo and not args.forzar and previo.get("archivo_path") == fila["archivo_path"]
                and previo.get("moderation_version") == fila.get("moderation_version")
                and previo.get("modo") == modo
                and previo.get("conversion") == VERSION_CONVERSION      # lo importado sin corregir el aspecto se rehace
                and (previo["estado"] == "omitida" or (npy_previo and npy_previo.exists()))):
            resumen["sin cambios"] += 1
            continue
        etiqueta = limpiar_etiqueta(fila.get("label"))
        registro = {"estado": "omitida", "label": fila.get("label"), "categoria": fila.get("categoria"),
                    "archivo_path": fila["archivo_path"], "moderation_version": fila.get("moderation_version"), "modo": modo,
                    "conversion": VERSION_CONVERSION}
        try:
            if etiqueta is None:
                raise ValueError("etiqueta no válida")
            print(f"[{n:3d}/{len(pendientes)}] #{clave} «{etiqueta}» ", end="", flush=True)
            grabacion = descargar_grabacion(sesion, args.url.rstrip("/"), fila["archivo_path"])
            secuencia, fuente = convertir(grabacion, modo, args)
            if secuencia.shape != (SEQUENCE_LENGTH, N_FEATURES):
                raise ValueError(f"forma inesperada {secuencia.shape}")
            manos = porcentaje_con_manos(secuencia)
            if manos < args.min_manos:
                raise ValueError(f"solo {manos:.0%} de fotogramas con mano (mínimo {args.min_manos:.0%})")
            destino = ruta_segura(salida, etiqueta, f"{args.prefijo}_{clave}.npy")
            guardar_npy(destino, secuencia)
            registro.update(estado="importada", fuente=fuente, manos=round(manos, 3),
                            npy=str(destino.relative_to(salida.resolve())).replace("\\", "/"))
            if npy_previo and npy_previo.exists() and npy_previo.resolve() != destino:
                npy_previo.unlink()
            resumen["importadas"] += 1
            print(f"→ {destino.name}  ({manos:.0%} con mano, {fuente})")
        except (ValueError, requests.RequestException, KeyError) as error:
            motivo = str(error)
            registro["motivo"] = motivo
            resumen["omitidas"] += 1
            motivos[motivo.split(" (")[0].split(":")[0]] += 1
            print(f"→ omitida: {motivo}")
            if npy_previo and npy_previo.exists():
                npy_previo.unlink()
        items[clave] = registro

    # Espejo de la moderación: lo que ya no está aprobado no debe seguir en el dataset.
    if vigentes is not None:
        for clave, registro in items.items():
            if clave not in vigentes and registro.get("estado") != "retirada":
                npy = salida / registro["npy"] if registro.get("npy") else None
                if npy and npy.exists():
                    npy.unlink()
                registro["estado"] = "retirada"
                registro.pop("npy", None)
                resumen["retiradas"] += 1

    salida.mkdir(parents=True, exist_ok=True)
    ruta_manifiesto.write_text(json.dumps(manifiesto, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("\nResumen:", dict(resumen))
    if motivos:
        print("Motivos de omisión:", dict(motivos))
    importadas = Counter(r["label"] for r in items.values() if r.get("estado") == "importada")
    print(f"Importadas en total: {sum(importadas.values())} en {len(importadas)} etiquetas → {salida.resolve()}")
    print("Manifiesto:", ruta_manifiesto.resolve())
    return 0


if __name__ == "__main__":
    sys.exit(main())
