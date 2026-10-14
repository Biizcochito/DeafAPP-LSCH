import unittest

import numpy as np

from calidad import proporcion_sospechosas, proporcion_z_negativo, z_recortado
from formato import (
    ASPECTO_REFERENCIA, IDX_LH, IDX_RH, N_FEATURES, SEQUENCE_LENGTH, corregir_aspecto, espejar_secuencia,
)
from rasgos import extraer_rasgos
from tests.ayudas import secuencia_con_z_recortado, secuencia_natural


class FormatoTest(unittest.TestCase):
    def test_dimensiones(self):
        self.assertEqual((SEQUENCE_LENGTH, N_FEATURES), (30, 270))
        self.assertEqual(IDX_RH[1] - IDX_RH[0], 63)

    def test_espejar_es_su_propia_inversa(self):
        s = secuencia_natural(1, derecha=True, izquierda=True)
        np.testing.assert_allclose(espejar_secuencia(espejar_secuencia(s)), s, atol=1e-6)

    def test_espejar_intercambia_manos_y_refleja_x(self):
        s = secuencia_natural(2, derecha=True, izquierda=False)
        e = espejar_secuencia(s)
        self.assertTrue(np.all(e[:, IDX_RH[0]:IDX_RH[1]] == 0))          # la derecha quedó ausente
        izq = e[:, IDX_LH[0]:IDX_LH[1]].reshape(30, 21, 3)
        orig = s[:, IDX_RH[0]:IDX_RH[1]].reshape(30, 21, 3)
        np.testing.assert_allclose(izq[..., 0], 1 - orig[..., 0], atol=1e-6)
        np.testing.assert_allclose(izq[..., 1:], orig[..., 1:], atol=1e-6)

    def test_espejar_no_inventa_puntos_ausentes(self):
        e = espejar_secuencia(secuencia_natural(3))
        self.assertTrue(np.all(e[:, IDX_RH[0]:IDX_RH[1]] == 0))
        self.assertEqual(int(np.count_nonzero(e[:, 0::3] == 1.0)), 0)    # ausente no pasa a x = 1


def _vista_con_aspecto(seq, a):
    """La misma escena vista por una cámara de relación ancho/alto `a` en vez de 16:9 (x e y de MediaPipe son x/ancho, y/alto)."""
    P = seq.reshape(30, 90, 3).copy()
    presente = np.any(P != 0, axis=-1)
    P[..., 0] = np.where(presente, P[..., 0] * ASPECTO_REFERENCIA / a, 0)
    P[..., 2] = np.where(presente, P[..., 2] * ASPECTO_REFERENCIA / a, 0)
    return P.reshape(30, N_FEATURES)


class AspectoTest(unittest.TestCase):
    def test_con_la_referencia_o_sin_aspecto_no_cambia_nada(self):
        s = secuencia_natural(1, izquierda=True)
        np.testing.assert_array_equal(corregir_aspecto(s, ASPECTO_REFERENCIA), s)
        np.testing.assert_array_equal(corregir_aspecto(s, None), s)

    def test_no_modifica_la_entrada(self):
        s = secuencia_natural(2)
        copia = s.copy()
        corregir_aspecto(s, 3 / 4)
        np.testing.assert_array_equal(s, copia)

    def test_ida_y_vuelta_recupera_la_escena_de_referencia(self):
        s = secuencia_natural(3, izquierda=True)
        for a in (4 / 3, 1.0, 3 / 4, 9 / 16, 2.0):
            np.testing.assert_allclose(corregir_aspecto(_vista_con_aspecto(s, a), a), s, atol=1e-5, err_msg=f"aspecto {a}")

    def test_lo_ausente_sigue_ausente(self):
        s = secuencia_natural(4, derecha=True, izquierda=False)
        c = corregir_aspecto(s, 3 / 4)
        self.assertTrue(np.all(c[:, IDX_LH[0]:IDX_LH[1]] == 0))
        self.assertTrue(np.all((c == 0) == (s == 0)))

    def test_solo_cambian_x_y_z_no_y(self):
        s = secuencia_natural(5)
        c = corregir_aspecto(s, 3 / 4)
        np.testing.assert_array_equal(c[:, 1::3], s[:, 1::3])
        np.testing.assert_allclose(c[:, 0::3], s[:, 0::3] * (3 / 4) / ASPECTO_REFERENCIA, atol=1e-6)

    def test_acepta_lotes_y_secuencias_sueltas(self):
        lote = np.stack([secuencia_natural(6), secuencia_natural(7)])
        self.assertEqual(corregir_aspecto(lote, 4 / 3).shape, lote.shape)
        self.assertEqual(corregir_aspecto(lote[0, 0], 4 / 3).shape, (N_FEATURES,))

    def test_aspectos_invalidos(self):
        for a in (0, -1, float("nan"), float("inf"), 100.0, 0.01):
            with self.assertRaises(ValueError, msg=str(a)):
                corregir_aspecto(secuencia_natural(1), a)

    def test_los_rasgos_son_iguales_sea_cual_sea_la_camara_una_vez_corregida(self):
        """Lo que se midió: sin corregir, un celular en vertical bajaba el acierto de 49 % a 33 %."""
        s = secuencia_natural(8, izquierda=True)
        referencia = extraer_rasgos(s, "manos")
        for a in (4 / 3, 3 / 4, 9 / 16):
            vista = _vista_con_aspecto(s, a)
            sin_corregir = extraer_rasgos(vista, "manos")
            corregida = extraer_rasgos(corregir_aspecto(vista, a), "manos")
            np.testing.assert_allclose(corregida, referencia, atol=2e-3, err_msg=f"aspecto {a}")
            self.assertGreater(float(np.abs(sin_corregir - referencia).max()), 0.05, f"aspecto {a}: sin corregir debería diferir")


class CalidadTest(unittest.TestCase):
    def test_natural_tiene_z_negativo(self):
        s = secuencia_natural(4)
        self.assertGreater(proporcion_z_negativo(s), 0.5)
        self.assertFalse(z_recortado(s))

    def test_recortada_se_detecta(self):
        self.assertTrue(z_recortado(secuencia_con_z_recortado(5)))

    def test_secuencia_vacia_no_es_sospechosa(self):
        vacia = np.zeros((30, 270), dtype=np.float32)
        self.assertTrue(np.isnan(proporcion_z_negativo(vacia)))
        self.assertFalse(z_recortado(vacia))

    def test_proporcion_sospechosas(self):
        X = np.stack([secuencia_natural(1), secuencia_con_z_recortado(2), secuencia_con_z_recortado(3), secuencia_natural(4)])
        self.assertAlmostEqual(proporcion_sospechosas(X), 0.5)
        self.assertEqual(proporcion_sospechosas(np.zeros((0, 30, 270))), 0.0)


if __name__ == "__main__":
    unittest.main()
