// Rutas de la web: "/" informa, "/app" es la app (con todas sus pantallas) y "/admin" es la administración.
const limpiar = ruta => ruta.replace(/\/+$/, "") || "/";

export const rutaDe = pantalla => ({ bienvenida: "/", admin: "/admin", privacidad: "/privacidad", terminos: "/terminos", consentimiento: "/consentimiento" }[pantalla] || "/app");

export function pantallaDe(ruta) {
  const limpia = limpiar(ruta);
  return ({ "/admin": "admin", "/app": "home", "/privacidad": "privacidad", "/terminos": "terminos", "/consentimiento": "consentimiento" })[limpia] || "bienvenida";
}

export const mismaRuta = (a, b) => limpiar(a) === limpiar(b);

export const tituloDe = pantalla => ({
  bienvenida: "DeafApp — Lengua de Señas Chilena",
  admin: "DeafApp — Administración",
  privacidad: "DeafApp — Privacidad y datos personales",
  terminos: "DeafApp — Términos y condiciones",
  consentimiento: "DeafApp — Tu autorización",
}[pantalla] || "DeafApp — Grabar señas");
