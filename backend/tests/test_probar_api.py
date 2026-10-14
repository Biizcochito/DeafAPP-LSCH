import contextlib
import io
import tempfile
import unittest
from pathlib import Path

import numpy as np

import probar_api
from api_flask import crear_app
from formato import N_FEATURES, SEQUENCE_LENGTH
from tests.ayudas import secuencia_con_z_recortado, secuencia_natural
from tests.test_api import CLASES, FakeServicios

ORIGEN = "https://web.ejemplo.cl"


class _Respuesta:
    def __init__(self, r):
        self._r = r
        self.status_code = r.status_code
        self.headers = r.headers

    def json(self):
        return self._r.json


class SesionFlask:
    """Hace que probar_api hable con el cliente de pruebas de Flask como si fuera requests."""

    def __init__(self, cliente, base="http://prueba"):
        self.cliente, self.base = cliente, base

    def _ruta(self, url):
        return url[len(self.base):]

    def get(self, url, **kw):
        return _Respuesta(self.cliente.get(self._ruta(url)))

    def post(self, url, json=None, **kw):
        return _Respuesta(self.cliente.post(self._ruta(url), json=json))

    def options(self, url, headers=None, **kw):
        return _Respuesta(self.cliente.options(self._ruta(url), headers=headers))


def _servidor(origenes="*"):
    s = FakeServicios()
    app = crear_app(clases=CLASES, predecir=s.predecir, procesar_frame=s.procesar, origenes_cors=origenes,
                    subir_contribucion=None)
    return SesionFlask(app.test_client())


@unittest.skipUnless(__import__("importlib").util.find_spec("flask_cors"), "flask-cors no está instalado")
class ProbarTest(unittest.TestCase):
    def test_todo_bien(self):
        r = probar_api.probar(_servidor("*"), "http://prueba", ORIGEN, secuencia_natural(1), "hola")
        self.assertEqual([p for p, ok, _ in r if not ok], [])
        detalle = {p: d for p, _, d in r}
        self.assertIn("2 clases", detalle["GET /estado"])
        self.assertIn("hola", detalle["POST /clasificar"])
        self.assertIn("está entre las 3", detalle["POST /clasificar"])

    def test_cors_que_no_deja_pasar_a_la_web(self):
        r = probar_api.probar(_servidor("https://otro.dominio"), "http://prueba", ORIGEN, secuencia_natural(1), None)
        cors = next(x for x in r if x[0] == "CORS desde la web")
        self.assertFalse(cors[1])
        self.assertIn("LSCH_CORS_ORIGINS", cors[2])


class SinCorsTest(unittest.TestCase):
    def test_sin_secuencia_avisa_y_no_revienta(self):
        r = probar_api.probar(_servidor(None), "http://prueba", ORIGEN, None, None)
        paso = next(x for x in r if x[0] == "POST /clasificar")
        self.assertFalse(paso[1])
        self.assertIn("--secuencia", paso[2])

    def test_servidor_apagado_corta_enseguida(self):
        class Caido:
            def get(self, *a, **k):
                raise ConnectionError("rechazada")
        r = probar_api.probar(Caido(), "http://nada", ORIGEN, secuencia_natural(1), None)
        self.assertEqual(len(r), 1)
        self.assertFalse(r[0][1])
        self.assertIn("no se pudo conectar", r[0][2])

    def test_rechaza_entradas_invalidas(self):
        r = probar_api.probar(_servidor(None), "http://prueba", ORIGEN, secuencia_natural(1), None)
        self.assertTrue(next(x for x in r if x[0] == "rechaza entradas inválidas")[1])


class BuscarSecuenciaTest(unittest.TestCase):
    def test_elige_una_natural_y_salta_copias_y_danadas(self):
        with tempfile.TemporaryDirectory() as tmp:
            raiz = Path(tmp)
            (raiz / "hola").mkdir()
            np.save(raiz / "hola" / "aug_seq_0000__00.npy", secuencia_natural(9))      # copia aumentada
            np.save(raiz / "hola" / "seq_0001.npy", secuencia_con_z_recortado(9))       # dañada
            np.save(raiz / "hola" / "seq_0002.npy", secuencia_natural(3))               # la buena
            seq, etiqueta = probar_api.buscar_secuencia(raiz)
            self.assertEqual(etiqueta, "hola")
            np.testing.assert_array_equal(seq, secuencia_natural(3))

    def test_sin_dataset(self):
        self.assertIsNone(probar_api.buscar_secuencia("/ruta/que/no/existe"))
        with tempfile.TemporaryDirectory() as tmp:
            self.assertIsNone(probar_api.buscar_secuencia(tmp))


class MainTest(unittest.TestCase):
    def test_codigo_de_salida(self):
        salida = io.StringIO()
        with contextlib.redirect_stdout(salida):
            codigo = probar_api.main(["--url", "http://prueba", "--dataset", "/no/existe"], sesion=_servidor(None))
        self.assertEqual(codigo, 1)                                 # sin secuencia de prueba no se da por bueno
        self.assertIn("✗ POST /clasificar", salida.getvalue())


if __name__ == "__main__":
    unittest.main()
