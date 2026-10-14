"""
etiquetas.py — Validación de etiquetas y rutas que vienen de fuera
══════════════════════════════════════════════════════════════════
La API recibe `label` de clientes remotos y lo usa como nombre de carpeta; sin validar,
un valor como «../../x» escribiría fuera de la carpeta prevista.
"""

from __future__ import annotations

import re
import unicodedata
from pathlib import Path

_PATRON = re.compile(r"^[a-zñáéíóúü0-9][a-zñáéíóúü0-9 _-]{0,39}$")


def limpiar_etiqueta(texto: object) -> str | None:
    """Devuelve la etiqueta en minúsculas y normalizada, o None si no es válida.

    Válida: 1 a 40 caracteres entre letras (con tildes y ñ), dígitos, espacio, «_» y «-»,
    empezando por letra o dígito. Rechaza separadores de ruta, «..» y vacíos.
    """
    if not isinstance(texto, str):
        return None
    limpio = re.sub(r"\s+", " ", unicodedata.normalize("NFC", texto).strip().lower())
    return limpio if _PATRON.fullmatch(limpio) else None


def ruta_segura(base: str | Path, *partes: str) -> Path:
    """Une `partes` a `base` y garantiza que el resultado quede dentro de `base`."""
    raiz = Path(base).resolve()
    destino = raiz.joinpath(*partes).resolve()
    if destino != raiz and raiz not in destino.parents:
        raise ValueError("Ruta fuera del directorio permitido.")
    return destino
