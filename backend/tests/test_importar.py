import contextlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import numpy as np

import importar_deafapp as imp
from formato import FACE_KEY_IDX, N_FEATURES
from tests.test_convertir import _training


class RespuestaFalsa:
    def __init__(self, estado=200, contenido=b"", datos=None):
        self.status_code = estado
        self._contenido = contenido
        self._datos = datos

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def raise_for_status(self):
        if self.status_code >= 400:
            raise imp.requests.HTTPError(f"HTTP {self.status_code}")

    def json(self):
        return self._datos

    def iter_content(self, tamano):
        for i in range(0, len(self._contenido), tamano):
            yield self._contenido[i:i + tamano]


class SesionFalsa:
    """Imita /rest/v1/grabaciones y el bucket `contribuciones` sin red."""

    def __init__(self, filas, archivos, solo_privado=False):
        self.filas, self.archivos, self.solo_privado = filas, archivos, solo_privado
        self.headers = {}
        self.llamadas = []

    def get(self, url, **kwargs):
        self.llamadas.append(url)
        if "/rest/v1/grabaciones" in url:
            parametros = kwargs["params"]
            assert parametros["aprobada"] == "eq.true"
            desde = int(parametros["offset"])
            return RespuestaFalsa(datos=self.filas[desde:desde + int(parametros["limit"])])
        ruta = url.split("/contribuciones/", 1)[1]
        from urllib.parse import unquote
        ruta = unquote(ruta)
        if "/object/public/" in url and self.solo_privado:
            return RespuestaFalsa(404)
        if ruta in self.archivos:
            return RespuestaFalsa(200, self.archivos[ruta])
        return RespuestaFalsa(404)

    # POST RPC únicamente de lectura; ningún envío ni modificación.
    def post(self, url, **kwargs):
        self.llamadas.append(url)
        if url.endswith('/rest/v1/rpc/deafapp_storage_route'):
            return RespuestaFalsa(datos={"ok": True, "provider": "supabase"})
        raise AssertionError("el importador no debe escribir en Supabase")
    def put(self, *a, **k): raise AssertionError("el importador no debe escribir")
    patch = delete = put


def _grabacion_json(**kwargs) -> bytes:
    return json.dumps({"label": "x", "training": _training(**kwargs)}).encode()


def _fila(i, etiqueta="hola", ruta=None, version=1, categoria="saludos"):
    return {"id": i, "label": etiqueta, "categoria": categoria, "archivo_path": ruta or f"{categoria}/{i}.json",
            "moderation_version": version}


def _ejecutar(sesion, *argumentos):
    salida = io.StringIO()
    with mock.patch.object(imp, "crear_sesion", return_value=sesion), \
         mock.patch.object(sys, "argv", ["importar_deafapp.py", "--usar-puntos-web", *argumentos]), \
         contextlib.redirect_stdout(salida):
        codigo = imp.main()
    return codigo, salida.getvalue()


class DescargaTest(unittest.TestCase):
    def test_r2_privado_no_falla_abierto_al_bucket_publico(self):
        sesion = SesionFalsa([], {})
        def lectura(url, **kwargs):
            sesion.llamadas.append(url)
            if url.endswith('/rest/v1/rpc/deafapp_storage_route'):
                return RespuestaFalsa(datos={"ok": True, "provider": "r2"})
            self.assertTrue(url.endswith('/functions/v1/recording-storage'))
            self.assertEqual(kwargs['json'], {"action": "read", "path": "saludos/1.json"})
            return RespuestaFalsa(200, b'{"frames": ["synthetic"]}')
        sesion.post = lectura
        self.assertEqual(imp.descargar_grabacion(sesion, 'https://x.supabase.co', 'saludos/1.json')['frames'], ['synthetic'])
        self.assertTrue(all('/storage/v1/' not in url for url in sesion.llamadas))
        sesion.post = lambda *a, **k: RespuestaFalsa(403)
        with self.assertRaises(imp.requests.HTTPError):
            imp.descargar_grabacion(sesion, 'https://x.supabase.co', 'saludos/1.json')

    def test_rutas_peligrosas(self):
        sesion = SesionFalsa([], {})
        for ruta in ("../x.json", "a/../../b.json", "a/b.txt", None, 5):
            with self.assertRaises(ValueError):
                imp.descargar_grabacion(sesion, "https://x.supabase.co", ruta)

    def test_prueba_publica_y_luego_privada(self):
        sesion = SesionFalsa([], {"saludos/1.json": b'{"a": 1}'}, solo_privado=True)
        self.assertEqual(imp.descargar_grabacion(sesion, "https://x.supabase.co", "saludos/1.json"), {"a": 1})
        self.assertIn("/object/public/", sesion.llamadas[1])
        self.assertNotIn("/public/", sesion.llamadas[2])

    def test_no_encontrada(self):
        with self.assertRaises(ValueError):
            imp.descargar_grabacion(SesionFalsa([], {}), "https://x.supabase.co", "saludos/9.json")

    def test_tope_de_tamano(self):
        grande = b"x" * (imp.MAX_BYTES + 1)
        with self.assertRaises(ValueError):
            imp.descargar_grabacion(SesionFalsa([], {"a/1.json": grande}), "https://x.supabase.co", "a/1.json")

    def test_listado_pagina(self):
        filas = [_fila(i) for i in range(250)]
        self.assertEqual(len(imp.listar_aprobadas(SesionFalsa(filas, {}), "https://x.supabase.co")), 250)


class ImportarTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.salida = Path(self.tmp.name) / "dataset"

    def correr(self, sesion, *extra):
        return _ejecutar(sesion, "--salida", str(self.salida), *extra)

    def manifiesto(self):
        return json.loads((self.salida / "_deafapp.json").read_text(encoding="utf-8"))["items"]

    def test_importa_y_es_idempotente(self):
        sesion = SesionFalsa([_fila(1), _fila(2, "gracias", categoria="saludos")],
                             {"saludos/1.json": _grabacion_json(), "saludos/2.json": _grabacion_json()})
        codigo, texto = self.correr(sesion)
        self.assertEqual(codigo, 0)
        self.assertIn("'importadas': 2", texto)
        s = np.load(self.salida / "hola" / "deafapp_1.npy")
        self.assertEqual((s.shape, s.dtype), ((30, N_FEATURES), np.float32))
        self.assertTrue((self.salida / "gracias" / "deafapp_2.npy").exists())
        items = self.manifiesto()
        self.assertEqual(items["1"]["estado"], "importada")
        self.assertEqual(items["1"]["fuente"], "puntos-web")
        self.assertEqual(items["1"]["npy"], "hola/deafapp_1.npy")
        _, texto = self.correr(sesion)
        self.assertIn("'sin cambios': 2", texto)

    def test_importa_llevando_los_puntos_al_formato_de_referencia(self):
        """Una grabación hecha con una cámara vertical (3:4) se convierte a lo que habría salido con una 16:9."""
        from formato import ASPECTO_REFERENCIA
        con_aspecto = json.dumps({"label": "x", "training": _training(), "frameAspectRatio": 0.75}).encode()
        sin_aspecto = _grabacion_json()                                  # sin frameAspectRatio: se asume el de la web (4:3)
        sesion = SesionFalsa([_fila(1), _fila(2, "gracias")], {"saludos/1.json": con_aspecto, "saludos/2.json": sin_aspecto})
        self.correr(sesion)
        vertical = np.load(self.salida / "hola" / "deafapp_1.npy")
        web = np.load(self.salida / "gracias" / "deafapp_2.npy")
        np.testing.assert_allclose(vertical[:, 0::3], web[:, 0::3] * (0.75 / (4 / 3)), atol=1e-5)
        crudo = _training()["samples"][0]["right"][0][0]                 # x de la primera muñeca tal como la mandó el navegador
        self.assertAlmostEqual(float(vertical[0, 0]), crudo * 0.75 / ASPECTO_REFERENCIA, places=5)
        np.testing.assert_allclose(vertical[:, 1::3], web[:, 1::3], atol=1e-6)      # y no cambia
        self.assertEqual(self.manifiesto()["1"]["conversion"], imp.VERSION_CONVERSION)

    def test_rehace_lo_importado_antes_de_corregir_el_aspecto(self):
        sesion = SesionFalsa([_fila(1)], {"saludos/1.json": _grabacion_json()})
        self.correr(sesion)
        manifiesto = self.salida / "_deafapp.json"
        datos = json.loads(manifiesto.read_text(encoding="utf-8"))
        del datos["items"]["1"]["conversion"]                            # un manifiesto de antes de este cambio
        manifiesto.write_text(json.dumps(datos), encoding="utf-8")
        _, texto = self.correr(sesion)
        self.assertIn("'importadas': 1", texto)
        self.assertNotIn("sin cambios", texto)
        _, texto = self.correr(sesion)
        self.assertIn("'sin cambios': 1", texto)

    def test_aspecto_invalido_se_omite_con_motivo(self):
        malo = json.dumps({"label": "x", "training": _training(), "frameAspectRatio": 50}).encode()
        self.correr(SesionFalsa([_fila(1)], {"saludos/1.json": malo}))
        item = self.manifiesto()["1"]
        self.assertEqual(item["estado"], "omitida")
        self.assertIn("aspecto", item["motivo"].lower())

    def test_reimporta_si_cambia_la_version_de_moderacion(self):
        fila = _fila(1)
        sesion = SesionFalsa([fila], {"saludos/1.json": _grabacion_json()})
        self.correr(sesion)
        fila["moderation_version"] = 2
        _, texto = self.correr(sesion)
        self.assertIn("'importadas': 1", texto)

    def test_omite_con_motivo_y_no_crea_archivo(self):
        sesion = SesionFalsa(
            [_fila(1), _fila(2, ruta="saludos/9.json"), _fila(3, etiqueta="../x"), _fila(4, "sinmanos")],
            {"saludos/1.json": json.dumps({"label": "x"}).encode(),
             "saludos/4.json": _grabacion_json(derecha=False, izquierda=False)})
        self.correr(sesion)
        items = self.manifiesto()
        self.assertTrue(all(items[k]["estado"] == "omitida" for k in "1234"))
        self.assertIn("sin puntos de la web", items["1"]["motivo"])
        self.assertIn("No se encontró", items["2"]["motivo"])
        self.assertIn("etiqueta no válida", items["3"]["motivo"])
        self.assertIn("con mano", items["4"]["motivo"])
        self.assertEqual(list(self.salida.rglob("*.npy")), [])

    def test_la_etiqueta_nunca_escapa_de_la_carpeta(self):
        sesion = SesionFalsa([_fila(1, etiqueta="../../fuera")], {"saludos/1.json": _grabacion_json()})
        self.correr(sesion)
        self.assertEqual(list(Path(self.tmp.name).rglob("*.npy")), [])

    def test_retira_lo_que_deja_de_estar_aprobado(self):
        sesion = SesionFalsa([_fila(1), _fila(2, "gracias")],
                             {"saludos/1.json": _grabacion_json(), "saludos/2.json": _grabacion_json()})
        self.correr(sesion)
        sesion.filas = [_fila(2, "gracias")]                    # la 1 fue des-aprobada
        _, texto = self.correr(sesion)
        self.assertIn("'retiradas': 1", texto)
        self.assertFalse((self.salida / "hola" / "deafapp_1.npy").exists())
        self.assertTrue((self.salida / "gracias" / "deafapp_2.npy").exists())
        self.assertEqual(self.manifiesto()["1"]["estado"], "retirada")

    def test_con_filtros_no_retira_lo_que_no_se_miro(self):
        sesion = SesionFalsa([_fila(1), _fila(2, "gracias")],
                             {"saludos/1.json": _grabacion_json(), "saludos/2.json": _grabacion_json()})
        self.correr(sesion)
        self.correr(sesion, "--etiquetas", "hola")
        self.assertTrue((self.salida / "gracias" / "deafapp_2.npy").exists())

    def test_solo_listar_no_crea_nada(self):
        sesion = SesionFalsa([_fila(1)], {"saludos/1.json": _grabacion_json()})
        codigo, texto = self.correr(sesion, "--solo-listar")
        self.assertEqual(codigo, 0)
        self.assertIn("hola", texto)
        self.assertFalse(self.salida.exists())

    def test_limite(self):
        sesion = SesionFalsa([_fila(i) for i in range(1, 6)], {f"saludos/{i}.json": _grabacion_json() for i in range(1, 6)})
        self.correr(sesion, "--limite", "2")
        self.assertEqual(len(list(self.salida.rglob("*.npy"))), 2)


if __name__ == "__main__":
    unittest.main()
