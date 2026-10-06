export const ADMIN_PAGE_SIZE = 25;
export const MODERATION_LABELS = { pending: "Pendiente", approved: "Aprobada", rejected: "Rechazada" };

export class AdminError extends Error {
  constructor(message, code) { super(message); this.name = "AdminError"; this.code = code; }
}

export function validAdminSession(session, now = Date.now()) {
  return !!session && typeof session.token === "string" && /^[a-f0-9]{64}$/.test(session.token) &&
    Number.isFinite(session.expiresAt) && session.expiresAt > now;
}

export function createAdminClient(client) {
  async function call(name, args) {
    let result;
    try { result = await client.rpc(name, args); }
    catch { throw new AdminError("No se pudo conectar. Inténtalo nuevamente.", "connection"); }
    if (result.error) {
      const code = result.error.code;
      if (code === "PGRST202" || code === "42883") throw new AdminError("El panel todavía no está activado en Supabase.", "not_configured");
      if (code === "28000") throw new AdminError("La sesión terminó. Vuelve a ingresar.", "session_expired");
      if (code === "40001") throw new AdminError("Otra revisión cambió esta grabación. Actualiza la lista y revísala nuevamente.", "conflict");
      throw new AdminError("No se pudo completar la operación. Actualiza e inténtalo nuevamente.", "server");
    }
    if (result.data?.ok !== true) {
      const code = result.data?.code || "server";
      const messages = { invalid_password: "Contraseña incorrecta.", rate_limited: "Demasiados intentos. Espera dos minutos e inténtalo nuevamente.", not_configured: "Falta configurar la contraseña del administrador." };
      throw new AdminError(messages[code] || "No se pudo completar la operación.", code);
    }
    return result.data;
  }
  function token(session) {
    if (!validAdminSession(session)) throw new AdminError("La sesión terminó. Vuelve a ingresar.", "session_expired");
    return session.token;
  }
  return {
    async login(password) {
      if (typeof password !== "string" || !password || password.length > 72) throw new AdminError("Escribe la contraseña.", "invalid_password");
      const data = await call("deafapp_admin_login", { p_password: password });
      const session = { token: data.token, expiresAt: Date.parse(data.expiresAt) };
      if (!validAdminSession(session)) throw new AdminError("No se pudo abrir una sesión válida.", "server");
      return session;
    },
    list(session, { status = "pending", query = "", page = 0 } = {}) {
      if (!["all", ...Object.keys(MODERATION_LABELS)].includes(status) || !Number.isInteger(page) || page < 0) throw new AdminError("Filtro no válido.", "invalid_input");
      return call("deafapp_admin_list", { p_token: token(session), p_status: status, p_query: String(query).slice(0, 120), p_offset: page * ADMIN_PAGE_SIZE, p_limit: ADMIN_PAGE_SIZE });
    },
    review(session, rows, status) {
      if (!Object.hasOwn(MODERATION_LABELS, status) || !Array.isArray(rows) || rows.length < 1 || rows.length > 50 ||
        rows.some(row => !/^\d+$/.test(String(row.id)) || !Number.isInteger(row.version) || row.version < 0) || new Set(rows.map(r => String(r.id))).size !== rows.length) {
        throw new AdminError("Selecciona grabaciones válidas.", "invalid_input");
      }
      return call("deafapp_admin_review", { p_token: token(session), p_items: rows.map(row => ({ id: String(row.id), version: row.version })), p_status: status });
    },
    overview(session) { return call("deafapp_admin_overview", { p_token: token(session) }); },
    material(session) { return call("deafapp_admin_material", { p_token: token(session) }); },
    async logout(session) {
      if (validAdminSession(session)) await call("deafapp_admin_logout", { p_token: session.token });
    },
  };
}

export function frameDataUri(frame) {
  if (typeof frame !== "string" || frame.length > 4_000_000) return null;
  if (/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=\r\n]+$/.test(frame)) return frame;
  if (/^[A-Za-z0-9+/=\r\n]+$/.test(frame)) {
    if (frame.startsWith("/9j/")) return `data:image/jpeg;base64,${frame}`;
    if (frame.startsWith("iVBORw0KGgo")) return `data:image/png;base64,${frame}`;
    if (frame.startsWith("UklGR")) return `data:image/webp;base64,${frame}`;
  }
  return null;
}

export function recordingPreview(payload) {
  if (!payload || !Array.isArray(payload.frames) || payload.frames.length < 1 || payload.frames.length > 200) throw new Error("El archivo no contiene una secuencia de imágenes válida.");
  const frames = payload.frames.map(frameDataUri);
  if (frames.some(frame => frame == null)) throw new Error("El formato de esta grabación requiere revisión antes de reproducirlo.");
  const intervalMs = Number.isFinite(payload.intervalMs) ? Math.min(1000, Math.max(30, payload.intervalMs)) : 113;
  return { frames, intervalMs, aspectRatio: Number.isFinite(payload.frameAspectRatio) && payload.frameAspectRatio > 0 ? payload.frameAspectRatio : 4 / 3 };
}
