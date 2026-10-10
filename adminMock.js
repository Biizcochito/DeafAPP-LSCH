// Backend de administración SIMULADO, solo para probar la interfaz en local. No usa Supabase.
// Se activa únicamente con EXPO_PUBLIC_ADMIN_MOCK=1 en localhost (ver App.js y scripts/web-mock-admin.cjs).
// Contraseña de prueba: no es la del panel real.
export const MOCK_ADMIN_PASSWORD = "deafapp-prueba-local";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const SAMPLE = [
  ["saludos", "hola"], ["saludos", "adios"], ["saludos", "buenos dias"], ["alimentos", "cerdo"], ["alimentos", "pollo"],
  ["alimentos", "arroz"], ["tiempo", "dia"], ["tiempo", "noche"], ["familia", "mama"], ["familia", "papa"],
];

function seedRecordings() {
  const states = ["pending", "pending", "approved", "rejected"];
  return Array.from({ length: 58 }, (_, i) => {
    const [category, label] = SAMPLE[i % SAMPLE.length];
    const id = String(1000 - i);
    return { id, label, category, path: `mock/${id}.json`, status: states[i % states.length], version: 0, createdAt: new Date(Date.now() - i * 3_600_000).toISOString() };
  });
}

const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
const reply = data => Promise.resolve({ data, error: null });
const fail = code => Promise.resolve({ data: null, error: { code, message: code } });

export function createMockAdminBackend() {
  const rows = seedRecordings();
  const sessions = new Map();
  let failures = [];
  let lockedUntil = 0;

  function auth(token) {
    const expiresAt = sessions.get(token);
    return expiresAt && expiresAt > Date.now();
  }

  const handlers = {
    deafapp_admin_login({ p_password }) {
      const now = Date.now();
      if (lockedUntil > now) return reply({ ok: false, code: "rate_limited" });
      if (p_password !== MOCK_ADMIN_PASSWORD) {
        failures = [...failures.filter(t => now - t < 600_000), now];
        if (failures.length >= 5) { lockedUntil = now + 120_000; failures = []; }
        return reply({ ok: false, code: "invalid_password" });
      }
      const token = hex(crypto.getRandomValues(new Uint8Array(32)));
      const expiresAt = now + 2 * 3_600_000;
      sessions.set(token, expiresAt);
      return reply({ ok: true, token, expiresAt: new Date(expiresAt).toISOString() });
    },
    deafapp_admin_list({ p_token, p_status, p_query, p_offset, p_limit }) {
      if (!auth(p_token)) return fail("28000");
      const q = (p_query || "").toLowerCase();
      const match = rows.filter(r => (p_status === "all" || r.status === p_status) && (!q || `${r.label} ${r.category}`.toLowerCase().includes(q)));
      const count = status => rows.filter(r => r.status === status).length;
      return reply({ ok: true, rows: match.slice(p_offset, p_offset + p_limit), counts: { pending: count("pending"), approved: count("approved"), rejected: count("rejected") }, total: match.length });
    },
    deafapp_admin_review({ p_token, p_items, p_status }) {
      if (!auth(p_token)) return fail("28000");
      const targets = p_items.map(item => rows.find(r => r.id === item.id && r.version === item.version));
      if (targets.some(r => !r)) return fail("40001");
      targets.forEach(r => { r.status = p_status; r.version++; });
      return reply({ ok: true, changed: targets.length, status: p_status });
    },
    deafapp_admin_overview({ p_token }) {
      if (!auth(p_token)) return fail("28000");
      return reply({ ok: true, preparation: require("./admin/dataset-snapshot.json"), checkedAt: new Date().toISOString() });
    },
    deafapp_admin_material({ p_token }) {
      if (!auth(p_token)) return fail("28000");
      return reply({ ok: true, catalog: require("./admin/catalog-snapshot.json") });
    },
    deafapp_admin_logout({ p_token }) {
      sessions.delete(p_token);
      return reply({ ok: true });
    },
  };

  return {
    rpc(name, args) { return handlers[name] ? handlers[name](args) : fail("PGRST202"); },
    storage: {
      from: () => ({
        async download(path) {
          const row = rows.find(r => r.path === path);
          if (!row) return { data: null, error: { message: "not found" } };
          const payload = JSON.stringify({ label: row.label, intervalMs: 100, frameAspectRatio: 4 / 3, frames: Array.from({ length: 30 }, () => PNG) });
          return { data: { size: payload.length, text: async () => payload }, error: null };
        },
      }),
    },
  };
}
