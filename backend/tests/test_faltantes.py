import contextlib
import csv
import io
import json
import tempfile
import unittest
from collections import Counter
from pathlib import Path

import numpy as np

import palabras_faltantes as pf
from tests.ayudas import secuencia_natural
from tests.test_importar import SesionFalsa, _fila

CATALOGO = {
    "saludos": {"nombre": "Saludos", "palabras": ["hola", "gracias", "buenos dias"]},
    "familia": {"nombre": "Familia", "palabras": ["mama", "niño", "hola"]},      # «hola» repetida a propósito
}


class CalcularTest(unittest.TestCase):
    def test_deficit_y_resumen(self):
        r = pf.calcular_faltantes(CATALOGO, Counter({"hola": 12, "gracias": 3, "mama": 1}), objetivo=10)
        por_palabra = {(f["categoria"], f["palabra"]): f for f in r["filas"]}
        self.assertEqual(por_palabra[("saludos", "hola")]["faltan"], 0)
        self.assertEqual(por_palabra[("saludos", "gracias")]["faltan"], 7)
        self.assertEqual(por_palabra[("saludos", "buenos dias")]["grabaciones"], 0)
        self.assertEqual(por_palabra[("familia", "hola")]["grabaciones"], 12)        # comparte el conteo
        res = r["resumen"]
        self.assertEqual(res["palabras"], 5)                                        # «hola» se cuenta una vez
        self.assertEqual((res["completas"], res["con_algo"], res["sin_nada"]), (1, 2, 2))
        self.assertEqual(res["grabaciones_que_faltan"], 0 + 7 + 10 + 9 + 10)

    def test_por_categoria(self):
        r = pf.calcular_faltantes(CATALOGO, Counter({"hola": 12, "gracias": 3}), objetivo=10)
        s = r["por_categoria"]["saludos"]
        self.assertEqual((s["palabras"], s["completas"], s["con_algo"], s["sin_nada"], s["faltan"]), (3, 1, 1, 1, 17))

    def test_normaliza_tildes_y_mayusculas_y_detecta_lo_que_no_esta_en_el_catalogo(self):
        r = pf.calcular_faltantes(CATALOGO, Counter({"niño": 4, "extra": 2}), objetivo=10)
        self.assertEqual(next(f for f in r["filas"] if f["palabra"] == "niño")["grabaciones"], 4)
        self.assertEqual(r["fuera_del_catalogo"], {"extra": 2})

    def test_contar_aprobadas_normaliza_y_ignora_etiquetas_invalidas(self):
        filas = [{"label": "Hola"}, {"label": " hola "}, {"label": "../x"}, {"label": None}, {"label": "Niño"}]
        self.assertEqual(pf.contar_aprobadas(filas), Counter({"hola": 2, "niño": 1}))


class PlanTest(unittest.TestCase):
    def test_personas_necesarias_las_marca_la_palabra_con_mas_deficit(self):
        r = pf.calcular_faltantes(CATALOGO, Counter({"hola": 12, "gracias": 3}), objetivo=10)
        plan = pf.plan_de_grabacion(r, ["saludos"])
        self.assertEqual(plan["palabras"], ["buenos dias", "gracias"])          # «hola» ya está completa
        self.assertEqual(plan["personas_necesarias"], 10)                       # buenos dias no tiene ninguna
        self.assertEqual(plan["palabras_por_persona"], 2)
        self.assertEqual(plan["grabaciones_en_total"], 17)

    def test_varias_categorias_y_palabra_repetida(self):
        r = pf.calcular_faltantes(CATALOGO, Counter({"mama": 6}), objetivo=10)
        plan = pf.plan_de_grabacion(r, ["saludos", "familia"])
        self.assertEqual(plan["palabras"].count("hola"), 1)                     # aparece en las dos categorías
        self.assertEqual(plan["grabaciones_en_total"], 10 * 4 + 4)              # hola, gracias, buenos dias, niño = 10; mama = 4

    def test_todo_completo(self):
        r = pf.calcular_faltantes(CATALOGO, Counter({"hola": 10, "gracias": 10, "buenos dias": 10}), objetivo=10)
        plan = pf.plan_de_grabacion(r, ["saludos"])
        self.assertEqual((plan["personas_necesarias"], plan["palabras"], plan["grabaciones_en_total"]), (0, [], 0))

    def test_categoria_inexistente(self):
        r = pf.calcular_faltantes(CATALOGO, Counter(), objetivo=10)
        with self.assertRaises(ValueError):
            pf.plan_de_grabacion(r, ["inventada"])


class CsvYCatalogoTest(unittest.TestCase):
    def test_csv_ordenado_por_deficit_y_con_bom(self):
        r = pf.calcular_faltantes(CATALOGO, Counter({"hola": 12, "gracias": 3}), objetivo=10)
        with tempfile.TemporaryDirectory() as tmp:
            ruta = Path(tmp) / "faltan.csv"
            pf.escribir_csv(r["filas"], ruta)
            self.assertEqual(ruta.read_bytes()[:3], b"\xef\xbb\xbf")
            with open(ruta, encoding="utf-8-sig") as f:
                filas = list(csv.DictReader(f))
        self.assertEqual(filas[0]["faltan"], "10")
        self.assertEqual(filas[-1]["faltan"], "0")
        self.assertEqual(len(filas), 6)

    def test_catalogo_incluido_es_valido(self):
        catalogo = pf.cargar_catalogo()
        self.assertEqual(len(catalogo), 28)
        self.assertEqual(sum(len(c["palabras"]) for c in catalogo.values()), 531)
        self.assertIn("arroz", catalogo["alimentos"]["palabras"])

    def test_catalogo_mal_formado(self):
        with tempfile.TemporaryDirectory() as tmp:
            ruta = Path(tmp) / "c.json"
            ruta.write_text(json.dumps({"categorias": {}}), encoding="utf-8")
            with self.assertRaises(ValueError):
                pf.cargar_catalogo(ruta)


class LocalesYMainTest(unittest.TestCase):
    def test_contar_locales_cuenta_originales_independientes(self):
        with tempfile.TemporaryDirectory() as tmp:
            raiz = Path(tmp)
            (raiz / "hola").mkdir()
            base = secuencia_natural(1)
            np.save(raiz / "hola" / "seq_0000.npy", base)
            np.save(raiz / "hola" / "seq_0001.npy", base + 0.0005)          # repetición casi idéntica: cuenta una
            np.save(raiz / "hola" / "seq_0002.npy", secuencia_natural(2))
            self.assertEqual(pf.contar_locales(raiz), Counter({"hola": 2}))

    def test_main_con_sesion_falsa_y_csv(self):
        sesion = SesionFalsa([_fila(i, "hola") for i in range(1, 4)] + [_fila(9, "mama"), _fila(10, "zzz")], {})
        with tempfile.TemporaryDirectory() as tmp:
            catalogo = Path(tmp) / "cat.json"
            catalogo.write_text(json.dumps({"categorias": CATALOGO}), encoding="utf-8")
            salida = io.StringIO()
            with contextlib.redirect_stdout(salida):
                codigo = pf.main(["--catalogo", str(catalogo), "--objetivo", "5", "--csv", str(Path(tmp) / "x.csv")], sesion)
            texto = salida.getvalue()
            self.assertTrue((Path(tmp) / "x.csv").exists())
        self.assertEqual(codigo, 0)
        self.assertIn("Objetivo: 5", texto)
        self.assertIn("zzz (1)", texto)                                            # fuera del catálogo
        self.assertIn("hola", texto)

    def test_main_imprime_el_plan(self):
        sesion = SesionFalsa([_fila(1, "hola")], {})
        salida = io.StringIO()
        with tempfile.TemporaryDirectory() as tmp, contextlib.redirect_stdout(salida):
            catalogo = Path(tmp) / "cat.json"
            catalogo.write_text(json.dumps({"categorias": CATALOGO}), encoding="utf-8")
            pf.main(["--catalogo", str(catalogo), "--objetivo", "5", "--plan", "saludos"], sesion)
        texto = salida.getvalue()
        self.assertIn("Plan para saludos", texto)
        self.assertIn("5 personas distintas", texto)                              # buenos dias y gracias no tienen ninguna
        self.assertIn("buenos dias", texto)

    def test_main_categoria_inexistente(self):
        sesion = SesionFalsa([], {})
        salida = io.StringIO()
        with tempfile.TemporaryDirectory() as tmp, contextlib.redirect_stdout(salida):
            catalogo = Path(tmp) / "cat.json"
            catalogo.write_text(json.dumps({"categorias": CATALOGO}), encoding="utf-8")
            pf.main(["--catalogo", str(catalogo), "--categoria", "inventada"], sesion)
        self.assertIn("No existe la categoría", salida.getvalue())


if __name__ == "__main__":
    unittest.main()
