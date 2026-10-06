import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import { cameraStartupMessage } from '../cameraStartup.js';

const source = readFileSync(new URL('../scripts/expo-camera-web-stream.js', import.meta.url), 'utf8');
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const load = (globals = {}) => {
  const context = vm.createContext({ setTimeout, ...globals });
  vm.runInContext(source.replace(/^import .*;\r?\n/gm, '').replace(/\bexport /g, ''), context);
  return context;
};
function device(id) {
  const track = new EventTarget();
  track.stops = 0;
  track.stop = () => { track.stops++; };
  track.getSettings = () => ({ deviceId: id, facingMode: 'user' });
  return { id, track, getVideoTracks: () => [track] };
}
const callbacks = () => {
  const streams = [], errors = [];
  return { streams, errors, facing: 'front', onStream: value => streams.push(value), onError: value => errors.push(value) };
};
function manager(requestStream, extra = {}) {
  return load({ Utils: {} }).createWebCameraLifecycle({
    requestStream, requestFallbackStream: requestStream,
    stopStream: stream => stream.getVideoTracks().forEach(track => track.stop()),
    wait: async () => {}, ...extra,
  });
}

test('a rapid restart waits for the old request and releases its late stream', async () => {
  const first = deferred(), oldStream = device('old'), newStream = device('new');
  let requests = 0;
  const api = manager(() => ++requests === 1 ? first.promise : Promise.resolve(newStream));
  const oldCallbacks = callbacks(), newCallbacks = callbacks();
  const oldSession = api.open(oldCallbacks);
  await flush();
  assert.equal(requests, 1);
  oldSession.close();
  const newSession = api.open(newCallbacks);
  await flush();
  assert.equal(requests, 1, 'the replacement must not compete with the pending acquisition');
  first.resolve(oldStream);
  await Promise.all([oldSession.done, newSession.done]);
  assert.equal(oldStream.track.stops, 1);
  assert.equal(oldCallbacks.streams.length, 0);
  assert.equal(oldCallbacks.errors.length, 0);
  assert.deepEqual(newCallbacks.streams, [newStream]);
  newSession.close();
  newSession.close();
  assert.equal(newStream.track.stops, 1, 'closing repeatedly does not retain or release another stream');
});

test('leaving before a queued opening never requests another camera', async () => {
  const first = deferred();
  let requests = 0;
  const api = manager(() => { requests++; return first.promise; });
  const current = api.open(callbacks());
  await flush();
  const waiting = api.open(callbacks());
  waiting.close();
  first.resolve(device('first'));
  await Promise.all([current.done, waiting.done]);
  assert.equal(requests, 1);
  current.close();
});

test('a transient startup failure retries once after allowing the device to recover', async () => {
  let requests = 0;
  const waits = [], stream = device('recovered'), handlers = callbacks();
  const api = manager(async () => {
    if (++requests === 1) throw { name: 'NotReadableError', message: 'Starting videoinput failed' };
    return stream;
  }, { wait: async ms => waits.push(ms) });
  const session = api.open(handlers);
  await session.done;
  assert.equal(requests, 2);
  assert.deepEqual(waits, [180, 500]);
  assert.deepEqual(handlers.streams, [stream]);
  assert.deepEqual(handlers.errors, []);
  session.close();
});

test('a camera still occupied fails after two attempts instead of retrying forever', async () => {
  let requests = 0;
  const failure = { name: 'NotReadableError' }, handlers = callbacks();
  const api = manager(async () => { requests++; throw failure; });
  await api.open(handlers).done;
  assert.equal(requests, 2);
  assert.deepEqual(handlers.errors, [failure]);
  assert.equal(handlers.streams.length, 0);
});

test('permission denial does not retry or silently fall back', async () => {
  let requests = 0, fallbackRequests = 0;
  const failure = { name: 'NotAllowedError' }, handlers = callbacks();
  const api = manager(async () => { requests++; throw failure; }, {
    requestFallbackStream: async () => { fallbackRequests++; },
  });
  await api.open(handlers).done;
  assert.equal(requests, 1);
  assert.equal(fallbackRequests, 0);
  assert.deepEqual(handlers.errors, [failure]);
});

test('incompatible constraints fall back to a default camera once', async () => {
  let requests = 0, fallbackRequests = 0;
  const stream = device('default'), handlers = callbacks();
  const api = manager(async () => { requests++; throw { name: 'OverconstrainedError', constraint: 'width' }; }, {
    requestFallbackStream: async () => { fallbackRequests++; return stream; },
  });
  const session = api.open(handlers);
  await session.done;
  assert.equal(requests, 1);
  assert.equal(fallbackRequests, 1);
  assert.deepEqual(handlers.streams, [stream]);
  session.close();
});

test('closing during retry prevents the second request and suppresses obsolete errors', async () => {
  const retryWait = deferred();
  let requests = 0;
  const handlers = callbacks();
  const api = manager(async () => { requests++; throw { name: 'AbortError' }; }, {
    wait: ms => ms === 500 ? retryWait.promise : Promise.resolve(),
  });
  const session = api.open(handlers);
  await flush();
  session.close();
  retryWait.resolve();
  await session.done;
  assert.equal(requests, 1);
  assert.equal(handlers.errors.length, 0);
});

function hookHarness(requestStream) {
  let index = 0;
  const slots = [], effects = [];
  const React = {
    useRef(value) { const slot = index++; return slots[slot] ||= { current: value }; },
    useState(initial) {
      const slot = index++;
      if (!(slot in slots)) slots[slot] = initial;
      return [slots[slot], value => { slots[slot] = value; }];
    },
    useMemo(fn) { index++; return fn(); },
    useEffect(fn, dependencies) {
      const slot = index++, previous = slots[slot];
      if (!previous || dependencies.some((value, i) => value !== previous.dependencies[i])) {
        effects.push(() => {
          previous?.cleanup?.();
          slots[slot] = { dependencies, cleanup: fn() };
        });
      }
    },
  };
  const api = load({
    React, FacingModeToCameraType: { user: 'front', environment: 'back' },
    Utils: {
      getPreferredStreamDevice: requestStream,
      stopMediaStream: stream => stream.getVideoTracks().forEach(track => track.stop()),
      setVideoSource: (video, stream) => { video.srcObject = stream; },
      syncTrackCapabilities: () => {},
    },
    requestUserMediaAsync: requestStream,
    setTimeout: fn => { queueMicrotask(fn); },
  });
  const video = new EventTarget();
  video.readyState = 0;
  video.videoWidth = 0;
  video.play = async () => {};
  const ref = { current: video };
  return {
    video,
    render(callbacks) {
      index = 0;
      const result = api.useWebCameraStream(ref, 'front', {}, callbacks);
      while (effects.length) effects.shift()();
      return result;
    },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
  };
}

test('camera ready waits for actual video frames; rerenders do not reopen the device', async () => {
  let requests = 0, ready = 0;
  const stream = device('preview');
  const hook = hookHarness(async () => { requests++; return stream; });
  hook.render({ onCameraReady: () => { ready += 1; } });
  await flush();
  assert.equal(hook.video.srcObject, stream);
  assert.equal(ready, 0);
  const state = hook.render({ onCameraReady: () => { ready += 10; } });
  assert.equal(state.mediaTrackSettings.deviceId, 'preview');
  hook.video.readyState = 4;
  hook.video.videoWidth = 640;
  hook.video.dispatchEvent(new Event('loadeddata'));
  hook.video.dispatchEvent(new Event('playing'));
  assert.equal(ready, 10, 'the latest listener is called once when frames arrive');
  assert.equal(requests, 1);
  hook.unmount();
  assert.equal(hook.video.srcObject, null);
  assert.equal(stream.track.stops, 1);
  hook.video.dispatchEvent(new Event('loadeddata'));
  assert.equal(ready, 10);
});

test('failed camera acquisition never emits camera ready or retains a source', async () => {
  let ready = 0;
  const errors = [];
  const hook = hookHarness(async () => { throw { name: 'NotAllowedError' }; });
  hook.render({ onCameraReady: () => ready++, onMountError: value => errors.push(value.nativeEvent) });
  await flush();
  assert.equal(ready, 0);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].name, 'NotAllowedError');
  assert.equal(hook.video.srcObject ?? null, null);
  hook.unmount();
});

test('startup messages explain the relevant recovery action in Spanish', () => {
  assert.match(cameraStartupMessage({ name: 'NotReadableError' }), /Cierra otras pestañas/);
  assert.match(cameraStartupMessage({ message: 'Starting videoinput failed' }), /Reiniciar cámara/);
  assert.match(cameraStartupMessage({ name: 'NotAllowedError' }), /permisos/);
  assert.match(cameraStartupMessage({ name: 'NotFoundError' }), /conectada/);
  assert.match(cameraStartupMessage(null), /Reiniciar cámara/);
});
