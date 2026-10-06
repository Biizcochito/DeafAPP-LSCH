import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { createRecordingDraft, isRecordingDraft, submitRecordingDraft, createTimedFetch } from '../recordingSubmission.js';
import { captureTrackingSample, createTrainingCapture } from '../trainingCapture.js';

const recording = () => createRecordingDraft({ label: 'hola', category: 'saludos', frames: Array.from({ length: 30 }, (_, i) => `frame-${i}`), id: 'sample-recording', now: 123456789 });
function service({ failUpload = false, failInsert = false, existing = false, duplicateAsset = false, lookupError = false } = {}) {
  const calls = [];
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const client = createClient('https://recordings.test', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, options) => {
      const url = new URL(input);
      const method = options?.method || 'GET';
      calls.push({ url, method });
      if (url.pathname.startsWith('/storage/')) {
        if (failUpload) throw new TypeError('Failed to fetch');
        if (duplicateAsset) return json({ statusCode: '409', error: 'Duplicate', message: 'The resource already exists' }, 409);
        const payload = JSON.parse(await options.body.get('').text());
        assert.deepEqual(payload.frames, recording().frames);
        assert.equal(payload.timestamp, recording().createdAt);
        assert.equal(new Headers(options.headers).get('x-upsert'), 'false');
        return json({ Id: 'storage-id', Key: url.pathname.slice('/storage/v1/object/'.length) });
      }
      if (method === 'GET') {
        assert.equal(url.searchParams.get('archivo_path'), `eq.${recording().storagePath}`);
        return lookupError ? json({ message: 'No select permission' }, 403) : json(existing ? [{ id: 10 }] : []);
      }
      assert.deepEqual(JSON.parse(options.body), { label: 'hola', categoria: 'saludos', archivo_path: recording().storagePath });
      return failInsert ? json({ code: 'XX000', message: 'Registration failed' }, 500) : new Response(null, { status: 201 });
    } },
  });
  return { client, calls };
}

test('creating and restoring a draft does not perform any upload and retains every frame', () => {
  const draft = recording();
  assert.equal(draft.uploaded, false);
  assert.equal(isRecordingDraft(JSON.parse(JSON.stringify(draft))), true);
  assert.equal(draft.frames.length, 30);
  assert.equal(draft.storagePath, 'saludos/hola/hola_sample-recording.json');
  for (const changed of [{ frames: [] }, { label: '../other' }, { category: 'invalid/path' }, { intervalMs: 0 }, { frameAspectRatio: 0 }, { storagePath: 'other.json' }]) {
    assert.equal(isRecordingDraft({ ...draft, ...changed }), false);
  }
});
test('the actual SDK sends training metadata and real timing without adding database columns', async () => {
  const samples = Array.from({ length: 30 }, (_, i) => captureTrackingSample({ enabled: false }, i * 100, 0));
  const training = createTrainingCapture({ participantId: 'same-person', sessionId: 'session', samples, platform: 'android', frameSize: { width: 640, height: 480 }, jpegQuality: 0.15 });
  const draft = createRecordingDraft({ label: 'hola', category: 'saludos', frames: recording().frames, intervalMs: 113, id: 'sample-recording', now: 123456789, training });
  assert.equal(isRecordingDraft(JSON.parse(JSON.stringify(draft))), true);
  assert.equal(isRecordingDraft({ ...draft, training: { ...training, samples: [] } }), false);
  let uploadedPayload;
  const client = createClient('https://recordings.test', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, options) => {
      const url = new URL(input);
      if (url.pathname.startsWith('/storage/')) {
        uploadedPayload = JSON.parse(await options.body.get('').text());
        return new Response(JSON.stringify({ Id: 'id' }), { headers: { 'content-type': 'application/json' } });
      }
      if (options.method === 'POST') {
        assert.deepEqual(Object.keys(JSON.parse(options.body)).sort(), ['archivo_path', 'categoria', 'label']);
        return new Response(null, { status: 201 });
      }
      return new Response('[]', { headers: { 'content-type': 'application/json' } });
    } },
  });
  await submitRecordingDraft({ draft, client });
  assert.deepEqual(uploadedPayload.training, training);
  assert.equal(uploadedPayload.schemaVersion, 2); assert.equal(uploadedPayload.language, 'csg');
  assert.equal(uploadedPayload.intervalMs, 113); assert.equal(uploadedPayload.recordingId, draft.id);
});

test('only explicit submission uploads and checks both storage and database results', async () => {
  const { client, calls } = service();
  const stages = [];
  await submitRecordingDraft({ draft: recording(), client, onUploaded: async draft => stages.push(draft) });
  assert.deepEqual(calls.map(c => c.method), ['GET', 'POST', 'POST']);
  assert.equal(stages[0].uploaded, true);
  assert.equal(stages[0].id, recording().id);
});

test('a failed upload keeps the original recording and does not register a partial result', async () => {
  const { client, calls } = service({ failUpload: true });
  const draft = recording();
  await assert.rejects(submitRecordingDraft({ draft, client }), /Failed to fetch/);
  assert.equal(draft.frames.length, 30);
  assert.equal(draft.uploaded, false);
  assert.equal(calls.length, 2);
});

test('database failure is not reported as success; a retry skips the uploaded file', async () => {
  let saved = recording();
  const failed = service({ failInsert: true });
  await assert.rejects(submitRecordingDraft({ draft: saved, client: failed.client, onUploaded: async draft => { saved = draft; } }), /Registration failed/);
  assert.equal(saved.uploaded, true);
  const retry = service();
  await submitRecordingDraft({ draft: saved, client: retry.client });
  assert.deepEqual(retry.calls.map(c => c.method), ['GET', 'POST']);
  assert.ok(retry.calls.every(c => !c.url.pathname.startsWith('/storage/')));
});

test('an upload whose response was lost uses the same asset path on retry', async () => {
  const { client, calls } = service({ duplicateAsset: true });
  await submitRecordingDraft({ draft: recording(), client });
  assert.equal(calls.length, 3);
  assert.ok(calls[1].url.pathname.endsWith(recording().storagePath));
});

test('a registration whose response was lost is found instead of inserted again', async () => {
  const { client, calls } = service({ existing: true });
  const result = await submitRecordingDraft({ draft: recording(), client });
  assert.equal(result.alreadySubmitted, true);
  assert.equal(calls.length, 1);
});

test('a lookup permission or network error preserves the draft and prevents a blind duplicate', async () => {
  const { client, calls } = service({ lookupError: true });
  await assert.rejects(submitRecordingDraft({ draft: recording(), client }), /No select permission/);
  assert.equal(calls.length, 1);
});

test('hanging requests are aborted, and an existing cancellation signal is preserved', async () => {
  let aborted = false;
  const pending = async (_input, { signal }) => new Promise((resolve, reject) => {
    if (signal.aborted) { aborted = true; reject(new Error('aborted')); return; }
    signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); });
  });
  await assert.rejects(createTimedFetch(pending, 10)('https://recordings.test'), /aborted/);
  assert.equal(aborted, true);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(createTimedFetch(pending)('https://recordings.test', { signal: controller.signal }), /aborted/);
});
