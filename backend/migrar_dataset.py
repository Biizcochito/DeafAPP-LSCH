"""
migrar_dataset.py — Retira del dataset las copias dañadas por el aumento antiguo
═════════════════════════════════════════════════════════════════════════════════
La versión anterior de augmentar_dataset.py recortaba z a [0, 1], así que casi todas sus copias
tienen z = 0 donde el original tenía profundidad negativa (ver calidad.py). Entrenar con ellas
enseña al modelo un dato que nunca existe en vivo.

Este script NO borra nada: mueve esas secuencias a otra carpeta (por defecto
`dataset_legado/`) conservando la estructura por clase, y deja un registro para deshacerlo.
Después se regeneran copias correctas con  py augmentar_dataset.py.

    py migrar_dataset.py                 # solo muestra qué movería (simulación)
    py migrar_dataset.py --aplicar       # mueve de verdad
    py migrar_dataset.py --revertir      # devuelve lo movido a su sitio
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from collections import Counter
from pathlib import Path

import numpy as np

from calidad import z_recortado
from formato import N_FEATURES, SEQUENCE_LENGTH
from particion import es_aumentada

REGISTRO = "_migracion.json"


def planificar(raiz: Path) -> list[tuple[str, str]]:
    """[(clase, archivo)] de las secuencias sin marcar cuyo z fue recortado."""
    candidatas: list[tuple[str, str]] = []
    for carpeta in sorted(d for d in raiz.iterdir() if d.is_dir() and not d.name.startswith(("_", "."))):
        for archivo in sorted(carpeta.glob("*.npy")):
            if es_aumentada(archivo.name):
                continue
            try:
                seq = np.load(archivo, allow_pickle=False)
            except Exception:
                continue
            if seq.shape == (SEQUENCE_LENGTH, N_FEATURES) and z_recortado(seq):
                candidatas.append((carpeta.name, archivo.name))
    return candidatas


def aplicar(raiz: Path, destino: Path, movimientos: list[tuple[str, str]]) -> int:
    registro_ruta = destino / REGISTRO
    previos = json.loads(registro_ruta.read_text(encoding="utf-8")) if registro_ruta.exists() else []
    hechos = 0
    for clase, nombre in movimientos:
        origen = raiz / clase / nombre
        final = destino / clase / nombre
        if final.exists():
            print(f"  Omitido (ya existe en destino): {clase}/{nombre}")
            continue
        final.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(origen), str(final))
        previos.append({"clase": clase, "archivo": nombre})
        hechos += 1
    destino.mkdir(parents=True, exist_ok=True)
    registro_ruta.write_text(json.dumps(previos, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return hechos


def revertir(raiz: Path, destino: Path) -> int:
    registro_ruta = destino / REGISTRO
    if not registro_ruta.exists():
        print("  No hay registro de migración; nada que revertir.")
        return 0
    entradas = json.loads(registro_ruta.read_text(encoding="utf-8"))
    hechos = 0
    restantes = []
    for entrada in entradas:
        origen = destino / entrada["clase"] / entrada["archivo"]
        final = raiz / entrada["clase"] / entrada["archivo"]
        if origen.exists() and not final.exists():
            final.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(origen), str(final))
            hechos += 1
        elif not origen.exists():
            continue                              # ya no está en el destino: se olvida
        else:
            restantes.append(entrada)             # conflicto: se conserva en el registro
    registro_ruta.write_text(json.dumps(restantes, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return hechos


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dataset", default="dataset")
    ap.add_argument("--destino", default="dataset_legado")
    modo = ap.add_mutually_exclusive_group()
    modo.add_argument("--aplicar", action="store_true", help="mover de verdad")
    modo.add_argument("--revertir", action="store_true", help="devolver lo movido")
    a = ap.parse_args()

    raiz, destino = Path(a.dataset), Path(a.destino)
    if not raiz.is_dir():
        print(f"No existe {raiz}")
        return 1
    if a.revertir:
        print(f"Devueltas: {revertir(raiz, destino)}")
        return 0

    movimientos = planificar(raiz)
    por_clase = Counter(clase for clase, _ in movimientos)
    print(f"Secuencias sin marcar con z recortado: {len(movimientos)}")
    for clase, n in sorted(por_clase.items()):
        print(f"  {clase:<22} {n}")
    if not a.aplicar:
        print("\nSimulación: no se movió nada. Usa --aplicar para moverlas a", destino)
        return 0
    print(f"\nMovidas a {destino}: {aplicar(raiz, destino, movimientos)}")
    print("Siguiente paso: py augmentar_dataset.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
