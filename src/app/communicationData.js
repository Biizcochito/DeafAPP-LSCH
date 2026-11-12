export const QUICK_CARDS_KEY = 'deafapp.quick-cards.v1';
export const MAX_MESSAGE_LENGTH = 240;
export const DEFAULT_CARDS = [
  {id:'write', category:'Comunicación', text:'Por favor, escribe tu respuesta.'},
  {id:'deaf', category:'Comunicación', text:'Soy una persona sorda. Podemos comunicarnos por escrito.'},
  {id:'repeat', category:'Comunicación', text:'¿Puedes repetirlo más despacio?'},
  {id:'understand', category:'Comunicación', text:'No entendí. ¿Puedes explicarlo de otra forma?'},
  {id:'help', category:'Ayuda', text:'Necesito ayuda, por favor.'},
  {id:'wait', category:'Ayuda', text:'Dame un momento para responder.'},
  {id:'appointment', category:'Día a día', text:'Hola, tengo una hora agendada.'},
  {id:'price', category:'Día a día', text:'¿Cuánto cuesta?'},
  {id:'location', category:'Día a día', text:'¿Puedes mostrarme dónde queda?'},
  {id:'thanks', category:'Día a día', text:'Muchas gracias por tu ayuda.'},
];
export function cleanMessage(value) {
  return typeof value === 'string' ? value.trim().slice(0, MAX_MESSAGE_LENGTH) : '';
}
export function sanitizeCards(value) {
  const custom = [], ids = new Set(DEFAULT_CARDS.map(card => card.id));
  for (const card of Array.isArray(value?.custom) ? value.custom.slice(0, 50) : []) {
    const text = cleanMessage(card?.text);
    if (!text || typeof card.id !== 'string' || !/^custom-[\w-]{1,80}$/.test(card.id) || ids.has(card.id)) continue;
    ids.add(card.id); custom.push({id:card.id, text, category:'Mis frases'});
  }
  const favorites = [...new Set((Array.isArray(value?.favorites) ? value.favorites : []).filter(id => ids.has(id)))];
  return {custom, favorites};
}
export function loadCards(storage) {
  try { return sanitizeCards(JSON.parse(storage.getItem(QUICK_CARDS_KEY))); }
  catch { return sanitizeCards(null); }
}
export function browserCardStorage() {
  try { return window.localStorage; } catch { return null; }
}
export function saveCards(storage, value) {
  try { storage.setItem(QUICK_CARDS_KEY, JSON.stringify(sanitizeCards(value))); return true; }
  catch { return false; }
}

// Merge only newly confirmed signs; a sustained detection keeps its original ID.
export function appendConversation(rows, incoming) {
  const ids = new Set(rows.map(row => row.id));
  return [...rows, ...incoming.filter(row => {
    if (ids.has(row.id) || !cleanMessage(row.text)) return false;
    ids.add(row.id); return true;
  }).map(row => ({...row, text:cleanMessage(row.text)}))].slice(-60);
}
