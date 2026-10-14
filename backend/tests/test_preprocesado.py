import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path

import numpy as np

import augmentar_dataset as aug
from datos_entrenamiento import cargar_dataset, preparar_pliegue, seleccionar_para_entrenar
from preprocesado import NOMBRE_ARCHIVO, Preprocesador
from rasgos import dimension
from tests.ayudas import secuencia_con_z_recortado, secuencia_natural


class PreprocesadorTest(unittest.TestCase):
    def test_heredado_no_transforma_nada(self):
        p = Preprocesador()
        self.assertTrue(p.es_heredado)
        s = secuencia_natural(1)
        np.testing.assert_array_equal(p.transformar(s)[0], s)

    def test_ajustar_deja_media_cero_y_desviacion_uno(self):
        X = np.stack([secuencia_natural(i, izquierda=i % 2 == 0) for i in range(8)])
        F = Preprocesador("manos", 4).rasgos(X)
        p = Preprocesador.ajustar(F, "manos", 4)
        Z = p.estandarizar(F).reshape(-1, 128)
        constantes = F.reshape(-1, 128).std(axis=0) < 1e-5
        np.testing.assert_allclose(Z.mean(axis=0)[~constantes], 0, atol=1e-4)
        np.testing.assert_allclose(Z.std(axis=0)[~constantes], 1, atol=1e-3)
        self.assertFalse(p.es_heredado)

    def test_guardar_y_cargar_dan_la_misma_transformacion(self):
        X = np.stack([secuencia_natural(i) for i in range(6)])
        F = Preprocesador("manos", 4).rasgos(X)
        p = Preprocesador.ajustar(F, "manos", 4)
        with tempfile.TemporaryDirectory() as tmp:
            ruta = p.guardar(tmp)
            self.assertEqual(ruta.name, NOMBRE_ARCHIVO)
            q = Preprocesador.cargar(tmp)
        self.assertEqual((q.version, q.rellenar), ("manos", 4))
        np.testing.assert_allclose(q.transformar(X), p.transformar(X), atol=1e-6)

    def test_el_umbral_viaja_con_el_preprocesado(self):
        X = np.stack([secuencia_natural(i) for i in range(5)])
        p = Preprocesador.ajustar(Preprocesador("manos", 4).rasgos(X), "manos", 4)
        self.assertIsNone(p.umbral)
        p.umbral = 0.65
        with tempfile.TemporaryDirectory() as tmp:
            p.guardar(tmp)
            self.assertEqual(Preprocesador.cargar(tmp).umbral, 0.65)
        with tempfile.TemporaryDirectory() as tmp:
            Preprocesador("manos", 4).guardar(tmp)
            self.assertIsNone(Preprocesador.cargar(tmp).umbral)

    def test_sin_archivo_es_el_comportamiento_anterior(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertTrue(Preprocesador.cargar(tmp).es_heredado)

    def test_formato_desconocido_o_corrupto(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / NOMBRE_ARCHIVO).write_text(json.dumps({"formato": 99}), encoding="utf-8")
            with self.assertRaises(ValueError):
                Preprocesador.cargar(tmp)

    def test_validaciones(self):
        with self.assertRaises(ValueError):
            Preprocesador("inventada")
        with self.assertRaises(ValueError):
            Preprocesador("manos", 0, np.zeros(128), None)
        with self.assertRaises(ValueError):
            Preprocesador("manos", 0, np.zeros(5), np.ones(5))

    def test_dimension_y_forma(self):
        for version in ("crudo", "centrado", "manos", "manos_mov"):
            p = Preprocesador(version)
            self.assertEqual(p.transformar(secuencia_natural(1)).shape, (1, 30, dimension(version)))


def _silencio(f, *a, **k):
    with contextlib.redirect_stdout(io.StringIO()):
        return f(*a, **k)


class SeleccionYPliegueTest(unittest.TestCase):
    def _dataset(self, raiz: Path):
        (raiz / "hola").mkdir()
        for i in range(4):
            np.save(raiz / "hola" / f"seq_{i:04d}.npy", secuencia_natural(i))
        np.save(raiz / "hola" / "seq_0099.npy", secuencia_con_z_recortado(9))      # copia antigua dañada
        _silencio(aug.augmentar_dataset, str(raiz), 2, 30)                           # 8 copias aug_
        return cargar_dataset(raiz)

    def test_por_defecto_solo_originales(self):
        with tempfile.TemporaryDirectory() as tmp:
            ds = self._dataset(Path(tmp))
            sel, apartadas = seleccionar_para_entrenar(ds)
            self.assertEqual(len(sel), 4)
            self.assertEqual(apartadas, {"copias_guardadas": 8, "copias_antiguas_danadas": 1})

    def test_opciones_para_incluir_copias(self):
        with tempfile.TemporaryDirectory() as tmp:
            ds = self._dataset(Path(tmp))
            self.assertEqual(len(seleccionar_para_entrenar(ds, incluir_copias=True)[0]), 12)
            self.assertEqual(len(seleccionar_para_entrenar(ds, incluir_danadas=True)[0]), 5)
            self.assertEqual(len(seleccionar_para_entrenar(ds, True, True)[0]), len(ds))

    def test_pliegue_aumenta_solo_el_entrenamiento_y_estandariza_con_el_entrenamiento(self):
        with tempfile.TemporaryDirectory() as tmp:
            ds, _ = seleccionar_para_entrenar(self._dataset(Path(tmp)))
            Xtr, ytr, Xte, pre = preparar_pliegue(ds, [0, 1, 2], [3], "manos", 4, copias=5, semilla=1)
            self.assertEqual(Xtr.shape, (3 * 6, 30, 128))             # originales + 5 copias de cada uno
            self.assertEqual(Xte.shape, (1, 30, 128))                 # la prueba no se aumenta
            self.assertEqual(len(ytr), 18)
            np.testing.assert_allclose(Xte, pre.transformar(ds.X[[3]]), atol=1e-6)
            self.assertFalse(pre.es_heredado)

    def test_pliegue_sin_copias_y_aumento_solo_para_manos(self):
        with tempfile.TemporaryDirectory() as tmp:
            ds, _ = seleccionar_para_entrenar(self._dataset(Path(tmp)))
            Xtr, ytr, Xte, _ = preparar_pliegue(ds, [0, 1], [2, 3], "manos_mov", 4, copias=0)
            self.assertEqual((Xtr.shape, Xte.shape), ((2, 30, 134), (2, 30, 134)))
            with self.assertRaises(ValueError):
                preparar_pliegue(ds, [0, 1], [2], "manos_mov", 4, copias=3)

    def test_es_repetible(self):
        with tempfile.TemporaryDirectory() as tmp:
            ds, _ = seleccionar_para_entrenar(self._dataset(Path(tmp)))
            a = preparar_pliegue(ds, [0, 1, 2], [3], copias=4, semilla=5)
            b = preparar_pliegue(ds, [0, 1, 2], [3], copias=4, semilla=5)
            np.testing.assert_array_equal(a[0], b[0])


if __name__ == "__main__":
    unittest.main()
