import test from "node:test";
import assert from "node:assert/strict";
import { mismaRuta, pantallaDe, rutaDe, tituloDe, tituloAdmin } from "../src/app/appRoutes.js";

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

test('cada pantalla pública tiene un título propio, incluidas categoría, captura y revisión',()=>{
  const screens=['bienvenida','home','aportes','mas','ayuda','feedback','interpretar','privacidad','terminos','consentimiento','permisoCamara','envioListo','pruebaConsentimiento'];
  const titles=screens.map(screen=>tituloDe(screen));assert.equal(new Set(titles).size,titles.length);
  assert.equal(tituloDe('categoria',{category:'Familia'}),'DeafApp — Familia');
  assert.equal(tituloDe('grabar',{word:'agua'}),'DeafApp — Grabar: agua');
  assert.equal(tituloDe('vistaPrevia',{word:'agua'}),'DeafApp — Revisar grabación: agua');
});

test('los títulos administrativos distinguen acceso, secciones y flujos de grabaciones',()=>{
  const sections=['recordings','vocabulary','training','video-review','material','tools'];
  assert.equal(new Set(sections.map(section=>tituloAdmin(section))).size,sections.length);
  assert.match(tituloAdmin('vocabulary'),/Habilitar señas/);
  assert.match(tituloAdmin('recordings',{authenticated:false}),/Acceso al administrador/);
  assert.match(tituloAdmin('recordings',{multiplying:true}),/Grabar y multiplicar/);
  assert.match(tituloAdmin('recordings',{variants:true}),/Variantes de señas/);
  assert.match(tituloAdmin('recordings',{recording:'hola'}),/Revisar grabación: hola/);
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
