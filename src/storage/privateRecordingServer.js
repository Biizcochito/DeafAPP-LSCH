import { isRecordingPath } from './recordingPath.js';
const origins = new Set(['https://deafapps.com', 'https://www.deafapps.com', 'https://deafapp-lsch.deafapp-lsch.workers.dev']);
const localOrigin = value => /^http:\/\/(localhost|127\.0\.0\.1):\d{4,5}$/.test(value);
export async function digestBytes(bytes) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), value => value.toString(16).padStart(2, '0')).join('');
}
export async function readLimitedBytes(response, maximum) {
  if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 40_000_000) throw Error('Invalid size');
  const declared = response.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maximum)) throw Error('Oversized response');
  const reader = response.body?.getReader(); if (!reader) throw Error('Missing body');
  const chunks = []; let length = 0;
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      length += part.value.length;
      if (length > maximum) { await reader.cancel(); throw Error('Oversized response'); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

export async function readStoredRecording({ db, location, config, signedFetch }) {
  if (location?.ok !== true || !isRecordingPath(location.path)) throw Error('Invalid location');
  if (location.provider === 'supabase') {
    const { data, error } = await db.storage.from('contribuciones').download(location.path);
    if (error || !data || data.size > 40_000_000) throw Error('Source unavailable');
    return new Uint8Array(await data.arrayBuffer());
  }
  if (location.provider !== 'r2' || location.bucket !== 'deafapp-grabaciones-privadas' || location.bucket !== config.bucket ||
      location.key !== `contribuciones/${location.path}` || !/^[a-f0-9]{64}$/.test(location.sha256 || '') ||
      !/^[a-f0-9]{32}$/.test(config.accountId || '') || !Number.isSafeInteger(location.bytes) || location.bytes <= 0 || location.bytes > 40_000_000) throw Error('Invalid R2 location');
  const segments = [location.bucket, ...location.key.split('/')].map(encodeURIComponent).join('/');
  const response = await signedFetch(`https://${config.accountId}.r2.cloudflarestorage.com/${segments}`, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw Error('R2 unavailable');
  const bytes = await readLimitedBytes(response, location.bytes);
  if (bytes.length !== location.bytes || await digestBytes(bytes) !== location.sha256) throw Error('R2 integrity mismatch');
  return bytes;
}

export function createPrivateRecordingHandler({ locate, download, markVerified, isServiceRequest }) {
  return async request => {
    const origin = request.headers.get('origin') || '';
    const headers = { 'Cache-Control': 'no-store', Vary: 'Origin', 'X-Content-Type-Options': 'nosniff',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-deafapp-admin-token' };
    if (origins.has(origin) || localOrigin(origin)) headers['Access-Control-Allow-Origin'] = origin;
    const reply = (message, status) => Response.json({ error: message }, { status, headers });
    if (origin && !headers['Access-Control-Allow-Origin']) return reply('Origen no permitido.', 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return reply('Método no permitido.', 405);
    const service = await isServiceRequest(request);
    const token = request.headers.get('x-deafapp-admin-token') || '';
    if (!service && !/^[a-f0-9]{64}$/.test(token)) return reply('Se requiere una sesión de administración.', 401);
    let body;
    try {
      body = JSON.parse(new TextDecoder().decode(await readLimitedBytes(request, 2048)));
      if (!body || Object.keys(body).some(key => !['action', 'path'].includes(key)) ||
          !['read', 'read-copy'].includes(body.action) || !isRecordingPath(body.path)) throw Error('Invalid input');
    } catch { return reply('Solicitud no válida.', 400); }
    try {
      const location = await locate({ token, path: body.path, copy: body.action === 'read-copy', service });
      const bytes = await download(location);
      if (body.action === 'read-copy') {
        if (location.provider !== 'r2') throw Error('Copy unavailable');
        await markVerified(body.path, location.sha256);
      }
      return new Response(bytes, { headers: { ...headers, 'Content-Type': 'application/octet-stream',
        'Content-Length': String(bytes.length), 'Content-Disposition': 'attachment' } });
    } catch (error) {
      return reply(error?.code === '28000' ? 'La sesión terminó. Vuelve a ingresar.' : 'No se pudo abrir la grabación privada.', error?.code === '28000' ? 401 : 503);
    }
  };
}
