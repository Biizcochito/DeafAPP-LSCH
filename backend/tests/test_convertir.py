import base64
import unittest

import numpy as np

from convertir_deafapp import (
    ASPECTO_WEB_POR_DEFECTO, MIN_FOTOGRAMAS, aspecto_de_grabacion, decodificar_frames, porcentaje_con_manos, remuestrear,
    secuencia_desde_puntos_web, secuencia_desde_vectores,
)
from etiquetas import limpiar_etiqueta, ruta_segura
from formato import FACE_KEY_IDX, IDX_FACE, IDX_LH, IDX_RH, N_FEATURES


def _muestra(derecha=True, izquierda=False, cara=True, desplazamiento=0.0):
    punto = lambda base: [[base + 0.01 * i + desplazamiento, 0.5, -0.02] for i in range(21)]
    return {
        "right": punto(0.2) if derecha else None,
        "left": punto(0.6) if izquierda else None,
        "face": [[0.4 + 0.001 * i, 0.3, -0.01] for i in range(len(FACE_KEY_IDX))] if cara else None,
    }


def _training(n=30, **kwargs):
    return {"coordinateSystem": "normalized-unmirrored-video", "faceIndices": list(FACE_KEY_IDX),
            "samples": [_muestra(desplazamiento=0.001 * i, **kwargs) for i in range(n)]}


class FramesTest(unittest.TestCase):
    def test_decodifica_con_y_sin_prefijo(self):
        b64 = base64.b64encode(b"jpegdata").decode()
        self.assertEqual(decodificar_frames({"frames": [b64, "data:image/jpeg;base64," + b64]}), [b"jpegdata"] * 2)

    def test_rechaza_base64_invalido_y_vacios(self):
        with self.assertRaises(ValueError):
            decodificar_frames({"frames": ["¡no es base64!"]})
        with self.assertRaises(ValueError):
            decodificar_frames({"frames": [""]})
        self.assertEqual(decodificar_frames({}), [])


class RemuestreoTest(unittest.TestCase):
    def test_siempre_devuelve_treinta_y_conserva_extremos(self):
        for n in (10, 17, 30, 45, 90):
            vectores = [np.full(N_FEATURES, i, dtype=np.float32) for i in range(n)]
            r = remuestrear(vectores)
            self.assertEqual(r.shape, (30, N_FEATURES))
            self.assertEqual(r[0, 0], 0)
            self.assertEqual(r[-1, 0], n - 1)
            self.assertTrue(np.all(np.diff(r[:, 0]) >= 0))

    def test_minimo_de_fotogramas(self):
        with self.assertRaises(ValueError):
            secuencia_desde_vectores([np.zeros(N_FEATURES)] * (MIN_FOTOGRAMAS - 1))
        self.assertEqual(secuencia_desde_vectores([np.zeros(N_FEATURES)] * MIN_FOTOGRAMAS).shape, (30, N_FEATURES))

    def test_forma_de_vector_incorrecta(self):
        with self.assertRaises(ValueError):
            secuencia_desde_vectores([np.zeros(264)] * 30)


class PuntosWebTest(unittest.TestCase):
    def test_derecha_a_ranura_0_izquierda_a_ranura_1_sin_tocar_x(self):
        seq = secuencia_desde_puntos_web(_training(derecha=True, izquierda=True), espejar=False)
        self.assertEqual(seq.shape, (30, N_FEATURES))
        self.assertAlmostEqual(float(seq[0, IDX_RH[0]]), 0.2, places=5)
        self.assertAlmostEqual(float(seq[0, IDX_LH[0]]), 0.6, places=5)
        self.assertTrue(np.all(seq[:, 252:] == 0))               # la web no captura pose
        self.assertTrue(np.any(seq[:, IDX_FACE[0]:IDX_FACE[1]]))

    def test_mano_ausente_queda_en_ceros(self):
        seq = secuencia_desde_puntos_web(_training(derecha=True, izquierda=False), espejar=False)
        self.assertFalse(np.any(seq[:, IDX_LH[0]:IDX_LH[1]]))
        self.assertEqual(porcentaje_con_manos(seq), 1.0)

    def test_espejo_intercambia_manos_y_refleja_x(self):
        seq = secuencia_desde_puntos_web(_training(derecha=True, izquierda=False), espejar=True)
        self.assertFalse(np.any(seq[:, IDX_RH[0]:IDX_RH[1]]))
        self.assertAlmostEqual(float(seq[0, IDX_LH[0]]), 0.8, places=5)

    def test_sistema_de_coordenadas_desconocido(self):
        t = _training()
        t["coordinateSystem"] = "mirrored"
        with self.assertRaises(ValueError):
            secuencia_desde_puntos_web(t)

    def test_indices_de_cara_distintos(self):
        t = _training()
        t["faceIndices"] = list(range(42))
        with self.assertRaises(ValueError):
            secuencia_desde_puntos_web(t)

    def test_puntos_con_forma_o_valores_invalidos(self):
        t = _training()
        t["samples"][0]["right"] = [[0, 0, 0]] * 20
        with self.assertRaises(ValueError):
            secuencia_desde_puntos_web(t)
        t = _training()
        t["samples"][0]["right"][0][0] = float("nan")
        with self.assertRaises(ValueError):
            secuencia_desde_puntos_web(t)

    def test_pocas_muestras(self):
        with self.assertRaises(ValueError):
            secuencia_desde_puntos_web(_training(n=5))

    def test_el_aspecto_lleva_los_puntos_al_formato_de_referencia(self):
        from formato import ASPECTO_REFERENCIA
        base = secuencia_desde_puntos_web(_training(), espejar=False)
        web = secuencia_desde_puntos_web(_training(), espejar=False, aspecto=4 / 3)
        np.testing.assert_allclose(web[:, 0::3], base[:, 0::3] * (4 / 3) / ASPECTO_REFERENCIA, atol=1e-6)
        np.testing.assert_array_equal(web[:, 1::3], base[:, 1::3])
        np.testing.assert_array_equal(secuencia_desde_puntos_web(_training(), espejar=False, aspecto=ASPECTO_REFERENCIA), base)

    def test_el_espejo_se_aplica_antes_de_corregir_el_aspecto(self):
        from formato import ASPECTO_REFERENCIA, corregir_aspecto, espejar_secuencia
        sin = secuencia_desde_puntos_web(_training(derecha=True, izquierda=False), espejar=False)
        esperado = corregir_aspecto(espejar_secuencia(sin), 3 / 4)
        np.testing.assert_allclose(
            secuencia_desde_puntos_web(_training(derecha=True, izquierda=False), espejar=True, aspecto=3 / 4), esperado, atol=1e-6)

    def test_aspecto_de_la_grabacion(self):
        self.assertEqual(aspecto_de_grabacion({"frameAspectRatio": 0.75}), 0.75)
        self.assertEqual(aspecto_de_grabacion({"frameAspectRatio": 2}), 2.0)
        for invalido in ({}, {"frameAspectRatio": None}, {"frameAspectRatio": "4/3"}, {"frameAspectRatio": 0},
                         {"frameAspectRatio": -1}, {"frameAspectRatio": True}):
            self.assertEqual(aspecto_de_grabacion(invalido), ASPECTO_WEB_POR_DEFECTO, str(invalido))

    def test_porcentaje_con_manos(self):
        seq = secuencia_desde_puntos_web(_training(derecha=False, izquierda=False), espejar=False)
        self.assertEqual(porcentaje_con_manos(seq), 0.0)


class EtiquetasTest(unittest.TestCase):
    def test_validas(self):
        self.assertEqual(limpiar_etiqueta("  Carne   Molida "), "carne molida")
        self.assertEqual(limpiar_etiqueta("Aliño"), "aliño")
        self.assertEqual(limpiar_etiqueta("puré"), "puré")
        self.assertEqual(limpiar_etiqueta("a-1_b"), "a-1_b")
        self.assertEqual(limpiar_etiqueta("a\n\tb"), "a b")          # los espacios raros se normalizan

    def test_invalidas(self):
        for texto in (None, 5, "", "   ", "../x", "a/b", "a\\b", "..", ".oculta", "x" * 41, "a;b", "-guion"):
            self.assertIsNone(limpiar_etiqueta(texto), repr(texto))

    def test_ruta_segura(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(ruta_segura(tmp, "hola", "a.npy").parent.name, "hola")
            with self.assertRaises(ValueError):
                ruta_segura(tmp, "..", "fuera.npy")
            with self.assertRaises(ValueError):
                ruta_segura(tmp, "hola", "..", "..", "fuera.npy")


if __name__ == "__main__":
    unittest.main()
