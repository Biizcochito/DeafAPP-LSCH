import contextlib
import io
import tempfile
import unittest
from pathlib import Path

import numpy as np

import augmentar_dataset as aug
from calidad import proporcion_z_negativo, z_recortado
from formato import IDX_LH, IDX_RH
from particion import es_aumentada, nombre_aumentada, origen_de
from tests.ayudas import secuencia_natural


def _silencio(funcion, *args, **kwargs):
    with contextlib.redirect_stdout(io.StringIO()):
        return funcion(*args, **kwargs)


class VariacionTest(unittest.TestCase):
    def test_forma_tipo_y_valores_finitos(self):
        for semilla in range(20):
            np.random.seed(semilla)
            v = aug.generar_variacion(secuencia_natural(semilla))
            self.assertEqual(v.shape, (30, 270))
            self.assertEqual(v.dtype, np.float32)
            self.assertTrue(np.all(np.isfinite(v)))

    def test_conserva_el_z_negativo(self):
        """El defecto medido en el dataset anterior: el recorte dejaba z en 0."""
        for semilla in range(30):
            np.random.seed(semilla)
            original = secuencia_natural(semilla)
            v = aug.generar_variacion(original)
            self.assertFalse(z_recortado(v), f"semilla {semilla}")
            self.assertGreater(proporcion_z_negativo(v), 0.3)

    def test_lo_ausente_sigue_ausente(self):
        """Mano izquierda ausente: tras cualquier combinación sigue ausente (o pasó al otro lado por el espejo)."""
        for semilla in range(60):
            np.random.seed(semilla)
            original = secuencia_natural(semilla, derecha=True, izquierda=False)
            v = aug.generar_variacion(original)
            izquierda_vacia = not np.any(v[:, IDX_LH[0]:IDX_LH[1]])
            derecha_vacia = not np.any(v[:, IDX_RH[0]:IDX_RH[1]])
            self.assertTrue(izquierda_vacia or derecha_vacia, f"semilla {semilla}")
            self.assertTrue(izquierda_vacia != derecha_vacia, f"semilla {semilla}: aparecieron o desaparecieron manos")

    def test_no_cambia_el_original(self):
        original = secuencia_natural(3)
        copia = original.copy()
        np.random.seed(0)
        aug.generar_variacion(original)
        np.testing.assert_array_equal(original, copia)

    def test_la_variacion_es_distinta_del_original(self):
        np.random.seed(1)
        original = secuencia_natural(1)
        self.assertGreater(float(np.mean(np.abs(aug.generar_variacion(original) - original))), 1e-4)

    def test_las_tecnicas_no_recortan_a_cero_uno(self):
        s = secuencia_natural(2)
        s[:, 84 * 3 + 2] = -0.9                                  # un z muy negativo en la pose
        np.random.seed(0)
        self.assertLess(aug.escalar_espacial(s).min(), -0.5)
        self.assertLess(aug.trasladar(s).min(), -0.5)


class DatasetTest(unittest.TestCase):
    def _crear(self, raiz: Path, originales: int, clase="hola"):
        carpeta = raiz / clase
        carpeta.mkdir(parents=True)
        for i in range(originales):
            np.save(carpeta / f"seq_{i:04d}.npy", secuencia_natural(i))

    def test_genera_copias_con_nombre_de_origen(self):
        with tempfile.TemporaryDirectory() as tmp:
            raiz = Path(tmp)
            self._crear(raiz, 3)
            total = _silencio(aug.augmentar_dataset, str(raiz), 4, 30)
            self.assertEqual(total, 12)
            archivos = sorted((raiz / "hola").glob("*.npy"))
            self.assertEqual(len(archivos), 15)
            copias = [f for f in archivos if es_aumentada(f.name)]
            self.assertEqual({origen_de(f.name) for f in copias}, {"seq_0000", "seq_0001", "seq_0002"})
            self.assertIn(nombre_aumentada("seq_0001", 3), {f.name for f in copias})

    def test_repetirlo_no_duplica_ni_aumenta_las_copias(self):
        with tempfile.TemporaryDirectory() as tmp:
            raiz = Path(tmp)
            self._crear(raiz, 2)
            _silencio(aug.augmentar_dataset, str(raiz), 3, 30)
            antes = {f.name: f.read_bytes() for f in (raiz / "hola").glob("*.npy")}
            self.assertEqual(_silencio(aug.augmentar_dataset, str(raiz), 3, 30), 0)
            despues = {f.name: f.read_bytes() for f in (raiz / "hola").glob("*.npy")}
            self.assertEqual(antes, despues)

    def test_es_determinista_entre_ejecuciones(self):
        with tempfile.TemporaryDirectory() as a, tempfile.TemporaryDirectory() as b:
            for ruta in (a, b):
                self._crear(Path(ruta), 2)
                _silencio(aug.augmentar_dataset, ruta, 3, 30)
            for f in sorted((Path(a) / "hola").glob("aug_*.npy")):
                np.testing.assert_array_equal(np.load(f), np.load(Path(b) / "hola" / f.name))

    def test_no_toca_clases_con_suficientes_originales(self):
        with tempfile.TemporaryDirectory() as tmp:
            raiz = Path(tmp)
            self._crear(raiz, 5)
            self.assertEqual(_silencio(aug.augmentar_dataset, str(raiz), 3, 5), 0)

    def test_copias_por_original(self):
        self.assertEqual(aug.copias_por_original(1, 30), 29)       # diseño original: 1 → 30 muestras
        self.assertEqual(aug.copias_por_original(6, 30), 4)
        self.assertEqual(aug.copias_por_original(2, 30), 14)
        self.assertEqual(aug.copias_por_original(29, 30), 1)
        self.assertEqual(aug.copias_por_original(30, 30), 0)
        self.assertEqual(aug.copias_por_original(0, 30), 0)

    def test_por_defecto_cada_clase_llega_al_objetivo(self):
        with tempfile.TemporaryDirectory() as tmp:
            raiz = Path(tmp)
            self._crear(raiz, 6)
            self._crear(raiz, 1, clase="rara")
            _silencio(aug.augmentar_dataset, str(raiz))
            self.assertEqual(len(list((raiz / "hola").glob("*.npy"))), 30)
            self.assertEqual(len(list((raiz / "rara").glob("*.npy"))), 30)

    def test_no_usa_como_origen_las_copias_antiguas_con_z_recortado(self):
        from tests.ayudas import secuencia_con_z_recortado
        with tempfile.TemporaryDirectory() as tmp:
            raiz = Path(tmp)
            self._crear(raiz, 2)
            np.save(raiz / "hola" / "seq_0099.npy", secuencia_con_z_recortado(9))
            _silencio(aug.augmentar_dataset, str(raiz), 3, 30)
            self.assertFalse(any(origen_de(f.name) == "seq_0099" and es_aumentada(f.name)
                                 for f in (raiz / "hola").glob("*.npy")))

    def test_no_aumenta_las_copias_ya_generadas(self):
        with tempfile.TemporaryDirectory() as tmp:
            raiz = Path(tmp)
            self._crear(raiz, 2)
            _silencio(aug.augmentar_dataset, str(raiz), 2, 30)
            nombres = {f.name for f in (raiz / "hola").glob("*.npy")}
            _silencio(aug.augmentar_dataset, str(raiz), 2, 30)
            self.assertEqual(nombres, {f.name for f in (raiz / "hola").glob("*.npy")})
            self.assertFalse(any("aug_aug_" in n for n in nombres))

    def test_ignora_carpetas_internas_y_formas_incorrectas(self):
        with tempfile.TemporaryDirectory() as tmp:
            raiz = Path(tmp)
            self._crear(raiz, 2)
            (raiz / "_privada").mkdir()
            np.save(raiz / "_privada" / "x.npy", secuencia_natural(0))
            np.save(raiz / "hola" / "seq_9999.npy", np.zeros((10, 270), dtype=np.float32))
            _silencio(aug.augmentar_dataset, str(raiz), 2, 30)
            self.assertEqual(list((raiz / "_privada").glob("*.npy")), [raiz / "_privada" / "x.npy"])
            self.assertFalse(any("seq_9999" in f.name and es_aumentada(f.name) for f in (raiz / "hola").glob("*.npy")))


if __name__ == "__main__":
    unittest.main()
