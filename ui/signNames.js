// El catálogo guarda algunas señas sin ñ en su identificador; esta es la forma que se muestra.
export const displayWord = value => ({ bano: "baño", nuble: "Ñuble", manana: "mañana" }[value] || value);
