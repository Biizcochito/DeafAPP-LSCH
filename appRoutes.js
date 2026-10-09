// Rutas de la web: "/" informa, "/app" es la app (con todas sus pantallas) y "/admin" es la administración.
const limpiar = ruta => ruta.replace(/\/+$/, "") || "/";

export const rutaDe = pantalla => (pantalla === "bienvenida" ? "/" : pantalla === "admin" ? "/admin" : "/app");

export function pantallaDe(ruta) {
  const limpia = limpiar(ruta);
  return limpia === "/admin" ? "admin" : limpia === "/app" ? "home" : "bienvenida";
}

export const mismaRuta = (a, b) => limpiar(a) === limpiar(b);

export const tituloDe = pantalla => ({
  bienvenida: "DeafApp — Lengua de Señas Chilena",
  admin: "DeafApp — Administración",
  traductor: "DeafApp — Probar el traductor",
}[pantalla] || "DeafApp — Grabar señas");
