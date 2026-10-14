"""
buffers.py — Buffers de fotogramas por dispositivo, con tope
═════════════════════════════════════════════════════════════
La API guarda los últimos 30 fotogramas de cada celular que consulta. Con un diccionario sin
límite, cualquiera que invente identificadores nuevos agotaría la memoria del servidor.
"""

from __future__ import annotations

import re
from collections import OrderedDict, deque

_VALIDO = re.compile(r"^[A-Za-z0-9._:-]{1,64}$")


def normalizar_device_id(valor: object) -> str:
    """Devuelve el identificador si es razonable; si no, 'default'."""
    return valor if isinstance(valor, str) and _VALIDO.fullmatch(valor) else "default"


class BuferesPorDispositivo:
    """Un deque de largo fijo por dispositivo; descarta el menos usado al pasar `maximo`."""

    def __init__(self, largo: int, maximo: int = 200) -> None:
        self.largo = largo
        self.maximo = maximo
        self._buferes: "OrderedDict[str, deque]" = OrderedDict()

    def obtener(self, device_id: str) -> deque:
        if device_id in self._buferes:
            self._buferes.move_to_end(device_id)
        else:
            self._buferes[device_id] = deque(maxlen=self.largo)
            while len(self._buferes) > self.maximo:
                self._buferes.popitem(last=False)
        return self._buferes[device_id]

    def limpiar(self, device_id: str) -> None:
        if device_id in self._buferes:
            self._buferes[device_id].clear()

    def __len__(self) -> int:
        return len(self._buferes)
