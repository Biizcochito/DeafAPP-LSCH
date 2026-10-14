"""
probar_api.py — Comprueba que la API responde, también desde otro equipo o a través de un túnel
══════════════════════════════════════════════════════════════════════════════════════════════
Hace lo que haría la web, paso a paso, y dice qué falla y por qué:

    py probar_api.py                                          # contra http://localhost:5000
    py probar_api.py --url https://algo.trycloudflare.com     # contra el túnel
    py probar_api.py --origen https://deafapp-lsch.deafapp-lsch.workers.dev

  1. GET /estado           ¿está activa, con cuántas clases y con qué preprocesado?
  2. CORS                  ¿deja pasar a la web? (el navegador bloquea las respuestas si no)
  3. POST /clasificar      con una secuencia real del dataset: devuelve las 3 señas más probables
  4. POST /clasificar      con basura: debe rechazarla con 400, no con un error del servidor

Termina con código 0 si todo está bien y 1 si algo falla (sirve para scripts).
"""

from __future__ import annotations

import argparse
import base64
import sys
from pathlib import Path

import numpy as np

ORIGEN_WEB = "https://deafapp-lsch.deafapp-lsch.workers.dev"


def buscar_secuencia(carpeta: str | Path = "dataset") -> tuple[np.ndarray, str] | None:
    """Una secuencia natural (no copia aumentada ni dañada) del dataset local y su etiqueta, o None."""
    from calidad import z_recortado
    from formato import N_FEATURES, SEQUENCE_LENGTH
    from particion import es_aumentada

    raiz = Path(carpeta)
    if not raiz.is_dir():
        return None
    for clase in sorted(d for d in raiz.iterdir() if d.is_dir() and not d.name.startswith(("_", "."))):
        for archivo in sorted(clase.glob("*.npy"))[:60]:
            if es_aumentada(archivo.name):
                continue
            try:
                seq = np.load(archivo, allow_pickle=False)
            except Exception:
                continue
            if seq.shape == (SEQUENCE_LENGTH, N_FEATURES) and not z_recortado(seq):
                return seq.astype(np.float32), clase.name
    return None


def probar(sesion, base: str, origen: str, secuencia: np.ndarray | None, etiqueta: str | None) -> list[tuple[str, bool, str]]:
    """Devuelve [(paso, ok, detalle)]. `sesion` tiene get/post/options como requests.Session."""
    resultados: list[tuple[str, bool, str]] = []

    def anotar(paso: str, ok: bool, detalle: str) -> None:
        resultados.append((paso, ok, detalle))

    # 1. /estado
    try:
        r = sesion.get(f"{base}/estado", timeout=15)
        datos = r.json()
        ok = r.status_code == 200 and datos.get("estado") == "activo"
        anotar("GET /estado", ok, f"versión {datos.get('version')}, {len(datos.get('clases', []))} clases, "
                                  f"Supabase {'conectado' if datos.get('supabase') else 'no conectado'}" if ok
               else f"HTTP {r.status_code}")
    except Exception as error:
        anotar("GET /estado", False, f"no se pudo conectar: {error}")
        return resultados                           # sin servidor no tiene sentido seguir

    # 2. CORS (la petición previa que hace el navegador antes de un POST con JSON)
    try:
        r = sesion.options(f"{base}/clasificar", headers={
            "Origin": origen, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type"},
            timeout=15)
        permitido = r.headers.get("Access-Control-Allow-Origin")
        ok = permitido in ("*", origen)
        anotar("CORS desde la web", ok, f"permite «{permitido}»" if ok else
               f"el servidor no permite el origen {origen} (devuelve «{permitido}»). Define LSCH_CORS_ORIGINS={origen}")
    except Exception as error:
        anotar("CORS desde la web", False, str(error))

    # 3. /clasificar con una secuencia real
    if secuencia is None:
        anotar("POST /clasificar", False, "no hay secuencia de prueba (usa --secuencia archivo.npy o ejecuta desde la carpeta del proyecto)")
    else:
        cuerpo = {"secuencia": base64.b64encode(np.ascontiguousarray(secuencia, dtype=np.float32).tobytes()).decode()}
        try:
            r = sesion.post(f"{base}/clasificar", json=cuerpo, timeout=30)
            datos = r.json()
            candidatos = datos.get("candidatos") or []
            ok = r.status_code == 200 and len(candidatos) > 0
            texto = ", ".join(f"{c['sena']} {c['confianza']:.2f}" for c in candidatos) if ok else f"HTTP {r.status_code}: {datos.get('error')}"
            if ok and etiqueta:
                texto += (f"   (la secuencia era «{etiqueta}»: {'está entre las 3' if etiqueta in [c['sena'] for c in candidatos] else 'no está entre las 3'}; "
                          "es una secuencia del dataset de entrenamiento: prueba la conexión, no el acierto)")
            anotar("POST /clasificar", ok, texto)
        except Exception as error:
            anotar("POST /clasificar", False, str(error))

    # 4. entrada inválida
    try:
        r = sesion.post(f"{base}/clasificar", json={"secuencia": "esto no es base64 válido ¡¡"}, timeout=15)
        anotar("rechaza entradas inválidas", r.status_code == 400, f"HTTP {r.status_code}" + ("" if r.status_code == 400 else " (se esperaba 400)"))
    except Exception as error:
        anotar("rechaza entradas inválidas", False, str(error))
    return resultados


def main(argv: list[str] | None = None, sesion=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--url", default="http://localhost:5000", help="dirección de la API (por defecto, este PC)")
    ap.add_argument("--origen", default=ORIGEN_WEB, help="origen de la web que llamará a la API (para comprobar CORS)")
    ap.add_argument("--secuencia", default=None, help="archivo .npy (30, 270) de prueba; por defecto, uno de dataset/")
    ap.add_argument("--dataset", default="dataset")
    a = ap.parse_args(argv)

    secuencia, etiqueta = None, None
    if a.secuencia:
        secuencia = np.load(a.secuencia, allow_pickle=False)
    else:
        encontrada = buscar_secuencia(a.dataset)
        if encontrada:
            secuencia, etiqueta = encontrada
    if sesion is None:
        import requests
        sesion = requests.Session()

    print(f"Probando {a.url.rstrip('/')}  (la web llamaría desde {a.origen})\n")
    resultados = probar(sesion, a.url.rstrip("/"), a.origen, secuencia, etiqueta)
    for paso, ok, detalle in resultados:
        print(f"  {'✓' if ok else '✗'} {paso:<28} {detalle}")
    todo_bien = bool(resultados) and all(ok for _, ok, _ in resultados)
    print("\n" + ("Todo bien: la API responde como la espera la web." if todo_bien else "Hay pasos que fallan; revisa los mensajes de arriba."))
    return 0 if todo_bien else 1


if __name__ == "__main__":
    sys.exit(main())
