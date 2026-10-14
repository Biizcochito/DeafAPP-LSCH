import unittest

import numpy as np

from particion import (
    construir_grupos, dividir_por_grupos, es_aumentada, nombre_aumentada, origen_de,
    pliegues_por_grupos, proporcion_con_gemelo,
)
from formato import espejar_secuencia
from tests.ayudas import secuencia_natural


class NombresTest(unittest.TestCase):
    def test_nombre_y_origen(self):
        n = nombre_aumentada("seq_0003", 7)
        self.assertEqual(n, "aug_seq_0003__07.npy")
        self.assertTrue(es_aumentada(n))
        self.assertEqual(origen_de(n), "seq_0003")
        self.assertEqual(origen_de("seq_0003.npy"), "seq_0003")
        self.assertFalse(es_aumentada("seq_0003.npy"))
        self.assertFalse(es_aumentada("deafapp_201.npy"))

    def test_origen_con_guiones_bajos(self):
        self.assertEqual(origen_de(nombre_aumentada("deafapp_201", 12)), "deafapp_201")


def _dataset(n_clases=3, originales=6, copias=5):
    """Cada original es una secuencia distinta; sus copias son ella más un ruido mínimo."""
    X, y, nombres, es_orig = [], [], [], []
    rng = np.random.default_rng(0)
    for c in range(n_clases):
        for o in range(originales):
            base = secuencia_natural(1000 * c + o)
            nombre = f"seq_{o:04d}.npy"
            X.append(base); y.append(f"clase{c}"); nombres.append(nombre); es_orig.append(True)
            for k in range(copias):
                X.append(base + rng.normal(0, 0.002, base.shape).astype(np.float32))
                y.append(f"clase{c}"); nombres.append(nombre_aumentada(f"seq_{o:04d}", k)); es_orig.append(False)
    return np.stack(X).astype(np.float32), np.array(y), nombres, np.array(es_orig)


class GruposTest(unittest.TestCase):
    def test_copias_comparten_grupo_con_su_original(self):
        X, y, nombres, _ = _dataset()
        g = construir_grupos(y, nombres, X)
        self.assertEqual(len(set(g[:6].tolist())), 1)            # original + 5 copias de clase0/seq_0000
        self.assertNotEqual(g[0], g[6])                          # otro original, otro grupo

    def test_misma_secuencia_en_dos_clases_no_se_une(self):
        X, y, nombres, _ = _dataset(n_clases=2, originales=2, copias=0)
        X[2] = X[0]                                              # clase1 repite una secuencia de clase0
        g = construir_grupos(y, nombres, X)
        self.assertNotEqual(g[0], g[2])

    def test_sin_X_solo_usa_el_nombre(self):
        X, y, nombres, _ = _dataset(n_clases=1, originales=2, copias=1)
        self.assertEqual(len(set(construir_grupos(y, nombres).tolist())), 2)

    def test_repeticion_sin_marcar_se_detecta_con_X(self):
        base = secuencia_natural(9)
        X = np.stack([base, base + 0.001, secuencia_natural(10)]).astype(np.float32)
        g = construir_grupos(["a", "a", "a"], ["seq_0.npy", "seq_1.npy", "seq_2.npy"], X)
        self.assertEqual(g[0], g[1])
        self.assertNotEqual(g[0], g[2])


class CopiasDanadasTest(unittest.TestCase):
    """Las copias del aumento antiguo tenían z recortado: no parecían copias comparando los 270 valores."""

    def test_copia_con_z_recortado_se_une_a_su_original(self):
        base = secuencia_natural(31)
        copia = np.clip(base + np.random.default_rng(0).normal(0, 0.003, base.shape), 0, 1).astype(np.float32)
        otra = secuencia_natural(32)
        X = np.stack([base, copia, otra]).astype(np.float32)
        g = construir_grupos(["a"] * 3, ["seq_0.npy", "seq_1.npy", "seq_2.npy"], X)
        self.assertEqual(g[0], g[1])
        self.assertNotEqual(g[0], g[2])

    def test_copia_espejada_se_une_a_su_original(self):
        base = secuencia_natural(41, izquierda=True)
        espejada = espejar_secuencia(base) + np.random.default_rng(1).normal(0, 0.003, base.shape).astype(np.float32)
        X = np.stack([base, espejada, secuencia_natural(42, izquierda=True)]).astype(np.float32)
        g = construir_grupos(["a"] * 3, ["seq_0.npy", "seq_1.npy", "seq_2.npy"], X)
        self.assertEqual(g[0], g[1])
        self.assertNotEqual(g[0], g[2])

    def test_la_fuga_detecta_la_copia_con_z_recortado(self):
        base = secuencia_natural(51)
        copia = np.clip(base, 0, 1).astype(np.float32)           # z a 0 en las copias
        X = np.stack([base, copia])
        self.assertEqual(proporcion_con_gemelo(X, ["a", "a"], [1], [0]), 1.0)


class DivisionTest(unittest.TestCase):
    def test_sin_fuga_y_solo_originales_en_valid_y_test(self):
        X, y, nombres, es_orig = _dataset()
        g = construir_grupos(y, nombres, X)
        s = dividir_por_grupos(y, g, es_orig)
        tr, va, te = set(s["train"].tolist()), set(s["valid"].tolist()), set(s["test"].tolist())
        self.assertFalse(tr & va or tr & te or va & te)
        self.assertTrue(all(es_orig[i] for i in va | te))
        grupos_tr = {g[i] for i in tr}
        self.assertFalse(grupos_tr & {g[i] for i in va | te})    # ningún grupo cruza conjuntos
        self.assertEqual(proporcion_con_gemelo(X, y, s["train"], s["test"]), 0.0)
        self.assertEqual(proporcion_con_gemelo(X, y, s["train"], s["valid"]), 0.0)

    def test_cada_clase_aparece_en_los_tres_conjuntos(self):
        X, y, nombres, es_orig = _dataset(originales=6)
        s = dividir_por_grupos(y, construir_grupos(y, nombres, X), es_orig)
        for conteo in (s["train"], s["valid"], s["test"]):
            self.assertEqual(set(y[conteo].tolist()), {"clase0", "clase1", "clase2"})

    def test_es_repetible(self):
        X, y, nombres, es_orig = _dataset()
        g = construir_grupos(y, nombres, X)
        a, b = dividir_por_grupos(y, g, es_orig), dividir_por_grupos(y, g, es_orig)
        np.testing.assert_array_equal(a["test"], b["test"])

    def test_clase_con_dos_originales_avisa_y_reutiliza_la_prueba(self):
        X, y, nombres, es_orig = _dataset(n_clases=1, originales=2, copias=2)
        s = dividir_por_grupos(y, construir_grupos(y, nombres, X), es_orig)
        self.assertTrue(any("2 originales" in a for a in s["avisos"]))
        self.assertEqual(len(s["test"]), 1)
        np.testing.assert_array_equal(s["valid"], s["test"])

    def test_clase_con_un_original_va_entera_a_entrenamiento(self):
        X, y, nombres, es_orig = _dataset(n_clases=1, originales=1, copias=3)
        s = dividir_por_grupos(y, construir_grupos(y, nombres, X), es_orig)
        self.assertEqual(len(s["train"]), 4)
        self.assertEqual((len(s["valid"]), len(s["test"])), (0, 0))
        self.assertTrue(s["avisos"])

    def test_copias_de_grupos_de_prueba_se_descartan(self):
        X, y, nombres, es_orig = _dataset()
        s = dividir_por_grupos(y, construir_grupos(y, nombres, X), es_orig)
        usados = len(s["train"]) + len(s["valid"]) + len(s["test"])
        self.assertLess(usados, len(y))                          # las copias de valid/test no se usan en ningún lado


class PliegesTest(unittest.TestCase):
    def _datos(self, originales=5, copias=3, n_clases=3):
        X, y, nombres, es_orig = _dataset(n_clases=n_clases, originales=originales, copias=copias)
        return X, y, es_orig, construir_grupos(y, nombres, X)

    def test_todo_original_se_prueba_una_sola_vez(self):
        X, y, es_orig, g = self._datos()
        pl = pliegues_por_grupos(y, g, es_orig, k=5)
        probados = np.concatenate([p["test"] for p in pl])
        self.assertEqual(len(probados), len(set(probados.tolist())))
        self.assertEqual(set(probados.tolist()), set(np.flatnonzero(es_orig).tolist()))

    def test_sin_fuga_en_ningun_pliegue(self):
        X, y, es_orig, g = self._datos()
        for p in pliegues_por_grupos(y, g, es_orig, k=5):
            self.assertFalse(set(p["train"].tolist()) & set(p["test"].tolist()))
            self.assertFalse({int(g[i]) for i in p["train"]} & {int(g[i]) for i in p["test"]})
            self.assertTrue(all(es_orig[i] for i in p["test"]))
            self.assertEqual(proporcion_con_gemelo(X, y, p["train"], p["test"]), 0.0)

    def test_cada_pliegue_prueba_todas_las_clases_cuando_hay_k_grupos(self):
        X, y, es_orig, g = self._datos(originales=5)
        for p in pliegues_por_grupos(y, g, es_orig, k=5):
            self.assertEqual(set(y[p["test"]].tolist()), {"clase0", "clase1", "clase2"})

    def test_las_copias_de_un_grupo_de_prueba_no_entran_a_entrenar(self):
        X, y, es_orig, g = self._datos()
        for p in pliegues_por_grupos(y, g, es_orig, k=5):
            copias_de_prueba = [i for i in range(len(y)) if int(g[i]) in {int(g[j]) for j in p["test"]} and not es_orig[i]]
            self.assertTrue(copias_de_prueba)
            self.assertFalse(set(copias_de_prueba) & set(p["train"].tolist()))

    def test_repetible_y_con_menos_grupos_que_pliegues(self):
        X, y, es_orig, g = self._datos(originales=3)
        a, b = pliegues_por_grupos(y, g, es_orig, k=5), pliegues_por_grupos(y, g, es_orig, k=5)
        for pa, pb in zip(a, b):
            np.testing.assert_array_equal(pa["test"], pb["test"])
        self.assertEqual(sum(len(p["test"]) > 0 for p in a), 3)

    def test_grupos_solo_de_copias_siempre_entrenan(self):
        X, y, nombres, es_orig = _dataset(n_clases=1, originales=3, copias=0)
        X = np.concatenate([X, secuencia_natural(99)[None]])
        y = np.append(y, "clase0")
        es_orig = np.append(es_orig, False)                      # un grupo sin original
        g = construir_grupos(y, nombres + ["suelta.npy"], X)
        for p in pliegues_por_grupos(y, g, es_orig, k=3):
            self.assertIn(3, p["train"].tolist())

    def test_k_invalido(self):
        X, y, es_orig, g = self._datos()
        with self.assertRaises(ValueError):
            pliegues_por_grupos(y, g, es_orig, k=1)


if __name__ == "__main__":
    unittest.main()
