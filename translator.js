// Traductor de señas: lógica que comparten la pantalla web y la nativa. Sin React ni Expo, para poder probarla con node.
//
// El celular (y la web) captura un clip de 30 fotogramas, igual que la grabación, y lo manda a la API de LSCh
// (POST /clasificar con {frames, intervalo_ms}). La API calcula los puntos con el mismo MediaPipe con que se armó el
// dataset y responde con las 3 señas más probables.

export const TOTAL_FOTOGRAMAS = 30;
export const PAUSA_ENTRE_FOTOGRAMAS_MS = 100;       // la misma cadencia que la grabación
export const CUENTA_ATRAS = 3;
export const API_POR_DEFECTO = (typeof process !== "undefined" && process.env && process.env.EXPO_PUBLIC_LSCH_API) || "http://localhost:5000";

export class ErrorTraductor extends Error {
  constructor(codigo, mensaje) {
    super(mensaje);
    this.name = "ErrorTraductor";
    this.codigo = codigo;
  }
}

const esLocal = host => host === "localhost" || host === "127.0.0.1" || host === "[::1]" || /^(10|127)\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);

// Acepta lo que alguien escribe a mano ("localhost:5000", "192.168.1.5:5000", "algo.trycloudflare.com/estado") y devuelve el origen.
export function normalizarUrlApi(texto) {
  const crudo = String(texto ?? "").trim();
  if (!crudo) return { ok: false, error: "Escribe la dirección del servidor." };
  const conEsquema = /^[a-z][a-z0-9+.-]*:\/\//i.test(crudo) ? crudo : `${/^(localhost|127\.|\[::1\]|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(crudo) ? "http" : "https"}://${crudo}`;
  let url;
  try { url = new URL(conEsquema); } catch { return { ok: false, error: "Esa dirección no es válida." }; }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, error: "La dirección debe empezar con http:// o https://." };
  if (!url.hostname) return { ok: false, error: "Esa dirección no es válida." };
  return { ok: true, url: url.origin };
}

// Una página HTTPS no puede llamar a una API HTTP que no sea de este equipo o de la red local: el navegador la bloquea.
export function advertenciaDeUrl(url, protocoloPagina) {
  if (protocoloPagina !== "https:") return null;
  let u;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol === "http:" && !esLocal(u.hostname)) return "La web usa HTTPS y el navegador bloquea las llamadas a una dirección http:// ajena. Usa la dirección https:// del túnel.";
  return null;
}

const dormir = ms => new Promise(resolve => setTimeout(resolve, ms));

// Captura `cantidad` fotogramas con `tomarFoto()` (que devuelve {base64, width, height}) y mide el intervalo real.
export async function capturarClip({ tomarFoto, cantidad = TOTAL_FOTOGRAMAS, pausaMs = PAUSA_ENTRE_FOTOGRAMAS_MS, alFotograma, cancelado = () => false, ahora = () => Date.now(), esperar = dormir }) {
  const inicio = ahora();
  const frames = [];
  let ancho, alto;
  for (let i = 0; i < cantidad; i += 1) {
    if (cancelado()) throw new ErrorTraductor("cancelado", "Captura cancelada.");
    const foto = await tomarFoto();
    if (!foto || !foto.base64) throw new ErrorTraductor("camara", "La cámara no entregó la imagen. Revisa que no esté tapada o en uso por otra aplicación.");
    frames.push(foto.base64);
    if (foto.width > 0 && foto.height > 0) { ancho = foto.width; alto = foto.height; }
    if (alFotograma) alFotograma(i + 1, cantidad);
    if (i < cantidad - 1 && pausaMs > 0) await esperar(pausaMs);
  }
  const intervaloMs = Math.max(30, Math.min(1000, Math.round((ahora() - inicio) / frames.length)));
  return { frames, intervaloMs, ancho, alto };
}

function conTiempoLimite(fetchImpl, url, opciones, tiempoMs) {
  const controlador = typeof AbortController !== "undefined" ? new AbortController() : null;
  const temporizador = setTimeout(() => controlador && controlador.abort(), tiempoMs);
  return fetchImpl(url, controlador ? { ...opciones, signal: controlador.signal } : opciones).finally(() => clearTimeout(temporizador));
}

function errorDeRed(error) {
  if (error && error.name === "AbortError") return new ErrorTraductor("tiempo", "El servidor tardó demasiado en responder. Intenta de nuevo.");
  return new ErrorTraductor("red", "No se pudo conectar con el servidor. Revisa que la API esté encendida y que la dirección sea correcta.");
}

async function leerJson(respuesta) {
  try { return await respuesta.json(); } catch { return null; }
}

// Manda el clip y devuelve la respuesta cruda de la API. Lanza ErrorTraductor con un mensaje que se puede mostrar tal cual.
export async function clasificarClip({ apiUrl, frames, intervaloMs, fetchImpl = fetch, tiempoMs = 90000 }) {
  let respuesta;
  try {
    respuesta = await conTiempoLimite(fetchImpl, `${apiUrl}/clasificar`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frames, intervalo_ms: intervaloMs }),
    }, tiempoMs);
  } catch (error) {
    throw errorDeRed(error);
  }
  const datos = await leerJson(respuesta);
  if (!respuesta.ok) {
    const detalle = datos && typeof datos.error === "string" ? datos.error : "";
    if (respuesta.status === 413) throw new ErrorTraductor("grande", "El clip pesa demasiado para el servidor. Intenta de nuevo con mejor luz y sin movimientos bruscos.");
    if (respuesta.status === 401 || respuesta.status === 403) throw new ErrorTraductor("acceso", "El servidor rechazó la consulta.");
    if (respuesta.status === 503) throw new ErrorTraductor("servicio", detalle || "El servidor todavía no puede procesar fotogramas.");
    if (respuesta.status === 400) throw new ErrorTraductor("clip", detalle ? `El servidor no pudo usar el clip: ${detalle}` : "El servidor no pudo usar el clip.");
    throw new ErrorTraductor("servidor", `El servidor respondió con un error (${respuesta.status}).`);
  }
  if (!datos || typeof datos !== "object") throw new ErrorTraductor("respuesta", "El servidor respondió algo que no se entiende.");
  return datos;
}

// Consulta GET /estado: ¿está la API encendida y qué palabras conoce?
export async function consultarEstado({ apiUrl, fetchImpl = fetch, tiempoMs = 8000 }) {
  try {
    const respuesta = await conTiempoLimite(fetchImpl, `${apiUrl}/estado`, { method: "GET" }, tiempoMs);
    const datos = await leerJson(respuesta);
    if (!respuesta.ok || !datos || datos.estado !== "activo") return { ok: false, error: "El servidor respondió, pero no parece la API de LSCh." };
    return { ok: true, clases: Array.isArray(datos.clases) ? datos.clases.map(String) : [], version: datos.version };
  } catch (error) {
    return { ok: false, error: errorDeRed(error).message };
  }
}

// Convierte la respuesta de /clasificar en lo que muestra la pantalla.
export function resumirResultado(datos, nombrar = palabra => palabra) {
  const candidatos = Array.isArray(datos && datos.candidatos) ? datos.candidatos : [];
  const lista = candidatos
    .filter(c => c && typeof c.sena === "string" && Number.isFinite(c.confianza))
    .map((c, i) => ({ sena: c.sena, nombre: nombrar(c.sena), porcentaje: Math.max(0, Math.min(100, Math.round(c.confianza * 100))), principal: i === 0 }));
  const sinManos = lista.length === 0;
  return {
    sinManos,
    aviso: typeof (datos && datos.aviso) === "string" ? datos.aviso : sinManos ? "No se pudo reconocer la seña. Vuelve a intentar." : "",
    candidatos: lista,
    seguro: Boolean(datos && datos.prediccion),
    prediccion: datos && typeof datos.prediccion === "string" ? datos.prediccion : null,
    manos: Number.isFinite(datos && datos.manos) ? datos.manos : null,
  };
}

// Frase para mostrar arriba del resultado: con tres opciones y poca confianza se dice «creo que».
export function titularDeResultado(resumen) {
  if (resumen.sinManos) return resumen.aviso;
  const primero = resumen.candidatos[0];
  if (resumen.seguro) return primero.nombre;
  const otros = resumen.candidatos.slice(1, 3).map(c => c.nombre);
  return otros.length ? `Podría ser ${primero.nombre}, ${otros.join(" o ")}` : `Podría ser ${primero.nombre}`;
}
