import contextlib
import io
import tempfile
import unittest
from pathlib import Path

import numpy as np

import augmentar_dataset as aug
import migrar_dataset as migrar
from calidad import proporcion_sospechosas
from datos_entrenamiento import (
    cargar_dataset, excluir_clases_pequenas, metricas_por_clase, preparar_particion,
)
from tests.ayudas import secuencia_con_z_recortado, secuencia_natural


def _silencio(funcion, *args, **kwargs):
    with contextlib.redirect_stdout(io.StringIO()):
        return funcion(*args, **kwargs)


def _dataset_legado(raiz: Path, clases=("hola", "gracias"), originales=6, copias_antiguas=8):
    """Reproduce el dataset real: unos pocos originales y muchas copias SIN marcar con z recortado."""
    for c, clase in enumerate(clases):
        carpeta = raiz / clase
        carpeta.mkdir(parents=True)
        n = 0
        for o in range(originales):
            np.save(carpeta / f"seq_{n:04d}.npy", secuencia_natural(100 * c + o)); n += 1
        for o in range(originales):
            for k in range(copias_antiguas):
                ruido = np.random.default_rng(o * 100 + k).normal(0, 0.003, (30, 270)).astype(np.float32)
                np.save(carpeta / f"seq_{n:04d}.npy", np.clip(secuencia_natural(100 * c + o) + ruido, 0, 1)); n += 1


class CargaTest(unittest.TestCase):
    def test_carga_clasifica_y_anota_lo_ignorado(self):
        with tempfile.TemporaryDirectory() as tmp:
            raiz = Path(tmp)
            _dataset_legado(raiz, clases=("hola",), originales=3, copias_antiguas=2)
            (raiz / "_deafapp.json").write_text("{}")
            (raiz / "_oculta").mkdir()
            np.save(raiz / "_oculta" / "x.npy", secuencia_natural(1))
            np.save(raiz / "hola" / "mala.npy", np.zeros((5, 270), dtype=np.float32))
            (raiz / "hola" / "rota.npy").write_bytes(b"no es npy")
            ds = cargar_dataset(raiz)
            self.assertEqual(ds.X.shape, (9, 30, 270))
            self.assertEqual(len(ds.ignorados), 2)
            self.assertEqual(int(ds.es_original.sum()), 3)       # las 6 copias antiguas tienen z recortado

    def test_las_copias_antiguas_quedan_marcadas_como_danadas(self):
        with tempfile.TemporaryDirectory() as tmp:
            raiz = Path(tmp)
            _dataset_legado(raiz, clases=("hola",), originales=3, copias_antiguas=2)
            ds = cargar_dataset(raiz)
            self.assertEqual(int(ds.danada.sum()), 6)
            self.assertFalse(np.any(ds.danada & ds.es_original))
            limpio, quitadas = ds.sin_danadas()
            self.assertEqual((quitadas, len(limpio)), (6, 3))
            self.assertEqual(int(limpio.danada.sum()), 0)

    def test_las_aumentadas_marcadas_no_son_originales(self):
        with tempfile.TemporaryDirectory() as tmp:
            raiz = Path(tmp)
            (raiz / "hola").mkdir()
            for i in range(3):
                np.save(raiz / "hola" / f"seq_{i:04d}.npy", secuencia_natural(i))
            _silencio(aug.augmentar_dataset, str(raiz), 2, 30)
            ds = cargar_dataset(raiz)
            self.assertEqual(int(ds.es_original.sum()), 3)
            self.assertEqual(len(ds), 9)

    def test_valores_no_finitos_se_ignoran(self):
        with tempfile.TemporaryDirectory() as tmp:
            raiz = Path(tmp)
            (raiz / "hola").mkdir()
            np.save(raiz / "hola" / "ok.npy", secuencia_natural(1))
            malo = secuencia_natural(2)
            malo[3, 4] = np.nan
            np.save(raiz / "hola" / "nan.npy", malo)
            self.assertEqual(len(cargar_dataset(raiz)), 1)

    def test_errores(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(RuntimeError):
                cargar_dataset(tmp)
            with self.assertRaises(FileNotFoundError):
                cargar_dataset(Path(tmp) / "no_existe")


class ParticionTest(unittest.TestCase):
    def test_sin_fuga_aunque_las_copias_no_esten_marcadas(self):
        with tempfile.TemporaryDirectory() as tmp:
            raiz = Path(tmp)
            _dataset_legado(raiz)
            s = preparar_particion(cargar_dataset(raiz))
            self.assertEqual(s["fuga_test"], 0.0)
            self.assertEqual(s["fuga_valid"], 0.0)
            self.assertGreater(len(s["test"]), 0)
            ds = cargar_dataset(raiz)
            self.assertTrue(all(ds.es_original[i] for i in np.concatenate([s["valid"], s["test"]])))

    def test_tras_migrar_y_aumentar_el_entrenamiento_ya_no_tiene_z_recortado(self):
        with tempfile.TemporaryDirectory() as tmp:
            raiz, legado = Path(tmp) / "dataset", Path(tmp) / "legado"
            _dataset_legado(raiz)
            ds = cargar_dataset(raiz)
            self.assertGreater(proporcion_sospechosas(ds.X), 0.5)
            movimientos = migrar.planificar(raiz)
            self.assertEqual(len(movimientos), 2 * 6 * 8)
            self.assertEqual(migrar.aplicar(raiz, legado, movimientos), 96)
            _silencio(aug.augmentar_dataset, str(raiz), 4, 30)
            ds = cargar_dataset(raiz)
            self.assertEqual(proporcion_sospechosas(ds.X), 0.0)
            s = preparar_particion(ds)
            self.assertEqual(proporcion_sospechosas(ds.X[s["train"]]), 0.0)
            self.assertEqual(s["fuga_test"], 0.0)


class MigrarTest(unittest.TestCase):
    def test_simulacion_no_mueve_nada_y_se_puede_revertir(self):
        with tempfile.TemporaryDirectory() as tmp:
            raiz, legado = Path(tmp) / "dataset", Path(tmp) / "legado"
            _dataset_legado(raiz, clases=("hola",), originales=2, copias_antiguas=3)
            antes = sorted(f.name for f in (raiz / "hola").glob("*.npy"))
            movimientos = migrar.planificar(raiz)
            self.assertEqual(len(movimientos), 6)
            self.assertEqual(sorted(f.name for f in (raiz / "hola").glob("*.npy")), antes)
            migrar.aplicar(raiz, legado, movimientos)
            self.assertEqual(len(list((raiz / "hola").glob("*.npy"))), 2)
            self.assertEqual(len(list((legado / "hola").glob("*.npy"))), 6)
            self.assertEqual(migrar.revertir(raiz, legado), 6)
            self.assertEqual(sorted(f.name for f in (raiz / "hola").glob("*.npy")), antes)

    def test_no_mueve_originales_ni_copias_nuevas(self):
        with tempfile.TemporaryDirectory() as tmp:
            raiz = Path(tmp)
            (raiz / "hola").mkdir()
            np.save(raiz / "hola" / "seq_0000.npy", secuencia_natural(0))
            np.save(raiz / "hola" / "deafapp_5.npy", secuencia_natural(1))
            _silencio(aug.augmentar_dataset, str(raiz), 2, 30)
            self.assertEqual(migrar.planificar(raiz), [])

    def test_mueve_las_dañadas_aunque_se_llamen_como_originales(self):
        with tempfile.TemporaryDirectory() as tmp:
            raiz = Path(tmp)
            (raiz / "hola").mkdir()
            np.save(raiz / "hola" / "seq_0000.npy", secuencia_con_z_recortado(0))
            self.assertEqual(migrar.planificar(raiz), [("hola", "seq_0000.npy")])


class ExcluirClasesTest(unittest.TestCase):
    def _crear(self, raiz: Path):
        for clase, n, base in (("grande", 4, 0), ("chica", 2, 50)):
            (raiz / clase).mkdir()
            for i in range(n):
                np.save(raiz / clase / f"seq_{i:04d}.npy", secuencia_natural(base + i))
        _silencio(aug.augmentar_dataset, str(raiz), 6, 30)       # las copias no cuentan como independientes

    def test_quita_las_clases_sin_suficientes_originales_independientes(self):
        with tempfile.TemporaryDirectory() as tmp:
            self._crear(Path(tmp))
            ds, omitidas = excluir_clases_pequenas(cargar_dataset(tmp), 3)
            self.assertEqual(omitidas, {"chica": 2})
            self.assertEqual(set(ds.y.tolist()), {"grande"})
            self.assertEqual(len(ds), 4 * 7)

    def test_con_minimo_uno_no_quita_nada(self):
        with tempfile.TemporaryDirectory() as tmp:
            self._crear(Path(tmp))
            original = cargar_dataset(tmp)
            ds, omitidas = excluir_clases_pequenas(original, 1)
            self.assertEqual((omitidas, len(ds)), ({}, len(original)))

    def test_dos_repeticiones_casi_identicas_cuentan_como_una(self):
        with tempfile.TemporaryDirectory() as tmp:
            raiz = Path(tmp)
            (raiz / "rara").mkdir()
            base = secuencia_natural(7)
            for i, sec in enumerate((base, base + 0.001, secuencia_natural(8))):
                np.save(raiz / "rara" / f"seq_{i:04d}.npy", sec)
            _, omitidas = excluir_clases_pequenas(cargar_dataset(raiz), 3)
            self.assertEqual(omitidas, {"rara": 2})


class MetricasTest(unittest.TestCase):
    def test_exactitud_por_clase_y_confusiones(self):
        clases = ["a", "b", "c"]
        m = metricas_por_clase([0, 0, 1, 1, 2], [0, 1, 1, 1, 0], clases)
        self.assertEqual(m["n"], 5)
        self.assertAlmostEqual(m["exactitud"], 0.6)
        self.assertEqual(m["por_clase"]["a"], {"n": 2, "exactitud": 0.5})
        self.assertEqual(m["por_clase"]["b"]["exactitud"], 1.0)
        self.assertEqual(m["por_clase"]["c"]["exactitud"], 0.0)
        self.assertEqual({(c["real"], c["predicha"]) for c in m["confusiones"]}, {("a", "b"), ("c", "a")})

    def test_vacio(self):
        self.assertEqual(metricas_por_clase([], [], ["a"])["exactitud"], None)


if __name__ == "__main__":
    unittest.main()
