import base64
import logging
import tempfile
import unittest
from pathlib import Path

import numpy as np

from api_flask import crear_app
from buffers import BuferesPorDispositivo, normalizar_device_id
from formato import N_FEATURES, SEQUENCE_LENGTH

CLASES = ["hola", "gracias"]


def setUpModule():
    logging.disable(logging.CRITICAL)        # los errores esperados de las pruebas no ensucian la salida


def tearDownModule():
    logging.disable(logging.NOTSET)


def _b64(datos: bytes) -> str:
    return base64.b64encode(datos).decode()


def _secuencia_b64(valor: float = 0.1, n: int = SEQUENCE_LENGTH * N_FEATURES) -> str:
    return _b64(np.full(n, valor, dtype=np.float32).tobytes())


class FakeServicios:
    def __init__(self, probs=(0.9, 0.1)):
        self.probs = np.array(probs, dtype=np.float32)
        self.vistos = []
        self.predicciones = 0
        self.entradas = []                       # lo que recibió el modelo, para comprobar la corrección de aspecto
        self.clips = []                          # (jpegs, intervalo_ms) que recibió procesar_clip
        self.secuencia_del_clip = None           # lo que devuelve procesar_clip (por defecto, una seña con manos)
        self.subidas = []
        self.fallar_subida = False

    def procesar(self, imagen: bytes) -> np.ndarray:
        if imagen == b"no-imagen":
            raise ValueError("no es una imagen")
        self.vistos.append(imagen)
        return np.full(N_FEATURES, len(self.vistos), dtype=np.float32)

    def predecir(self, X: np.ndarray) -> np.ndarray:
        assert X.shape == (1, SEQUENCE_LENGTH, N_FEATURES) and X.dtype == np.float32
        self.predicciones += 1
        self.entradas.append(X.copy())
        return self.probs

    def procesar_clip(self, jpegs, intervalo_ms):
        if any(j == b"no-imagen" for j in jpegs):
            raise ValueError("un fotograma no es una imagen")
        self.clips.append((list(jpegs), intervalo_ms))
        if self.secuencia_del_clip is not None:
            return self.secuencia_del_clip
        from tests.ayudas import secuencia_natural
        return secuencia_natural(5)

    def subir(self, etiqueta, nombre, ruta):
        if self.fallar_subida:
            raise RuntimeError("Supabase caído")
        self.subidas.append((etiqueta, nombre, Path(ruta).exists()))
        return True


class BaseApi(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.s = FakeServicios()
        self.crear()

    def crear(self, **extra):
        opciones = dict(clases=CLASES, predecir=self.s.predecir, procesar_frame=self.s.procesar,
                        procesar_clip=self.s.procesar_clip,
                        subir_contribucion=self.s.subir, origenes_cors=None,
                        carpeta_contribuciones=str(Path(self.tmp.name) / "contribuciones"))
        opciones.update(extra)
        self.app = crear_app(**opciones)
        self.cliente = self.app.test_client()

    def predecir(self, device="movil", frame=b"jpeg"):
        return self.cliente.post("/predecir", json={"device_id": device, "frame": _b64(frame)})

    def llenar(self, device="movil", n=SEQUENCE_LENGTH):
        respuesta = None
        for _ in range(n):
            respuesta = self.predecir(device)
        return respuesta


class EstadoTest(BaseApi):
    def test_estado(self):
        r = self.cliente.get("/estado")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json["clases"], CLASES)
        self.assertEqual(r.json["estado"], "activo")
        self.assertTrue(r.json["supabase"])

    def test_sin_supabase(self):
        self.crear(subir_contribucion=None)
        self.assertFalse(self.cliente.get("/estado").json["supabase"])


class PredecirTest(BaseApi):
    def test_buffer_se_llena_y_predice(self):
        for i in range(SEQUENCE_LENGTH - 1):
            r = self.predecir()
            self.assertEqual((r.json["prediccion"], r.json["frames"], r.json["candidatos"]), (None, i + 1, []))
        r = self.predecir()
        self.assertEqual(r.json, {"prediccion": "hola", "confianza": 0.9, "frames": 30,
                                  "candidatos": [{"sena": "hola", "confianza": 0.9}, {"sena": "gracias", "confianza": 0.1}]})
        self.assertEqual(self.s.predicciones, 1)

    def test_bajo_el_umbral_no_devuelve_prediccion(self):
        self.s.probs = np.array([0.5, 0.5], dtype=np.float32)
        r = self.llenar()
        self.assertEqual((r.json["prediccion"], r.json["confianza"]), (None, 0.0))
        self.assertEqual(len(r.json["candidatos"]), 2)               # aunque no responda, ofrece las más probables

    def test_ventana_deslizante(self):
        self.llenar(n=SEQUENCE_LENGTH + 5)
        self.assertEqual(self.s.predicciones, 6)

    def test_dispositivos_independientes(self):
        self.llenar("a", 10)
        self.assertEqual(self.predecir("b").json["frames"], 1)
        self.assertEqual(self.predecir("a").json["frames"], 11)

    def test_limpiar_buffer(self):
        self.llenar("a", 10)
        self.assertTrue(self.cliente.post("/limpiar_buffer", json={"device_id": "a"}).json["exito"])
        self.assertEqual(self.predecir("a").json["frames"], 1)

    def test_device_id_raro_cae_en_default(self):
        self.predecir("../../etc/passwd")
        self.assertEqual(self.predecir("default").json["frames"], 2)

    def test_entradas_invalidas(self):
        for cuerpo in ({}, {"frame": ""}, {"frame": 5}, {"frame": "¡¡¡"}, {"frame": "abc"}):
            self.assertEqual(self.cliente.post("/predecir", json=cuerpo).status_code, 400, cuerpo)
        self.assertEqual(self.cliente.post("/predecir", data="no es json", content_type="text/plain").status_code, 400)
        self.assertEqual(self.cliente.post("/predecir", json=[1, 2]).status_code, 400)

    def test_frame_que_no_es_imagen(self):
        r = self.cliente.post("/predecir", json={"frame": _b64(b"no-imagen")})
        self.assertEqual(r.status_code, 400)

    def test_cuerpo_gigante(self):
        r = self.cliente.post("/predecir", json={"frame": "A" * 7_000_000})
        self.assertEqual(r.status_code, 413)

    def test_errores_internos_no_filtran_detalles(self):
        def falla(_):
            raise RuntimeError("ruta secreta C:/usuarios/x")
        self.crear(predecir=falla)
        r = self.llenar()
        self.assertEqual(r.status_code, 500)
        self.assertNotIn("secreta", r.get_data(as_text=True))

    def test_no_crece_sin_limite_con_muchos_dispositivos(self):
        self.crear(max_dispositivos=5)
        for i in range(30):
            self.predecir(f"d{i}")
        self.assertEqual(self.predecir("d29").json["frames"], 2)         # el reciente se conserva
        self.assertEqual(self.predecir("d0").json["frames"], 1)          # el antiguo se descartó


class ClasificarTest(BaseApi):
    def _training(self, **kwargs):
        from tests.test_convertir import _training
        return _training(**kwargs)

    def test_con_el_bloque_training_de_la_web(self):
        r = self.cliente.post("/clasificar", json={"training": self._training()})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json["prediccion"], "hola")
        self.assertEqual((r.json["frames"], len(r.json["candidatos"])), (30, 2))
        self.assertEqual(self.s.predicciones, 1)

    def test_el_clip_no_depende_del_buffer_de_ningun_dispositivo(self):
        self.llenar("a", 10)
        self.cliente.post("/clasificar", json={"training": self._training()})
        self.assertEqual(self.predecir("a").json["frames"], 11)                  # /clasificar no tocó el buffer

    def test_con_una_secuencia_cruda(self):
        r = self.cliente.post("/clasificar", json={"secuencia": _secuencia_b64()})
        self.assertEqual((r.status_code, r.json["prediccion"]), (200, "hola"))

    def test_bajo_el_umbral_no_responde_pero_ofrece_candidatos(self):
        self.s.probs = np.array([0.5, 0.5], dtype=np.float32)
        r = self.cliente.post("/clasificar", json={"secuencia": _secuencia_b64()})
        self.assertEqual((r.json["prediccion"], r.json["confianza"]), (None, 0.0))
        self.assertEqual(len(r.json["candidatos"]), 2)

    def test_entradas_invalidas(self):
        casos = [
            {},
            {"training": "no es un objeto"},
            {"training": {**self._training(), "coordinateSystem": "espejado"}},       # sistema de coordenadas desconocido
            {"training": self._training(n=5)},                                       # muy pocas muestras
            {"secuencia": _secuencia_b64(n=100)},                                    # tamaño incorrecto
            {"secuencia": "¡¡"},
            {"secuencia": _secuencia_b64(float("nan"))},
            {"secuencia": _secuencia_b64(1e9)},
        ]
        for cuerpo in casos:
            r = self.cliente.post("/clasificar", json=cuerpo)
            self.assertEqual(r.status_code, 400, str(cuerpo)[:80])
        self.assertEqual(self.s.predicciones, 0)

    # ── fotogramas (la app del celular), aspecto y aviso sin manos ──
    def _frames(self, n=30):
        return [_b64(b"jpeg%d" % i) for i in range(n)]

    def test_con_fotogramas_los_procesa_el_servidor(self):
        r = self.cliente.post("/clasificar", json={"frames": self._frames(), "intervalo_ms": 120})
        self.assertEqual(r.status_code, 200)
        self.assertEqual((r.json["prediccion"], r.json["fuente"], r.json["manos"]), ("hola", "frames", 1.0))
        self.assertEqual(len(r.json["candidatos"]), 2)
        jpegs, intervalo = self.s.clips[0]
        self.assertEqual((len(jpegs), intervalo, jpegs[3]), (30, 120, b"jpeg3"))

    def test_fotogramas_con_prefijo_data_url_y_intervalo_por_defecto(self):
        frames = ["data:image/jpeg;base64," + f for f in self._frames(12)]
        r = self.cliente.post("/clasificar", json={"frames": frames})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.s.clips[0][1], 100)
        self.assertEqual(self.s.clips[0][0][0], b"jpeg0")

    def test_fotogramas_invalidos(self):
        casos = [
            {"frames": self._frames(9)},                                         # muy pocos
            {"frames": self._frames(121)},                                       # demasiados
            {"frames": ["¡¡"] * 12},                                             # base64 no válido
            {"frames": self._frames(12) + [5]},                                  # un elemento que no es texto
            {"frames": self._frames(12), "intervalo_ms": 5},
            {"frames": self._frames(12), "intervalo_ms": "rápido"},
            {"frames": self._frames(12), "intervalo_ms": True},
            {"frames": [_b64(b"no-imagen")] + self._frames(11)},                 # el procesador rechaza uno
        ]
        for cuerpo in casos:
            self.assertEqual(self.cliente.post("/clasificar", json=cuerpo).status_code, 400, str(cuerpo)[:70])
        self.assertEqual(self.s.predicciones, 0)

    def test_sin_procesador_de_clips_responde_503(self):
        self.crear(procesar_clip=None)
        r = self.cliente.post("/clasificar", json={"frames": self._frames()})
        self.assertEqual(r.status_code, 503)
        self.assertIn("no procesa fotogramas", r.json["error"])
        self.assertEqual(self.cliente.post("/clasificar", json={"secuencia": _secuencia_b64()}).status_code, 200)

    def test_si_falta_mediapipe_responde_503(self):
        from api_flask import ServicioNoDisponible

        def sin_mediapipe(_jpegs, _ms):
            raise ServicioNoDisponible("falta MediaPipe")
        self.crear(procesar_clip=sin_mediapipe)
        r = self.cliente.post("/clasificar", json={"frames": self._frames()})
        self.assertEqual((r.status_code, r.json["error"]), (503, "falta MediaPipe"))

    def test_sin_manos_no_adivina_nada(self):
        self.s.secuencia_del_clip = np.zeros((SEQUENCE_LENGTH, N_FEATURES), dtype=np.float32)
        r = self.cliente.post("/clasificar", json={"frames": self._frames()})
        self.assertEqual(r.status_code, 200)
        self.assertEqual((r.json["candidatos"], r.json["prediccion"], r.json["manos"]), ([], None, 0.0))
        self.assertIn("No se detectaron manos", r.json["aviso"])
        self.assertEqual(self.s.predicciones, 0)                                   # ni siquiera consulta el modelo

    def test_con_pocas_manos_tampoco(self):
        from tests.ayudas import secuencia_natural
        s = secuencia_natural(5).reshape(30, 90, 3).copy()
        s[6:, 0:21, :] = 0                                                         # mano solo en 6 de 30 fotogramas (20 %)
        self.s.secuencia_del_clip = s.reshape(30, N_FEATURES)
        r = self.cliente.post("/clasificar", json={"frames": self._frames()})
        self.assertEqual((r.json["candidatos"], r.json["manos"]), ([], 0.2))

    def test_el_aspecto_se_corrige_antes_de_consultar_el_modelo(self):
        from formato import ASPECTO_REFERENCIA
        cuerpo = {"secuencia": _secuencia_b64(0.5)}
        self.cliente.post("/clasificar", json=cuerpo)                              # sin aspecto: referencia, sin cambios
        self.cliente.post("/clasificar", json={**cuerpo, "aspecto": 0.75})         # celular en vertical 3:4
        sin, vertical = self.s.entradas
        np.testing.assert_allclose(sin[0, :, 0::3], 0.5)
        np.testing.assert_allclose(vertical[0, :, 0::3], 0.5 * 0.75 / ASPECTO_REFERENCIA, atol=1e-6)
        np.testing.assert_allclose(vertical[0, :, 1::3], 0.5)                      # y no cambia

    def test_training_sin_aspecto_asume_el_de_la_web(self):
        from convertir_deafapp import secuencia_desde_puntos_web
        cuerpo = {"training": self._training()}
        self.cliente.post("/clasificar", json=cuerpo)
        self.cliente.post("/clasificar", json={**cuerpo, "aspecto": 16 / 9})
        por_defecto, referencia = self.s.entradas
        esperado = secuencia_desde_puntos_web(self._training(), aspecto=4 / 3)
        np.testing.assert_allclose(por_defecto[0], esperado, atol=1e-6)
        self.assertGreater(float(np.abs(por_defecto - referencia).max()), 0.01)

    def test_aspecto_invalido(self):
        for aspecto in ("ancho", True, 0, -2, 99, float("nan")):
            r = self.cliente.post("/clasificar", json={"secuencia": _secuencia_b64(), "aspecto": aspecto})
            self.assertEqual(r.status_code, 400, repr(aspecto))
        self.assertEqual(self.s.predicciones, 0)

    def test_un_clip_grande_cabe_en_clasificar_pero_no_en_las_otras_rutas(self):
        """Las grabaciones antiguas de DeafApp pesan 16 a 20 MB por clip; el resto de rutas mantiene el límite pequeño."""
        grande = ["A" * 700_000] * 10                                        # ~7 MB: pasa de los 6 MB generales
        r = self.cliente.post("/clasificar", json={"frames": grande})
        self.assertEqual(r.status_code, 200)                                 # cabe: llega a procesarse
        self.assertEqual(self.cliente.post("/predecir", json={"frame": "A" * 7_000_000}).status_code, 413)
        self.assertEqual(self.cliente.post("/contribuir", json={"label": "hola", "secuencia": "A" * 7_000_000}).status_code, 413)

    def test_pero_tiene_su_tope(self):
        r = self.cliente.post("/clasificar", json={"frames": ["A" * 3_500_000] * 10})                 # ~35 MB
        self.assertEqual(r.status_code, 413)

    def test_entrada_vacia_menciona_las_tres_opciones(self):
        r = self.cliente.post("/clasificar", json={})
        self.assertEqual(r.status_code, 400)
        for opcion in ("frames", "training", "secuencia"):
            self.assertIn(opcion, r.json["error"])

    def test_por_defecto_es_publica_aunque_haya_token(self):
        """Una web estática no puede esconder el token; /clasificar no guarda nada ni tiene estado."""
        self.crear(token="secreto-123")
        self.assertEqual(self.cliente.post("/clasificar", json={"secuencia": _secuencia_b64()}).status_code, 200)

    def test_se_puede_exigir_el_token_tambien_en_clasificar(self):
        self.crear(token="secreto-123", rutas_publicas=())
        self.assertEqual(self.cliente.post("/clasificar", json={"secuencia": _secuencia_b64()}).status_code, 401)
        ok = self.cliente.post("/clasificar", json={"secuencia": _secuencia_b64()}, headers={"X-API-Token": "secreto-123"})
        self.assertEqual(ok.status_code, 200)


class ContribuirTest(BaseApi):
    def raiz(self):
        return Path(self.tmp.name) / "contribuciones"

    def test_guarda_y_sube(self):
        r = self.cliente.post("/contribuir", json={"label": " Hola ", "secuencia": _secuencia_b64()})
        self.assertEqual(r.status_code, 200)
        self.assertEqual((r.json["exito"], r.json["supabase"]), (True, True))
        archivos = list((self.raiz() / "hola").glob("*.npy"))
        self.assertEqual(len(archivos), 1)
        self.assertEqual(np.load(archivos[0]).shape, (SEQUENCE_LENGTH, N_FEATURES))
        self.assertEqual(self.s.subidas, [("hola", archivos[0].name, True)])

    def test_etiquetas_con_recorrido_de_rutas_se_rechazan(self):
        for etiqueta in ("../../fuera", "..", "a/b", "a\\b", "", None, 5):
            r = self.cliente.post("/contribuir", json={"label": etiqueta, "secuencia": _secuencia_b64()})
            self.assertEqual(r.status_code, 400, repr(etiqueta))
        self.assertFalse(self.raiz().exists())
        self.assertEqual(list(Path(self.tmp.name).rglob("*.npy")), [])

    def test_tamano_incorrecto(self):
        r = self.cliente.post("/contribuir", json={"label": "hola", "secuencia": _secuencia_b64(n=100)})
        self.assertEqual(r.status_code, 400)

    def test_base64_invalido_o_gigante(self):
        self.assertEqual(self.cliente.post("/contribuir", json={"label": "hola", "secuencia": "¡¡"}).status_code, 400)
        self.assertEqual(self.cliente.post("/contribuir", json={"label": "hola", "secuencia": "A" * 100_000}).status_code, 400)

    def test_valores_no_finitos_o_fuera_de_rango(self):
        for valor in (float("nan"), float("inf"), 1e9):
            r = self.cliente.post("/contribuir", json={"label": "hola", "secuencia": _secuencia_b64(valor)})
            self.assertEqual(r.status_code, 400, valor)

    def test_si_supabase_falla_se_conserva_la_copia_local(self):
        self.s.fallar_subida = True
        r = self.cliente.post("/contribuir", json={"label": "hola", "secuencia": _secuencia_b64()})
        self.assertEqual(r.status_code, 200)
        self.assertFalse(r.json["supabase"])
        self.assertEqual(len(list((self.raiz() / "hola").glob("*.npy"))), 1)

    def test_sin_supabase_configurado(self):
        self.crear(subir_contribucion=None)
        r = self.cliente.post("/contribuir", json={"label": "hola", "secuencia": _secuencia_b64()})
        self.assertEqual((r.status_code, r.json["supabase"]), (200, False))


class TokenTest(BaseApi):
    def setUp(self):
        super().setUp()
        self.crear(token="secreto-123")

    def test_los_post_exigen_el_token(self):
        cuerpo = {"frame": _b64(b"jpeg")}
        self.assertEqual(self.cliente.post("/predecir", json=cuerpo).status_code, 401)
        self.assertEqual(self.cliente.post("/predecir", json=cuerpo, headers={"X-API-Token": "otro"}).status_code, 401)
        self.assertEqual(self.cliente.post("/predecir", json=cuerpo, headers={"X-API-Token": "secreto-123"}).status_code, 200)
        self.assertEqual(self.cliente.post("/contribuir", json={}).status_code, 401)
        self.assertEqual(self.cliente.post("/limpiar_buffer", json={}).status_code, 401)

    def test_estado_sigue_abierto(self):
        self.assertEqual(self.cliente.get("/estado").status_code, 200)

    def test_clasificar_publica_pero_lo_que_escribe_o_gasta_no(self):
        self.assertEqual(self.cliente.post("/clasificar", json={"secuencia": _secuencia_b64()}).status_code, 200)
        self.assertEqual(self.cliente.post("/contribuir", json={"label": "hola", "secuencia": _secuencia_b64()}).status_code, 401)
        self.assertEqual(self.cliente.post("/predecir", json={"frame": _b64(b"jpeg")}).status_code, 401)

    def test_rutas_publicas_configurables(self):
        self.crear(token="secreto-123", rutas_publicas=("/clasificar", "/limpiar_buffer"))
        self.assertEqual(self.cliente.post("/limpiar_buffer", json={}).status_code, 200)
        self.assertEqual(self.cliente.post("/contribuir", json={}).status_code, 401)


class ServicioNoDisponibleTest(BaseApi):
    def test_sin_mediapipe_predecir_responde_503_y_clasificar_sigue_funcionando(self):
        from api_flask import ServicioNoDisponible

        def sin_mediapipe(_imagen):
            raise ServicioNoDisponible("falta MediaPipe")
        self.crear(procesar_frame=sin_mediapipe)
        r = self.predecir()
        self.assertEqual(r.status_code, 503)
        self.assertIn("falta MediaPipe", r.json["error"])
        self.assertEqual(self.cliente.post("/clasificar", json={"secuencia": _secuencia_b64()}).status_code, 200)
        self.assertEqual(self.cliente.get("/estado").status_code, 200)


class BufferesTest(unittest.TestCase):
    def test_normalizar_device_id(self):
        self.assertEqual(normalizar_device_id("movil-1"), "movil-1")
        self.assertEqual(normalizar_device_id("a.b:c_d"), "a.b:c_d")
        for valor in (None, 5, "", "x" * 65, "a b", "../x", "ñ"):
            self.assertEqual(normalizar_device_id(valor), "default", repr(valor))

    def test_descarta_el_menos_usado(self):
        b = BuferesPorDispositivo(3, maximo=2)
        b.obtener("a").append(1); b.obtener("b").append(1)
        b.obtener("a")                                    # a se usó hace poco
        b.obtener("c")                                    # entra c: sale b
        self.assertEqual(len(b), 2)
        self.assertEqual(len(b.obtener("a")), 1)
        self.assertEqual(len(b.obtener("b")), 0)

    def test_largo_fijo(self):
        d = BuferesPorDispositivo(3).obtener("x")
        for i in range(10):
            d.append(i)
        self.assertEqual(list(d), [7, 8, 9])


if __name__ == "__main__":
    unittest.main()
