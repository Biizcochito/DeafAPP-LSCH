"""
palabras_faltantes.py — Qué palabras necesitan más grabaciones para que el modelo las aprenda
══════════════════════════════════════════════════════════════════════════════════════════════
Con 1 o 2 grabaciones por palabra el modelo no aprende nada; con ~10 de personas distintas, sí. Este
informe cruza el catálogo de DeafApp (531 palabras, catalogo_palabras.json) con lo que ya hay:

  • las grabaciones APROBADAS de DeafApp (solo lectura, con la clave pública);
  • opcionalmente, los originales independientes del dataset local (--dataset dataset).

No escribe nada en Supabase ni cambia la web: es una lista para que el equipo sepa qué pedir y a quién.
Solo ve las aprobadas (lo único que permite la clave pública): una palabra con grabaciones pendientes de
moderación aparece con menos de las que tiene.

    py palabras_faltantes.py                            # resumen por categoría y las palabras con más déficit
    py palabras_faltantes.py --categoria alimentos      # una categoría completa
    py palabras_faltantes.py --objetivo 15 --csv faltan.csv
    py palabras_faltantes.py --dataset dataset          # suma los originales independientes del dataset local
    py palabras_faltantes.py --plan alimentos,saludos   # cuántas personas hacen falta para completar un vocabulario inicial
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import Counter
from pathlib import Path

import config
from etiquetas import limpiar_etiqueta

OBJETIVO_POR_DEFECTO = 10
CATALOGO_POR_DEFECTO = Path(__file__).resolve().parent / "catalogo_palabras.json"


def cargar_catalogo(ruta: str | Path = CATALOGO_POR_DEFECTO) -> dict[str, dict]:
    """{categoria_id: {"nombre": ..., "palabras": [...]}} desde catalogo_palabras.json."""
    datos = json.loads(Path(ruta).read_text(encoding="utf-8"))
    categorias = datos.get("categorias")
    if not isinstance(categorias, dict) or not categorias:
        raise ValueError(f"{ruta} no tiene el formato esperado (falta «categorias»).")
    return categorias


def contar_aprobadas(filas: list[dict]) -> Counter:
    """Grabaciones aprobadas por etiqueta normalizada."""
    cuenta: Counter = Counter()
    for fila in filas:
        etiqueta = limpiar_etiqueta(fila.get("label"))
        if etiqueta is not None:
            cuenta[etiqueta] += 1
    return cuenta


def contar_locales(carpeta: str | Path) -> Counter:
    """Originales INDEPENDIENTES por etiqueta en un dataset local (repeticiones casi idénticas cuentan una vez)."""
    import numpy as np
    from datos_entrenamiento import cargar_dataset
    from particion import construir_grupos

    ds = cargar_dataset(carpeta)
    grupos = construir_grupos(ds.y, ds.nombres, ds.X)
    cuenta: Counter = Counter()
    for clase in sorted(set(ds.y.tolist())):
        miembros = np.flatnonzero((ds.y == clase) & ds.es_original)
        etiqueta = limpiar_etiqueta(clase)
        if etiqueta is not None and len(miembros):
            cuenta[etiqueta] += len({int(grupos[i]) for i in miembros})
    return cuenta


def calcular_faltantes(catalogo: dict[str, dict], conteos: Counter, objetivo: int = OBJETIVO_POR_DEFECTO) -> dict:
    """Une catálogo y conteos.

    Devuelve {"filas": [{categoria, palabra, grabaciones, faltan}], "por_categoria": {...}, "resumen": {...},
              "fuera_del_catalogo": {etiqueta: n}}.
    Una palabra que está en varias categorías comparte el mismo conteo y se cuenta una vez en el resumen.
    """
    filas = []
    for categoria, datos in catalogo.items():
        for palabra in datos["palabras"]:
            clave = limpiar_etiqueta(palabra)
            n = int(conteos.get(clave, 0)) if clave else 0
            filas.append({"categoria": categoria, "palabra": palabra, "grabaciones": n,
                          "faltan": max(0, objetivo - n)})
    por_categoria = {}
    for categoria, datos in catalogo.items():
        mias = [f for f in filas if f["categoria"] == categoria]
        por_categoria[categoria] = {
            "nombre": datos.get("nombre", categoria), "palabras": len(mias),
            "completas": sum(f["grabaciones"] >= objetivo for f in mias),
            "con_algo": sum(0 < f["grabaciones"] < objetivo for f in mias),
            "sin_nada": sum(f["grabaciones"] == 0 for f in mias),
            "faltan": sum(f["faltan"] for f in mias),
        }
    unicas = {}
    for f in filas:
        unicas[limpiar_etiqueta(f["palabra"])] = f["grabaciones"]
    en_catalogo = set(unicas)
    resumen = {
        "objetivo": objetivo,
        "palabras": len(unicas),
        "completas": sum(n >= objetivo for n in unicas.values()),
        "con_algo": sum(0 < n < objetivo for n in unicas.values()),
        "sin_nada": sum(n == 0 for n in unicas.values()),
        "grabaciones_que_faltan": sum(max(0, objetivo - n) for n in unicas.values()),
        "grabaciones_en_el_catalogo": sum(unicas.values()),
    }
    fuera = {e: n for e, n in sorted(conteos.items()) if e not in en_catalogo}
    return {"filas": filas, "por_categoria": por_categoria, "resumen": resumen, "fuera_del_catalogo": fuera}


def plan_de_grabacion(informe: dict, categorias: list[str]) -> dict:
    """Cuántas personas y cuántas palabras por persona hacen falta para completar unas categorías.

    Si cada persona graba UNA vez cada palabra que aún no llega al objetivo, la palabra con más déficit
    marca cuántas personas distintas se necesitan; cada una graba todas las palabras con déficit.
    """
    desconocidas = [c for c in categorias if c not in informe["por_categoria"]]
    if desconocidas:
        raise ValueError(f"Categorías inexistentes: {', '.join(desconocidas)}")
    deficit: dict[str, int] = {}
    for f in informe["filas"]:
        if f["categoria"] in categorias and f["faltan"] > 0:
            deficit[f["palabra"]] = f["faltan"]                     # una palabra repetida en dos categorías cuenta una vez
    return {
        "categorias": categorias,
        "palabras": sorted(deficit),
        "personas_necesarias": max(deficit.values(), default=0),
        "palabras_por_persona": len(deficit),
        "grabaciones_en_total": sum(deficit.values()),
    }


def escribir_csv(filas: list[dict], ruta: str | Path) -> None:
    """CSV para compartir (utf-8 con BOM, para que Excel respete las tildes), ordenado por déficit."""
    ordenadas = sorted(filas, key=lambda f: (-f["faltan"], f["categoria"], f["palabra"]))
    with open(ruta, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=["categoria", "palabra", "grabaciones", "faltan"])
        w.writeheader()
        w.writerows(ordenadas)


def _imprimir(informe: dict, categoria: str | None, limite: int, plan: dict | None = None) -> None:
    r = informe["resumen"]
    print(f"Catálogo: {r['palabras']} palabras distintas. Objetivo: {r['objetivo']} grabaciones por palabra.")
    print(f"  completas (≥ {r['objetivo']}): {r['completas']}   con algo pero pocas: {r['con_algo']}   sin ninguna: {r['sin_nada']}")
    print(f"  grabaciones que faltan para llegar al objetivo en todas: {r['grabaciones_que_faltan']}\n")
    if categoria is None:
        print(f"{'categoría':<20}{'palabras':>9}{'completas':>10}{'con algo':>9}{'sin nada':>9}{'faltan':>8}")
        for cid, c in sorted(informe["por_categoria"].items(), key=lambda kv: (-kv[1]["con_algo"] - kv[1]["completas"], kv[0])):
            print(f"{c['nombre']:<20}{c['palabras']:>9}{c['completas']:>10}{c['con_algo']:>9}{c['sin_nada']:>9}{c['faltan']:>8}")
        con_algo = sorted((f for f in informe["filas"] if 0 < f["grabaciones"] < r["objetivo"]),
                          key=lambda f: (-f["grabaciones"], f["categoria"], f["palabra"]))
        print(f"\nPalabras que ya tienen algo y están más cerca del objetivo (las más baratas de completar), {min(limite, len(con_algo))} de {len(con_algo)}:")
        for f in con_algo[:limite]:
            print(f"  {f['palabra']:<22}{f['categoria']:<18}{f['grabaciones']:>3} grabaciones, faltan {f['faltan']}")
    else:
        filas = [f for f in informe["filas"] if f["categoria"] == categoria]
        if not filas:
            print(f"No existe la categoría «{categoria}». Disponibles: {', '.join(informe['por_categoria'])}")
            return
        print(f"Categoría {informe['por_categoria'][categoria]['nombre']}:")
        for f in sorted(filas, key=lambda f: (-f["grabaciones"], f["palabra"])):
            print(f"  {f['palabra']:<22}{f['grabaciones']:>3} grabaciones, faltan {f['faltan']}")
    if plan is not None:
        print(f"\nPlan para {', '.join(plan['categorias'])}:")
        print(f"  {plan['palabras_por_persona']} palabras con déficit; si cada persona graba cada una una vez, hacen falta "
              f"{plan['personas_necesarias']} personas distintas ({plan['grabaciones_en_total']} grabaciones en total).")
        print("  Palabras: " + ", ".join(plan["palabras"]))
    if informe["fuera_del_catalogo"]:
        print(f"\nEtiquetas con grabaciones que no están en el catálogo ({len(informe['fuera_del_catalogo'])}): "
              + ", ".join(f"{e} ({n})" for e, n in list(informe["fuera_del_catalogo"].items())[:20]))


def main(argv: list[str] | None = None, sesion=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--objetivo", type=int, default=OBJETIVO_POR_DEFECTO, help="grabaciones deseadas por palabra")
    ap.add_argument("--categoria", default=None, help="mostrar solo esta categoría (id, por ejemplo alimentos)")
    ap.add_argument("--catalogo", default=str(CATALOGO_POR_DEFECTO))
    ap.add_argument("--dataset", default=None, help="sumar los originales independientes de este dataset local")
    ap.add_argument("--plan", default=None, help="categorías separadas por comas: calcula cuántas personas hacen falta para completarlas")
    ap.add_argument("--csv", default=None, help="escribir la lista completa en este CSV")
    ap.add_argument("--limite", type=int, default=25, help="cuántas palabras listar en el resumen")
    ap.add_argument("--url", default=config.SUPABASE_URL)
    ap.add_argument("--clave", default=config.SUPABASE_KEY)
    a = ap.parse_args(argv)

    from importar_deafapp import crear_sesion, listar_aprobadas

    catalogo = cargar_catalogo(a.catalogo)
    sesion = sesion or crear_sesion(a.clave)
    conteos = contar_aprobadas(listar_aprobadas(sesion, a.url.rstrip("/")))
    if a.dataset:
        for etiqueta, n in contar_locales(a.dataset).items():
            conteos[etiqueta] += n
    informe = calcular_faltantes(catalogo, conteos, a.objetivo)
    plan = plan_de_grabacion(informe, [c.strip() for c in a.plan.split(",") if c.strip()]) if a.plan else None
    _imprimir(informe, a.categoria, a.limite, plan)
    if a.csv:
        escribir_csv(informe["filas"], a.csv)
        print(f"\nCSV: {Path(a.csv).resolve()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
