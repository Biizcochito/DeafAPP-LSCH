import unittest

import numpy as np

from aumento_rasgos import aumentar, aumentar_lote, espejar
from formato import N_FEATURES
from rasgos import VERSIONES, dimension, extraer_rasgos, rellenar_huecos, resumen_temporal
from tests.ayudas import secuencia_natural


def _transformar(seq: np.ndarray, escala: float, dx: float, dy: float) -> np.ndarray:
    """La misma escena vista desde otra posición y distancia: todos los puntos presentes se mueven igual."""
    P = seq.reshape(30, 90, 3).copy()
    presente = np.any(P != 0, axis=-1)
    P[..., 0] = np.where(presente, P[..., 0] * escala + dx, 0)
    P[..., 1] = np.where(presente, P[..., 1] * escala + dy, 0)
    P[..., 2] = np.where(presente, P[..., 2] * escala, 0)
    return P.reshape(30, N_FEATURES)


class RasgosTest(unittest.TestCase):
    def test_formas_y_valores_finitos(self):
        s = np.stack([secuencia_natural(1, izquierda=True), secuencia_natural(2)])
        for version in VERSIONES:
            F = extraer_rasgos(s, version)
            self.assertEqual(F.shape, (2, 30, dimension(version)), version)
            self.assertTrue(np.all(np.isfinite(F)), version)
        self.assertEqual(extraer_rasgos(s[0], "manos").shape, (1, 30, 128))

    def test_version_desconocida(self):
        with self.assertRaises(ValueError):
            extraer_rasgos(secuencia_natural(1), "inventada")

    def test_forma_de_entrada_incorrecta(self):
        with self.assertRaises(ValueError):
            extraer_rasgos(np.zeros((30, 264)), "manos")

    def test_manos_es_invariante_a_posicion_y_tamano(self):
        s = secuencia_natural(5, izquierda=True)
        movida = _transformar(s, escala=1.7, dx=0.2, dy=-0.1)
        for version in ("manos", "manos_mov", "centrado"):
            np.testing.assert_allclose(extraer_rasgos(s, version), extraer_rasgos(movida, version), atol=2e-3, err_msg=version)

    def test_crudo_no_es_invariante(self):
        s = secuencia_natural(5)
        self.assertGreater(float(np.abs(extraer_rasgos(s, "crudo") - extraer_rasgos(_transformar(s, 1.7, .2, -.1), "crudo")).max()), 0.1)

    def test_distingue_sennas_distintas(self):
        a, b = secuencia_natural(11), secuencia_natural(12)
        self.assertGreater(float(np.abs(extraer_rasgos(a, "manos") - extraer_rasgos(b, "manos")).mean()), 0.05)

    def test_mano_ausente_son_ceros_con_presencia_cero(self):
        F = extraer_rasgos(secuencia_natural(3, derecha=True, izquierda=False), "manos")[0]
        self.assertTrue(np.all(F[:, 64:] == 0))                  # bloque de la izquierda
        self.assertTrue(np.all(F[:, 63] == 1))                   # derecha siempre presente
        self.assertTrue(np.any(F[:, :60] != 0))

    def test_forma_no_depende_de_donde_esta_la_mano(self):
        s = secuencia_natural(6)
        P = s.reshape(30, 90, 3).copy()
        P[:, 0:21, :2] += 0.1                                    # solo se mueve la mano derecha
        F0, F1 = extraer_rasgos(s, "manos")[0], extraer_rasgos(P.reshape(30, N_FEATURES), "manos")[0]
        np.testing.assert_allclose(F0[:, :60], F1[:, :60], atol=1e-4)           # forma igual
        self.assertGreater(float(np.abs(F0[:, 60:62] - F1[:, 60:62]).max()), 0.3)   # posición distinta (0,1 de imagen ≈ 0,4 caras)

    def test_velocidad_cero_si_falta_la_mano(self):
        s = secuencia_natural(7)
        P = s.reshape(30, 90, 3).copy()
        P[10, 0:21, :] = 0                                       # la mano derecha desaparece en un fotograma
        F = extraer_rasgos(P.reshape(30, N_FEATURES), "manos_mov")[0]
        self.assertTrue(np.all(F[10, 128:131] == 0))
        self.assertTrue(np.all(F[11, 128:131] == 0))


class RellenarHuecosTest(unittest.TestCase):
    def _sin_mano(self, desde: int, hasta: int) -> np.ndarray:
        P = secuencia_natural(8).reshape(30, 90, 3).copy()
        P[desde:hasta, 0:21, :] = 0
        return P.reshape(30, N_FEATURES)

    def test_rellena_un_hueco_corto_con_interpolacion(self):
        original = secuencia_natural(8).reshape(30, 90, 3)
        relleno = rellenar_huecos(self._sin_mano(10, 13), 4).reshape(30, 90, 3)
        for k in (10, 11, 12):
            w = (k - 9) / (13 - 9)
            esperado = (1 - w) * original[9, 0:21] + w * original[13, 0:21]
            np.testing.assert_allclose(relleno[k, 0:21], esperado, atol=1e-5)
        np.testing.assert_array_equal(relleno[:10], original[:10])

    def test_no_rellena_huecos_largos(self):
        s = self._sin_mano(10, 18)
        np.testing.assert_array_equal(rellenar_huecos(s, 4)[0], s)

    def test_no_rellena_los_bordes(self):
        for s in (self._sin_mano(0, 3), self._sin_mano(27, 30)):
            np.testing.assert_array_equal(rellenar_huecos(s, 4)[0], s)

    def test_con_cero_no_hace_nada_y_no_modifica_la_entrada(self):
        s = self._sin_mano(10, 12)
        copia = s.copy()
        np.testing.assert_array_equal(rellenar_huecos(s, 0)[0], s)
        rellenar_huecos(s, 4)
        np.testing.assert_array_equal(s, copia)

    def test_extraer_rasgos_con_relleno_marca_presencia(self):
        s = self._sin_mano(10, 12)
        sin = extraer_rasgos(s, "manos")[0]
        con = extraer_rasgos(s, "manos", rellenar=4)[0]
        self.assertEqual(sin[10:12, 63].tolist(), [0, 0])
        self.assertEqual(con[10:12, 63].tolist(), [1, 1])


class ResumenTest(unittest.TestCase):
    def test_dimension(self):
        self.assertEqual(resumen_temporal(extraer_rasgos(secuencia_natural(1), "manos")).shape, (1, 4 * 128))


class AumentoTest(unittest.TestCase):
    def setUp(self):
        self.F = extraer_rasgos(np.stack([secuencia_natural(1, izquierda=True), secuencia_natural(2)]), "manos", rellenar=4)

    def test_forma_tipo_y_finitos(self):
        rng = np.random.default_rng(0)
        for f in self.F:
            for _ in range(30):
                v = aumentar(f, rng)
                self.assertEqual((v.shape, v.dtype), ((30, 128), np.float32))
                self.assertTrue(np.all(np.isfinite(v)))

    def test_no_modifica_la_entrada(self):
        copia = self.F[0].copy()
        aumentar(self.F[0], np.random.default_rng(1))
        np.testing.assert_array_equal(self.F[0], copia)

    def test_lo_ausente_sigue_ausente_y_la_presencia_es_binaria(self):
        rng = np.random.default_rng(2)
        for _ in range(60):
            v = aumentar(self.F[1], rng, espejo=0.0)             # sin espejo: la izquierda no existe y no debe aparecer
            self.assertTrue(np.all(v[:, 64:] == 0))
            for h in (0, 64):
                presencia = v[:, h + 63]
                self.assertTrue(np.all((presencia == 0) | (presencia == 1)))
                ausentes = presencia == 0
                self.assertTrue(np.all(v[ausentes, h:h + 63] == 0))

    def test_misma_semilla_misma_variacion(self):
        a = aumentar(self.F[0], np.random.default_rng(5))
        b = aumentar(self.F[0], np.random.default_rng(5))
        np.testing.assert_array_equal(a, b)
        c = aumentar(self.F[0], np.random.default_rng(6))
        self.assertFalse(np.array_equal(a, c))

    def test_la_variacion_es_moderada(self):
        """Debe parecerse mucho más a su original que a otra seña."""
        rng = np.random.default_rng(3)
        propia = np.mean([np.abs(aumentar(self.F[0], rng, espejo=0.0) - self.F[0]).mean() for _ in range(30)])
        ajena = np.abs(self.F[1] - self.F[0]).mean()
        self.assertLess(propia, ajena)

    def test_espejar_es_su_propia_inversa_e_intercambia_manos(self):
        f = self.F[0]
        np.testing.assert_allclose(espejar(espejar(f)), f, atol=1e-6)
        e = espejar(f)
        np.testing.assert_array_equal(e[:, 63], f[:, 127])       # presencia: derecha ↔ izquierda
        np.testing.assert_allclose(e[:, 60], -f[:, 124], atol=1e-6)   # x de la muñeca reflejada

    def test_lote(self):
        F, y = aumentar_lote(self.F, np.array(["a", "b"]), copias=3, semilla=0)
        self.assertEqual(F.shape, (8, 30, 128))
        self.assertEqual(y.tolist(), ["a", "b"] * 4)
        np.testing.assert_array_equal(F[:2], self.F)             # los originales van primero y sin cambios


if __name__ == "__main__":
    unittest.main()
