import test from "node:test";
import assert from "node:assert/strict";
import { mismaRuta, pantallaDe, rutaDe, tituloDe } from "../src/app/appRoutes.js";

test("la raíz informa, /app abre la app y /admin la administración", () => {
  assert.equal(pantallaDe("/"), "bienvenida");
  assert.equal(pantallaDe("/app"), "home");
  assert.equal(pantallaDe("/app/"), "home");
  assert.equal(pantallaDe("/admin"), "admin");
  assert.equal(pantallaDe("/admin/"), "admin");
});

test("una ruta desconocida muestra la información en lugar de una pantalla vacía", () => {
  assert.equal(pantallaDe("/otra-cosa"), "bienvenida");
  assert.equal(pantallaDe("/app/extra"), "bienvenida");
  assert.equal(pantallaDe("/app/interpretacion"), "bienvenida");
  assert.equal(pantallaDe("/app/traductor"), "bienvenida");
});

test("todas las pantallas de la app comparten la ruta /app", () => {
  for (const pantalla of ["home", "categoria", "aportes", "mas", "ayuda", "feedback", "grabar", "vistaPrevia", "envioListo"]) {
    assert.equal(rutaDe(pantalla), "/app");
  }
  assert.equal(rutaDe("bienvenida"), "/");
  assert.equal(rutaDe("admin"), "/admin");
});

test("la barra final no cambia de ruta y cada sección tiene su título", () => {
  assert.ok(mismaRuta("/app/", "/app"));
  assert.ok(mismaRuta("/", ""));
  assert.ok(!mismaRuta("/app", "/"));
  assert.match(tituloDe("home"), /Grabar señas/);
  assert.match(tituloDe("bienvenida"), /Lengua de Señas Chilena/);
  assert.match(tituloDe("admin"), /Administración/);
});

test("los avisos y la autorización tienen enlaces directos y conservan Atrás/Adelante", () => {
  for (const pantalla of ["privacidad", "terminos", "consentimiento"]) {
    assert.equal(rutaDe(pantalla), `/${pantalla}`);
    assert.equal(pantallaDe(`/${pantalla}`), pantalla);
    assert.equal(pantallaDe(`/${pantalla}/`), pantalla);
    assert.ok(tituloDe(pantalla).startsWith("DeafApp —"));
  }
});

test("la interpretación tiene enlace directo y título propios, también al recargar",()=>{
  assert.equal(rutaDe('interpretar'),'/interpretar');
  assert.equal(pantallaDe('/interpretar/'),'interpretar');
  assert.match(tituloDe('interpretar'),/Interpretar en vivo/);
});
