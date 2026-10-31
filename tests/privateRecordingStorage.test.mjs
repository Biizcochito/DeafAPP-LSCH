import test from 'node:test';
import assert from 'node:assert/strict';
import { downloadRecording } from '../src/storage/recordingStorage.js';
import { createPrivateRecordingHandler, readStoredRecording, digestBytes, readLimitedBytes } from '../src/storage/privateRecordingServer.js';
const path = 'familia/mama/original.json';
const session = { token: 'a'.repeat(64), expiresAt: Date.now() + 100000 };
const bytes = new TextEncoder().encode(JSON.stringify({ label: 'mama', frames: ['test-only'], training: { preserved: true } }));
const hash = await digestBytes(bytes);
const config = { accountId: 'a'.repeat(32), bucket: 'deafapp-grabaciones-privadas' };
const location = { ok: true, provider: 'r2', path, bucket: config.bucket, key: `contribuciones/${path}`, sha256: hash, bytes: bytes.length };
test('an unactivated recording keeps its existing Supabase download', async () => {
  const calls = [], client = { rpc: async () => ({ data: { ok: true, provider: 'supabase' } }),
    storage: { from: bucket => ({ download: async p => { calls.push([bucket, p]); return { data: new Blob([bytes]) }; } }) } };
  assert.equal((await downloadRecording(client, { path }, null)).data.size, bytes.length);
  assert.deepEqual(calls, [['contribuciones', path]]);
});
test('legacy filenames without category folders remain readable', async () => {
  let requested;
  const client = { storage: { from: () => ({ download: async value => { requested = value; return { data: new Blob([bytes]) }; } }) } };
  assert.equal((await downloadRecording(client, 'hola.json')).data.size, bytes.length);
  assert.equal(requested, 'hola.json');
});
test('R2 downloads send the admin token in a header, without public URLs or storage fallback', async () => {
  const calls = [], client = { rpc: async () => ({ data: { ok: true, provider: 'r2' } }),
    functions: { invoke: async (name, options) => { calls.push({ name, options }); return { data: new Blob([bytes]), error: null }; } },
    storage: { from() { throw Error('must not bypass private storage'); } } };
  const result = await downloadRecording(client, { path }, session);
  assert.equal(result.data.size, bytes.length); assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].options.body, { action: 'read', path });
  assert.equal(calls[0].options.headers['x-deafapp-admin-token'], session.token);
  await assert.rejects(downloadRecording(client, { path }, null), error => error.code === 'session_expired');
  client.functions.invoke = async () => ({ error: { context: { status: 401 } } });
  await assert.rejects(downloadRecording(client, { path }, session), error => error.code === 'session_expired');
});
test('legacy server compatibility applies only when the routing RPC does not exist', async () => {
  let downloads = 0;
  const client = { rpc: async () => ({ error: { code: 'PGRST202' } }), storage: { from: () => ({ download: async () => { downloads++; return {}; } }) } };
  await downloadRecording(client, path); assert.equal(downloads, 1);
  client.rpc = async () => ({ error: { code: '42501' } });
  await assert.rejects(downloadRecording(client, path), /comprobar/); assert.equal(downloads, 1);
  client.rpc = async () => ({ data: { ok: true, provider: 'attacker-host' } });
  await assert.rejects(downloadRecording(client, path), /ubicación/);
  await assert.rejects(downloadRecording(client, 'familia/../secret.json'), /Ruta/);
});
function handlerFixture() {
  const calls = [];
  const options = {
    locate: async value => { calls.push(['locate', value]); return location; },
    download: async value => { calls.push(['download', value]); return bytes; },
    markVerified: async (...value) => { calls.push(['verify', ...value]); },
    isServiceRequest: request => request.headers.get('authorization') === 'Bearer test-service-only',
  };
  return { calls, options, handler: createPrivateRecordingHandler(options) };
}
function request(body = { action: 'read', path }, { token = session.token, origin = 'https://deafapps.com', method = 'POST', authorization } = {}) {
  return new Request('https://project.supabase.co/functions/v1/recording-storage', { method,
    headers: { ...(token ? { 'x-deafapp-admin-token': token } : {}), ...(origin ? { origin } : {}),
      ...(authorization ? { authorization } : {}) }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) });
}
test('anonymous and forged service requests cannot invoke the private reader', async () => {
  const fixture = handlerFixture();
  assert.equal((await fixture.handler(request(undefined, { token: null }))).status, 401);
  assert.equal((await fixture.handler(request(undefined, { token: null, authorization: 'Bearer public-anon-key' }))).status, 401);
  assert.equal(fixture.calls.length, 0);
  assert.equal((await fixture.handler(request({ action: 'read', path, service: true }))).status, 400);
  assert.equal(fixture.calls.length, 0);
});
test('private reads return the original bytes with no-store and no reusable signed URL', async () => {
  const fixture = handlerFixture(), response = await fixture.handler(request());
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('content-type'), 'application/octet-stream');
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://deafapps.com');
  assert.equal(response.headers.get('location'), null);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
  assert.equal(fixture.calls[0][1].token, session.token);
  assert.ok(!fixture.calls.some(call => call[0] === 'verify'));
});
test('a copy is marked verified only after a successful complete server read', async () => {
  const fixture = handlerFixture();
  assert.equal((await fixture.handler(request({ action: 'read-copy', path }))).status, 200);
  assert.deepEqual(fixture.calls.map(value => value[0]), ['locate', 'download', 'verify']);
  const broken = handlerFixture(); broken.options.download = async () => { throw Error('hash mismatch with private detail'); };
  const response = await createPrivateRecordingHandler(broken.options)(request({ action: 'read-copy', path }));
  assert.equal(response.status, 503); assert.ok(!(await response.text()).includes('private detail'));
  assert.ok(!broken.calls.some(value => value[0] === 'verify'));
});
test('expired sessions, foreign origins, invalid paths and oversized requests are rejected', async () => {
  const fixture = handlerFixture();
  assert.equal((await fixture.handler(request(undefined, { origin: 'https://localhost.attacker.test' }))).status, 403);
  assert.equal((await fixture.handler(request({ action: 'read', path: 'familia/%2e%2e/secret.json' }))).status, 400);
  assert.equal((await fixture.handler(request({ action: 'read', path, extra: 'x'.repeat(3000) }))).status, 400);
  assert.equal((await fixture.handler(request(undefined, { method: 'GET' }))).status, 405);
  fixture.options.locate = async () => { throw Object.assign(Error('expired'), { code: '28000' }); };
  assert.equal((await createPrivateRecordingHandler(fixture.options)(request())).status, 401);
});
test('preflight and local preview origins do not grant read authorization', async () => {
  const fixture = handlerFixture();
  const response = await fixture.handler(request(undefined, { method: 'OPTIONS', token: null, origin: 'http://127.0.0.1:8082' }));
  assert.equal(response.status, 204); assert.equal(fixture.calls.length, 0);
  assert.equal((await fixture.handler(request(undefined, { token: null, origin: 'http://127.0.0.1:8082' }))).status, 401);
});
test('the runtime service identity is accepted without exposing an administrator token', async () => {
  const fixture = handlerFixture();
  assert.equal((await fixture.handler(request(undefined, { token: null, origin: '', authorization: 'Bearer test-service-only' }))).status, 200);
  assert.equal(fixture.calls[0][1].service, true); assert.equal(fixture.calls[0][1].token, '');
});
test('asynchronous service validation must complete before granting access', async () => {
  const fixture = handlerFixture();
  fixture.options.isServiceRequest = async () => false;
  assert.equal((await createPrivateRecordingHandler(fixture.options)(request(undefined,{token:null}))).status,401);
  assert.equal(fixture.calls.length,0);
  fixture.options.isServiceRequest = async () => true;
  assert.equal((await createPrivateRecordingHandler(fixture.options)(request(undefined,{token:null}))).status,200);
  assert.equal(fixture.calls[0][1].service,true);
});
test('R2 reads validate the fixed account, bucket, key and full checksum', async () => {
  let url;
  const signedFetch = async value => { url = value; return new Response(bytes, { headers: { 'content-length': String(bytes.length) } }); };
  assert.deepEqual(await readStoredRecording({ location, config, signedFetch }), bytes);
  assert.equal(url, `https://${config.accountId}.r2.cloudflarestorage.com/deafapp-grabaciones-privadas/contribuciones/familia/mama/original.json`);
  await assert.rejects(readStoredRecording({ location: { ...location, key: 'outside/file.json' }, config, signedFetch }), /Invalid R2/);
  await assert.rejects(readStoredRecording({ location: { ...location, bucket: 'another-bucket' }, config, signedFetch }), /Invalid R2/);
  await assert.rejects(readStoredRecording({ location, config, signedFetch: async () => new Response(new Uint8Array(bytes.length)) }), /integrity/);
  await assert.rejects(readStoredRecording({ location, config, signedFetch: async () => new Response(new Uint8Array(bytes.length + 1)) }), /Oversized/);
});
test('a fragmented 22 MB response retains every byte with a bounded buffer',async()=>{
  const total=22_000_000;let sent=0;
  const stream=new ReadableStream({pull(controller){
    if(sent===total){controller.close();return;}
    const chunk=new Uint8Array(Math.min(65536,total-sent));chunk.fill(sent%251);sent+=chunk.length;controller.enqueue(chunk);
  }});
  const result=await readLimitedBytes(new Response(stream),total);
  assert.equal(result.length,total);
  for(let offset=0;offset<total;offset+=65536)assert.equal(result[offset],offset%251);
  assert.equal(result.at(-1),(Math.floor((total-1)/65536)*65536)%251);
});
