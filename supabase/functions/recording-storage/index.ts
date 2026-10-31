import { createClient } from 'npm:@supabase/supabase-js@2.110.7';
import { createPrivateRecordingHandler } from '../../../src/storage/privateRecordingServer.js';
import { loadRecordingObject } from '../_shared/recordingObjects.ts';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const authOptions = { auth: { persistSession: false, autoRefreshToken: false } };
const db = createClient(supabaseUrl, serviceKey, authOptions);
async function serviceAuthorized(request: Request) {
  if (request.headers.has('x-deafapp-admin-token')) return false;
  const bearer = request.headers.get('authorization')?.match(/^Bearer (eyJ[A-Za-z0-9._-]{40,4096})$/)?.[1];
  if (!bearer) return false;
  // The dashboard and function environment may hold different valid legacy
  // JWTs. PostgreSQL validates the signature and service-only EXECUTE grant;
  // comparing JWT text or trusting its unverified role claim is insufficient.
  try {
    const { data, error } = await createClient(supabaseUrl, bearer, authOptions).rpc('deafapp_storage_service_authorized');
    return !error && data === true;
  } catch { return false; }
}
async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw Object.assign(Error('Private storage unavailable'), { code: error.code });
  if (data?.ok !== true) throw Error('Invalid storage response'); return data;
}
Deno.serve(createPrivateRecordingHandler({
  isServiceRequest: serviceAuthorized,
  locate: ({ token, path, copy, service }: { token: string; path: string; copy: boolean; service: boolean }) => service
    ? rpc('deafapp_storage_server_location', { p_path: path, p_copy: copy })
    : rpc('deafapp_admin_storage_location', { p_token: token, p_path: path, p_copy: copy }),
  download: (location: any) => loadRecordingObject(db, location),
  markVerified: (path: string, hash: string) => rpc('deafapp_storage_verify_copy', { p_path: path, p_sha256: hash }),
}));
