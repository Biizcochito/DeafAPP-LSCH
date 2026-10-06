import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import {test} from 'node:test';

const root = new URL('../', import.meta.url);
execFileSync(process.execPath, ['scripts/patch-expo-camera.cjs'], {cwd: root});
const sourcePath = new URL('node_modules/expo-camera/build/web/WebCameraUtils.js', root);
const source = readFileSync(sourcePath, 'utf8');

function camera(requestUserMediaAsync, userAgent = 'AppleWebKit/537.36 Chrome/130 Safari/537.36') {
  const context = vm.createContext({
    navigator: {userAgent, mediaDevices: {getSupportedConstraints: () => ({facingMode: true, width: true, height: true})}},
    CameraTypeToFacingMode: {front: 'user', back: 'environment'},
    MinimumConstraints: {audio: false, video: true},
    requestUserMediaAsync,
  });
  // Execute the installed camera implementation, with its imports supplied above.
  vm.runInContext(source.replace(/^import .*;\r?\n/gm, '').replace(/\bexport /g, ''), context);
  return context;
}

test('desktop webcams can open without advertising an exact front-facing camera', async () => {
  const stream = {};
  const api = camera(async constraints => {
    assert.equal(constraints.audio, false);
    assert.equal(constraints.video.facingMode.ideal, 'user');
    assert.equal(constraints.video.facingMode.exact, undefined);
    return stream;
  });
  assert.equal(await api.getPreferredStreamDevice('front'), stream);
});

test('facing-mode failures fall back without an OverconstrainedError global constructor', async () => {
  const calls = [], stream = {};
  const api = camera(async constraints => {
    calls.push(constraints.video.facingMode.ideal);
    if (calls.length === 1) throw {name: 'OverconstrainedError', constraint: 'facingMode'};
    return stream;
  });
  assert.equal(await api.getPreferredStreamDevice('front'), stream);
  assert.deepEqual(calls, ['user', 'environment']);
});

test('camera permission, device-in-use and other constraint errors remain intact without retries', async () => {
  for (const failure of [
    {name: 'NotAllowedError', message: 'Permission denied'},
    {name: 'NotReadableError', message: 'Could not start video source'},
    {name: 'OverconstrainedError', constraint: 'width'},
    null,
  ]) {
    let calls = 0;
    const api = camera(async () => {calls++; throw failure;});
    await assert.rejects(api.getPreferredStreamDevice('front'), error => error === failure);
    assert.equal(calls, 1);
  }
});

test('reapplying the compatibility patch leaves installed files unchanged', () => {
  const hookPath = new URL('node_modules/expo-camera/build/web/useWebCameraStream.js', root);
  const hook = readFileSync(hookPath, 'utf8');
  execFileSync(process.execPath, ['scripts/patch-expo-camera.cjs'], {cwd: root});
  assert.equal(readFileSync(sourcePath, 'utf8'), source);
  assert.equal(readFileSync(hookPath, 'utf8'), hook);
  assert.equal(readFileSync(new URL('node_modules/expo-camera/src/web/useWebCameraStream.ts', root), 'utf8'), hook);
});
