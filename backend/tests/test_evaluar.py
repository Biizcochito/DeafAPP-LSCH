import unittest

import numpy as np

from evaluar_modelo import curva_umbral, evaluar, umbral_sugerido

CLASES = ["a", "b", "c"]


class EvaluarTest(unittest.TestCase):
    def test_exactitud_y_umbral(self):
        probs = np.array([
            [0.9, 0.05, 0.05],     # acierta, responde
            [0.1, 0.8, 0.1],       # acierta, responde
            [0.2, 0.6, 0.2],       # falla (real a), NO responde (0.6 < 0.75)
            [0.05, 0.05, 0.9],     # falla (real b), responde
        ])
        r = evaluar(probs, [0, 1, 0, 1], CLASES, umbral=0.75)
        self.assertEqual(r["n"], 4)
        self.assertAlmostEqual(r["exactitud"], 0.5)
        self.assertEqual(r["respondio"], 3)
        self.assertAlmostEqual(r["acerto_entre_respondidas"], 2 / 3, places=3)
        self.assertEqual(r["por_clase"]["a"]["exactitud"], 0.5)
        self.assertGreater(r["confianza_media_si_acierta"], 0.8)
        self.assertLess(r["confianza_media_si_falla"], r["confianza_media_si_acierta"])

    def test_nadie_responde(self):
        r = evaluar(np.array([[0.4, 0.3, 0.3]]), [1], CLASES, umbral=0.75)
        self.assertEqual(r["respondio"], 0)
        self.assertIsNone(r["acerto_entre_respondidas"])

    def test_sin_aciertos_ni_fallos(self):
        todos_bien = evaluar(np.array([[0.9, 0.05, 0.05]]), [0], CLASES)
        self.assertIsNone(todos_bien["confianza_media_si_falla"])
        todos_mal = evaluar(np.array([[0.9, 0.05, 0.05]]), [1], CLASES)
        self.assertIsNone(todos_mal["confianza_media_si_acierta"])

    def test_vacio(self):
        r = evaluar(np.zeros((0, 3)), [], CLASES)
        self.assertIsNone(r["exactitud"])
        self.assertEqual(r["respondio"], 0)


class UmbralTest(unittest.TestCase):
    def _datos(self):
        # 10 secuencias: las muy seguras aciertan, las dudosas fallan
        probs = np.array([[0.9, 0.05, 0.05]] * 4 + [[0.6, 0.2, 0.2]] * 3 + [[0.4, 0.3, 0.3]] * 3)
        reales = [0, 0, 0, 0, 0, 1, 1, 1, 2, 0]
        return probs, reales

    def test_curva_es_monotona_en_cobertura(self):
        probs, reales = self._datos()
        curva = curva_umbral(probs, reales)
        coberturas = [f["cobertura"] for f in curva]
        self.assertEqual(coberturas, sorted(coberturas, reverse=True))
        self.assertEqual(curva[0]["umbral"], 0.2)
        self.assertEqual(curva[0]["cobertura"], 1.0)
        fila_09 = next(f for f in curva if f["umbral"] == 0.9)
        self.assertEqual((fila_09["responde"], fila_09["acierto"]), (4, 1.0))

    def test_umbral_sugerido_es_el_mas_bajo_que_cumple(self):
        probs, reales = self._datos()
        curva = curva_umbral(probs, reales)
        u = umbral_sugerido(curva, acierto_objetivo=0.9, cobertura_minima=0.3)
        fila = next(f for f in curva if f["umbral"] == u)
        self.assertGreaterEqual(fila["acierto"], 0.9)
        anteriores = [f for f in curva if f["umbral"] < u]
        self.assertTrue(all(f["acierto"] is None or f["acierto"] < 0.9 or f["cobertura"] < 0.3 for f in anteriores))

    def test_si_ninguno_cumple_no_inventa_un_umbral(self):
        probs, reales = np.array([[0.9, 0.1]] * 5), [1] * 5               # siempre falla con mucha confianza
        self.assertIsNone(umbral_sugerido(curva_umbral(probs, reales)))
        self.assertEqual(umbral_sugerido(curva_umbral(probs, reales), por_defecto=0.66), 0.66)

    def test_curva_vacia(self):
        self.assertEqual(umbral_sugerido([], por_defecto=0.7), 0.7)
        self.assertIsNone(umbral_sugerido([]))

    def test_top_k(self):
        probs = np.array([[0.5, 0.3, 0.1, 0.1],     # real 1: es la 2.ª → dentro de las 3 primeras
                          [0.1, 0.2, 0.3, 0.4],     # real 0: es la 4.ª → fuera
                          [0.4, 0.3, 0.2, 0.1]])    # real 3: es la 4.ª → fuera
        r = evaluar(probs, [1, 0, 3], ["a", "b", "c", "d"])
        self.assertAlmostEqual(r["exactitud"], 0.0)
        self.assertAlmostEqual(r["top3"], 1 / 3, places=3)
        self.assertNotIn("top5", r)                                # solo hay 4 clases


if __name__ == "__main__":
    unittest.main()
