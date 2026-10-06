import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getWebCameraLayout } from '../cameraLayout.js';

const desktop = { maxWidth: 600, aspectRatio: 4 / 3 };
const phone = { maxWidth: 450, aspectRatio: 9 / 16 };

test('desktop retains the old frame even when its window is narrow', () => {
  for (const viewportWidth of [1440, 600, 390]) {
    assert.deepEqual(getWebCameraLayout({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      screenWidth: 1920, screenHeight: 1080, viewportWidth, viewportHeight: 844,
    }), desktop);
  }
});

test('phones keep the portrait frame in both orientations', () => {
  for (const userAgent of ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 'Mozilla/5.0 (Linux; Android 15) Mobile']) {
    for (const [viewportWidth, viewportHeight] of [[390, 844], [844, 390]]) {
      assert.deepEqual(getWebCameraLayout({ userAgent, viewportWidth, viewportHeight }), phone);
    }
  }
  assert.deepEqual(getWebCameraLayout({ mobile: true }), phone);
});

test('a touchscreen PC with a mobile=false hint uses the desktop frame', () => {
  assert.deepEqual(getWebCameraLayout({ mobile: false, coarsePointer: true, touchPoints: 10, screenWidth: 600, screenHeight: 960 }), desktop);
});

test('iPad desktop Safari is recognized without classifying a Mac as a phone', () => {
  assert.deepEqual(getWebCameraLayout({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', touchPoints: 5 }), phone);
  assert.deepEqual(getWebCameraLayout({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', touchPoints: 0 }), desktop);
});

test('privacy-restricted browsers require both touch and a small device for the fallback', () => {
  const touch = { coarsePointer: true, touchPoints: 5 };
  assert.deepEqual(getWebCameraLayout({ ...touch, screenWidth: 390, screenHeight: 844 }), phone);
  assert.deepEqual(getWebCameraLayout({ ...touch, screenWidth: 844, screenHeight: 390 }), phone);
  assert.deepEqual(getWebCameraLayout({ ...touch, screenWidth: 1920, screenHeight: 1080, viewportWidth: 390, viewportHeight: 844 }), desktop);
  assert.deepEqual(getWebCameraLayout({ viewportWidth: 390, viewportHeight: 844 }), desktop);
  assert.deepEqual(getWebCameraLayout(), desktop);
});
