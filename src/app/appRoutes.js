// Rutas de la web: "/" informa, "/app" es la app (con todas sus pantallas) y "/admin" es la administración.
const limpiar = ruta => ruta.replace(/\/+$/, "") || "/";

export const rutaDe = pantalla => ({ bienvenida: "/", interpretar: "/interpretar", admin: "/admin", privacidad: "/privacidad", terminos: "/terminos", consentimiento: "/consentimiento" }[pantalla] || "/app");

export function pantallaDe(ruta) {
  const limpia = limpiar(ruta);
  return ({ "/admin": "admin", "/app": "home", "/interpretar": "interpretar", "/privacidad": "privacidad", "/terminos": "terminos", "/consentimiento": "consentimiento" })[limpia] || "bienvenida";
}

export const mismaRuta = (a, b) => limpiar(a) === limpiar(b);

export function nombrePantalla(pantalla,{category,word}={}){
  if(pantalla==='categoria')return category||'Catálogo de señas';
  if(pantalla==='grabar')return word?`Grabar: ${word}`:'Grabar seña';
  if(pantalla==='vistaPrevia')return word?`Revisar grabación: ${word}`:'Revisar grabación';
  return {bienvenida:'Lengua de Señas Chilena',home:'Grabar señas',aportes:'Mis aportes',mas:'Sobre DeafApp',ayuda:'Ayuda para grabar',
    feedback:'Sugerencias y contacto',admin:'Administración',interpretar:'Interpretar en vivo',privacidad:'Privacidad y datos personales',
    terminos:'Términos y condiciones',consentimiento:'Autorización para grabar',permisoCamara:'Permiso de cámara',
    envioListo:'Aporte enviado',pruebaConsentimiento:'Prueba de autorización'}[pantalla]||'Grabar señas';
}
export const tituloDe=(pantalla,context)=>`DeafApp — ${nombrePantalla(pantalla,context)}`;
export function tituloAdmin(section,{authenticated=true,multiplying=false,variants=false,recording}={}){
  if(!authenticated)return 'DeafApp — Acceso al administrador';
  const title=multiplying?'Grabar y multiplicar señas':recording?`Revisar grabación: ${recording}`:variants&&section==='recordings'?'Variantes de señas':
    {recordings:'Grabaciones',vocabulary:'Habilitar señas',training:'Entrenamiento LSCh','video-review':'Revisión de señas',material:'Material de LSCh',tools:'Datos y diagnóstico'}[section]||'Administración';
  return `DeafApp — ${title} · Administración`;
}
