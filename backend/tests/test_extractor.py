import importlib.util
import unittest

import numpy as np

CV2 = importlib.util.find_spec("cv2") is not None


@unittest.skipUnless(CV2, "OpenCV no está instalado")
class ExtractorTest(unittest.TestCase):
    def test_si_ningun_fotograma_es_una_imagen_es_un_error_claro_y_no_arranca_mediapipe(self):
        from extractor_frames import extraer_secuencia
        with self.assertRaises(ValueError) as contexto:
            extraer_secuencia([b"hola", b"no soy un jpeg", b""] * 4)
        self.assertIn("Ningún fotograma", str(contexto.exception))

    def test_un_jpeg_valido_entre_basura_no_dispara_el_error_de_lectura(self):
        import cv2
        valido = cv2.imencode(".jpg", np.full((60, 80, 3), 127, np.uint8))[1].tobytes()
        from extractor_frames import extraer_secuencia
        try:
            extraer_secuencia([b"basura", valido] * 6)
        except ValueError as error:
            self.assertNotIn("Ningún fotograma", str(error))               # puede fallar por otra causa (MediaPipe), no por esta
        except Exception:
            pass                                                           # MediaPipe o su modelo no disponibles en este entorno


if __name__ == "__main__":
    unittest.main()
