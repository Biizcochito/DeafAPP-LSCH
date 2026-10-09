import test from "node:test";
import assert from "node:assert/strict";
import {
  ErrorTraductor, advertenciaDeUrl, capturarClip, clasificarClip, consultarEstado, normalizarUrlApi,
  resumirResultado, titularDeResultado, TOTAL_FOTOGRAMAS,
} from "../translator.js";

const respuesta = (estado, cuerpo) => ({ ok: estado >= 200 && estado < 300, status: estado, json: async () => { if (cuerpo === undefined) throw new Error("sin cuerpo"); return cuerpo; } });
const fetchQue = (estado, cuerpo) => async () => respuesta(estado, cuerpo);

test("normaliza lo que se escribe a mano", () => {
  assert.deepEqual(normalizarUrlApi("localhost:5000"), { ok: true, url: "http://localhost:5000" });
  assert.deepEqual(normalizarUrlApi("  192.168.1.5:5000/ "), { ok: true, url: "http://192.168.1.5:5000" });
  assert.deepEqual(normalizarUrlApi("algo.trycloudflare.com"), { ok: true, url: "https://algo.trycloudflare.com" });
  assert.deepEqual(normalizarUrlApi("https://algo.trycloudflare.com/estado"), { ok: true, url: "https://algo.trycloudflare.com" });
  assert.deepEqual(normalizarUrlApi("http://miservidor.cl:8080/"), { ok: true, url: "http://miservidor.cl:8080" });
});

test("rechaza direcciones vacías o inválidas", () => {
  for (const mala of ["", "   ", null, undefined, "ftp://x.cl", "http://", "https://exa mple.com"]) {
    const r = normalizarUrlApi(mala);
    assert.equal(r.ok, false, String(mala));
    assert.ok(r.error);
  }
});

test("advierte de http ajeno desde una página https, no de local ni de https", () => {
  assert.match(advertenciaDeUrl("http://miservidor.cl:8080", "https:"), /HTTPS/);
  assert.equal(advertenciaDeUrl("http://localhost:5000", "https:"), null);
  assert.equal(advertenciaDeUrl("http://192.168.1.5:5000", "https:"), null);
  assert.equal(advertenciaDeUrl("https://algo.trycloudflare.com", "https:"), null);
  assert.equal(advertenciaDeUrl("http://miservidor.cl", "http:"), null);
  assert.equal(advertenciaDeUrl("no es una url", "https:"), null);
});

test("captura 30 fotogramas, mide el intervalo y recuerda el tamaño", async () => {
  let reloj = 0, n = 0;
  const vistos = [];
  const clip = await capturarClip({
    tomarFoto: async () => { reloj += 20; return { base64: `f${n++}`, width: 480, height: 640 }; },
    ahora: () => reloj, esperar: async ms => { reloj += ms; }, alFotograma: (i, total) => vistos.push([i, total]),
  });
  assert.equal(clip.frames.length, TOTAL_FOTOGRAMAS);
  assert.equal(clip.frames[0], "f0");
  assert.deepEqual([clip.ancho, clip.alto], [480, 640]);
  assert.equal(clip.intervaloMs, Math.round((30 * 20 + 29 * 100) / 30));      // 20 ms de captura + 100 ms de pausa entre fotogramas
  assert.deepEqual(vistos[0], [1, 30]);
  assert.deepEqual(vistos.at(-1), [30, 30]);
});

test("el intervalo se mantiene entre 30 y 1000 ms", async () => {
  let reloj = 0;
  const rapido = await capturarClip({ tomarFoto: async () => ({ base64: "x" }), cantidad: 4, pausaMs: 0, ahora: () => reloj, esperar: async () => {} });
  assert.equal(rapido.intervaloMs, 30);
  reloj = 0;
  const lento = await capturarClip({ tomarFoto: async () => { reloj += 5000; return { base64: "x" }; }, cantidad: 2, pausaMs: 0, ahora: () => reloj, esperar: async () => {} });
  assert.equal(lento.intervaloMs, 1000);
});

test("si la cámara no entrega imagen, o se cancela, se detiene con un mensaje claro", async () => {
  await assert.rejects(capturarClip({ tomarFoto: async () => ({}), cantidad: 3, pausaMs: 0 }), error => error instanceof ErrorTraductor && error.codigo === "camara");
  let vueltas = 0;
  await assert.rejects(capturarClip({ tomarFoto: async () => ({ base64: "x" }), cantidad: 5, pausaMs: 0, cancelado: () => vueltas++ >= 2, esperar: async () => {} }),
    error => error.codigo === "cancelado");
});

test("clasificarClip manda frames e intervalo y devuelve la respuesta", async () => {
  let pedido;
  const datos = await clasificarClip({
    apiUrl: "http://x", frames: ["a", "b"], intervaloMs: 120,
    fetchImpl: async (url, opciones) => { pedido = { url, opciones }; return respuesta(200, { candidatos: [], manos: 0.5 }); },
  });
  assert.equal(pedido.url, "http://x/clasificar");
  assert.equal(pedido.opciones.method, "POST");
  assert.deepEqual(JSON.parse(pedido.opciones.body), { frames: ["a", "b"], intervalo_ms: 120 });
  assert.equal(datos.manos, 0.5);
});

test("traduce los errores del servidor a mensajes que se pueden mostrar", async () => {
  const intentar = (estado, cuerpo) => clasificarClip({ apiUrl: "http://x", frames: [], intervaloMs: 100, fetchImpl: fetchQue(estado, cuerpo) });
  await assert.rejects(intentar(413, { error: "x" }), e => e.codigo === "grande" && /pesa demasiado/.test(e.message));
  await assert.rejects(intentar(401, {}), e => e.codigo === "acceso");
  await assert.rejects(intentar(503, { error: "falta MediaPipe" }), e => e.codigo === "servicio" && e.message === "falta MediaPipe");
  await assert.rejects(intentar(503, undefined), e => e.codigo === "servicio");
  await assert.rejects(intentar(400, { error: "Clip no válido (Ningún fotograma se pudo leer como imagen.)" }), e => e.codigo === "clip" && /Ningún fotograma/.test(e.message));
  await assert.rejects(intentar(500, undefined), e => e.codigo === "servidor" && /500/.test(e.message));
  await assert.rejects(intentar(200, undefined), e => e.codigo === "respuesta");
});

test("una caída de red o un tiempo agotado dan mensajes distintos", async () => {
  await assert.rejects(clasificarClip({ apiUrl: "http://x", frames: [], intervaloMs: 100, fetchImpl: async () => { throw new TypeError("Failed to fetch"); } }),
    e => e.codigo === "red" && /No se pudo conectar/.test(e.message));
  await assert.rejects(clasificarClip({ apiUrl: "http://x", frames: [], intervaloMs: 100, tiempoMs: 20,
    fetchImpl: (url, { signal }) => new Promise((_, rechazar) => signal.addEventListener("abort", () => rechazar(Object.assign(new Error("abortado"), { name: "AbortError" })))) }),
    e => e.codigo === "tiempo");
});

test("consultarEstado devuelve las clases o explica por qué no", async () => {
  const bueno = await consultarEstado({ apiUrl: "http://x", fetchImpl: fetchQue(200, { estado: "activo", clases: ["arroz", "sal"], version: "1.2" }) });
  assert.deepEqual(bueno, { ok: true, clases: ["arroz", "sal"], version: "1.2" });
  assert.equal((await consultarEstado({ apiUrl: "http://x", fetchImpl: fetchQue(200, { otra: "cosa" }) })).ok, false);
  assert.equal((await consultarEstado({ apiUrl: "http://x", fetchImpl: fetchQue(500, undefined) })).ok, false);
  const caido = await consultarEstado({ apiUrl: "http://x", fetchImpl: async () => { throw new TypeError("x"); } });
  assert.equal(caido.ok, false);
  assert.match(caido.error, /No se pudo conectar/);
});

test("resume la respuesta con porcentajes y la seña principal", () => {
  const r = resumirResultado({ prediccion: null, confianza: 0, manos: 0.77, candidatos: [{ sena: "carne", confianza: 0.724 }, { sena: "cerdo", confianza: 0.04 }, { sena: "arroz", confianza: 0.036 }] }, p => p.toUpperCase());
  assert.equal(r.sinManos, false);
  assert.deepEqual(r.candidatos.map(c => [c.nombre, c.porcentaje, c.principal]), [["CARNE", 72, true], ["CERDO", 4, false], ["ARROZ", 4, false]]);
  assert.equal(r.seguro, false);
  assert.equal(r.manos, 0.77);
});

test("sin manos no hay candidatos y se muestra el aviso del servidor", () => {
  const r = resumirResultado({ candidatos: [], aviso: "No se detectaron manos en el clip.", manos: 0 });
  assert.equal(r.sinManos, true);
  assert.equal(titularDeResultado(r), "No se detectaron manos en el clip.");
  assert.match(resumirResultado({}).aviso, /No se pudo reconocer/);
  assert.deepEqual(resumirResultado(null).candidatos, []);
});

test("ignora candidatos mal formados y acota los porcentajes", () => {
  const r = resumirResultado({ candidatos: [null, { sena: "x" }, { sena: "bien", confianza: 1.7 }, { sena: "otra", confianza: -2 }, { sena: 5, confianza: 0.5 }] });
  assert.deepEqual(r.candidatos.map(c => [c.sena, c.porcentaje]), [["bien", 100], ["otra", 0]]);
});

test("el titular dice «podría ser» salvo que el servidor esté seguro", () => {
  const dudoso = resumirResultado({ candidatos: [{ sena: "arroz", confianza: 0.3 }, { sena: "fideos", confianza: 0.2 }, { sena: "sal", confianza: 0.1 }] });
  assert.equal(titularDeResultado(dudoso), "Podría ser arroz, fideos o sal");
  const seguro = resumirResultado({ prediccion: "pollo", candidatos: [{ sena: "pollo", confianza: 0.9 }] });
  assert.equal(titularDeResultado(seguro), "pollo");
  assert.equal(titularDeResultado(resumirResultado({ candidatos: [{ sena: "uno", confianza: 0.4 }] })), "Podría ser uno");
});

// Contra la API real, si está encendida (LSCH_API_TEST=http://127.0.0.1:5057): una seña por consulta, con un clip de 30 fotogramas.
test("contra la API real", { skip: !process.env.LSCH_API_TEST }, async () => {
  const apiUrl = process.env.LSCH_API_TEST;
  const estado = await consultarEstado({ apiUrl });
  assert.equal(estado.ok, true);
  assert.ok(estado.clases.length > 0);
  const gris = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64").toString("base64");
  const datos = await clasificarClip({ apiUrl, frames: Array(12).fill(gris), intervaloMs: 100 }).catch(e => e);
  assert.ok(datos instanceof ErrorTraductor || typeof datos === "object");
});
