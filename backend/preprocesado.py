"""
preprocesado.py — Lo que el modelo recibe, definido en un solo lugar
═════════════════════════════════════════════════════════════════════
Entrenamiento, evaluación, API y cámara deben transformar la secuencia cruda (30, 270) EXACTAMENTE
igual. Si no, el modelo recibe en vivo algo distinto de lo que vio al entrenar y falla sin avisar. Por eso
el preprocesado se guarda junto al modelo (`preprocesado.json`) y todos lo cargan de ahí.

Sin ese archivo se asume el comportamiento anterior (coordenadas crudas sin estandarizar): así los
modelos entrenados antes de este cambio siguen funcionando.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from rasgos import VERSIONES, dimension, extraer_rasgos

NOMBRE_ARCHIVO = "preprocesado.json"
FORMATO = 1


@dataclass
class Preprocesador:
    version: str = "crudo"
    rellenar: int = 0                       # huecos de mano de hasta este largo se interpolan
    media: np.ndarray | None = None         # (d,) estandarización ajustada con el entrenamiento
    desv: np.ndarray | None = None
    umbral: float | None = None             # confianza mínima sugerida por la validación cruzada

    def __post_init__(self) -> None:
        if self.version not in VERSIONES:
            raise ValueError(f"Versión de rasgos desconocida: {self.version!r}")
        if (self.media is None) != (self.desv is None):
            raise ValueError("media y desv van juntas.")
        if self.media is not None:
            self.media = np.asarray(self.media, dtype=np.float32)
            self.desv = np.asarray(self.desv, dtype=np.float32)
            if self.media.shape != (self.dimension,) or self.desv.shape != (self.dimension,):
                raise ValueError(f"La estandarización debe tener {self.dimension} valores.")

    @property
    def dimension(self) -> int:
        return dimension(self.version)

    @property
    def es_heredado(self) -> bool:
        """True si no transforma nada (modelo anterior a rasgos.py)."""
        return self.version == "crudo" and self.media is None

    def rasgos(self, X: np.ndarray) -> np.ndarray:
        """Rasgos sin estandarizar: (N, 30, 270) o (30, 270) → (N, 30, d)."""
        return extraer_rasgos(X, self.version, rellenar=self.rellenar)

    def estandarizar(self, F: np.ndarray) -> np.ndarray:
        if self.media is None:
            return np.asarray(F, dtype=np.float32)
        return ((np.asarray(F, dtype=np.float32) - self.media) / self.desv).astype(np.float32)

    def transformar(self, X: np.ndarray) -> np.ndarray:
        """Entrada lista para el modelo."""
        return self.estandarizar(self.rasgos(X))

    @classmethod
    def ajustar(cls, F_entrenamiento: np.ndarray, version: str, rellenar: int = 0) -> "Preprocesador":
        """Fija media y desviación con los rasgos de ENTRENAMIENTO (nunca con la prueba)."""
        plano = np.asarray(F_entrenamiento, dtype=np.float32).reshape(-1, F_entrenamiento.shape[-1])
        return cls(version, rellenar, plano.mean(axis=0), plano.std(axis=0) + 1e-6)

    def guardar(self, carpeta: str | Path) -> Path:
        ruta = Path(carpeta) / NOMBRE_ARCHIVO
        ruta.write_text(json.dumps({
            "formato": FORMATO, "version": self.version, "rellenar": self.rellenar, "umbral": self.umbral,
            "media": None if self.media is None else [float(v) for v in self.media],
            "desv": None if self.desv is None else [float(v) for v in self.desv],
        }) + "\n", encoding="utf-8")
        return ruta

    @classmethod
    def cargar(cls, carpeta: str | Path) -> "Preprocesador":
        """Lee preprocesado.json de `carpeta`; si no existe, el comportamiento anterior (crudo)."""
        ruta = Path(carpeta) / NOMBRE_ARCHIVO
        if not ruta.exists():
            return cls()
        datos = json.loads(ruta.read_text(encoding="utf-8"))
        if datos.get("formato") != FORMATO:
            raise ValueError(f"{ruta} tiene un formato desconocido ({datos.get('formato')!r}).")
        return cls(datos["version"], int(datos.get("rellenar", 0)),
                   None if datos.get("media") is None else np.array(datos["media"], dtype=np.float32),
                   None if datos.get("desv") is None else np.array(datos["desv"], dtype=np.float32),
                   datos.get("umbral"))
