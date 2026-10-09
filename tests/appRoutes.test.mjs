import test from "node:test";
import assert from "node:assert/strict";
import { mismaRuta, pantallaDe, rutaDe, tituloDe } from "../appRoutes.js";

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

test("el traductor tiene título propio y vive dentro de /app", () => {
  assert.equal(tituloDe("traductor"), "DeafApp — Probar el traductor");
  assert.equal(rutaDe("traductor"), "/app");
});
