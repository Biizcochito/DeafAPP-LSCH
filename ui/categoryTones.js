// Colores de categoría de la marca: todos admiten texto de tinta oscura. Se reparten por posición
// para que dos categorías contiguas nunca compartan color (los del catálogo se repetían).
export const TONES = ["#ff8e72", "#78e0ff", "#a99bff", "#4ee0b5", "#ffd166", "#ff9ec4", "#ffa45c"];

export const toneFor = (categories, category) => TONES[Math.max(0, categories.findIndex(item => item.id === category?.id)) % TONES.length];
