import { isRecordingPath } from './recordingPath.js';
import { validAdminSession, AdminError } from '../admin/adminClient.js';

// This module contains no R2 credential, endpoint or presigned public link.
// Existing recordings keep the original Supabase reader until individually
// activated. A private-read failure must never bypass authorization by fallback.
export async function downloadRecording(client, row, session, { signal, serviceRole = false } = {}) {
  const path = typeof row === 'string' ? row : row?.path;
  if (!isRecordingPath(path)) throw Error('Ruta de grabación no válida.');
  let provider = 'supabase';
  if (typeof client.rpc === 'function') {
    const result = await client.rpc('deafapp_storage_route', { p_path: path });
    if (result.error && !['PGRST202', '42883'].includes(result.error.code)) throw Error('No se pudo comprobar dónde está la grabación.');
    if (!result.error) {
      if (result.data?.ok !== true || !['supabase', 'r2'].includes(result.data.provider)) throw Error('La ubicación de la grabación no es válida.');
      provider = result.data.provider;
    }
  }
  if (signal?.aborted) throw Object.assign(Error('Descarga cancelada.'), { name: 'AbortError' });
  if (provider === 'supabase') return client.storage.from('contribuciones').download(path, {}, signal ? { signal } : undefined);
  if (!serviceRole && !validAdminSession(session)) throw new AdminError('La sesión terminó. Vuelve a ingresar.', 'session_expired');
  const response = await client.functions.invoke('recording-storage', { body: { action: 'read', path },
    headers: serviceRole ? {} : { 'x-deafapp-admin-token': session.token }, ...(signal ? { signal } : {}) });
  if (response.error?.context?.status === 401) throw new AdminError('La sesión terminó. Vuelve a ingresar.', 'session_expired');
  return response;
}
