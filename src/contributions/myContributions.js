// Aportes de esta persona, guardados solo en este dispositivo. No identifican a nadie, no se suben
// y no dicen si una grabación fue revisada: únicamente qué señas ha enviado y cuántas veces.
import {canonicalPhraseClassId} from '../training/phraseLabels.js';
const MAX_SEEN = 500;

export const emptyContributions = () => ({ version: 1, items: {}, seen: [] });
export const contributionKey = (category, label) => canonicalPhraseClassId(`${category}/${label}`);

export function sanitizeContributions(raw) {
  if (!raw || raw.version !== 1 || !raw.items || typeof raw.items !== "object" || !Array.isArray(raw.seen)) return emptyContributions();
  const items = {};
  for (const [key, value] of Object.entries(raw.items)) {
    if (/^[a-z_]+\/[^/\\]+$/.test(key) && Number.isInteger(value?.n) && value.n > 0 && Number.isFinite(value.last)) {
      const canonical=canonicalPhraseClassId(key),previous=items[canonical];
      items[canonical] = { n: (previous?.n||0)+value.n, last: Math.max(previous?.last||0,value.last) };
    }
  }
  return { version: 1, items, seen: raw.seen.filter(id => typeof id === "string").slice(-MAX_SEEN) };
}

// El identificador de la grabación hace el registro idempotente: reintentar un envío no cuenta dos veces.
export function addContribution(state, { id, category, label }, now = Date.now()) {
  if (id && state.seen.includes(id)) return state;
  const key = contributionKey(category, label);
  return {
    version: 1,
    items: { ...state.items, [key]: { n: (state.items[key]?.n || 0) + 1, last: now } },
    seen: id ? [...state.seen, id].slice(-MAX_SEEN) : state.seen,
  };
}
