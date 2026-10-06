import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handsReadyForRecording, captureTrackedFrames, prepareTrackedRecording, cameraFrameReady } from '../recordingHandGuard.js';

const hand = () => Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }));
const tracked = () => ({ enabled: true, handTime: 1000, leftHandLandmarks: hand(), rightHandLandmarks: hand() });

test('initial confirmation requires two complete recent hands and active tracing', () => {
  assert.equal(handsReadyForRecording(tracked(), 1100), true);
  assert.equal(handsReadyForRecording({ ...tracked(), enabled: false }, 1100), false);
  assert.equal(handsReadyForRecording({ ...tracked(), rightHandLandmarks: undefined }, 1100), false);
  assert.equal(handsReadyForRecording({ ...tracked(), leftHandLandmarks: hand().slice(1) }, 1100), false);
  assert.equal(handsReadyForRecording(tracked(), 1400), false);
  assert.equal(handsReadyForRecording(tracked(), 900), false);
  const invalid = tracked();
  invalid.leftHandLandmarks[3].x = NaN;
  assert.equal(handsReadyForRecording(invalid, 1100), false);
});

test('after confirmation, either hand alone is enough, but stale or absent hands are rejected', () => {
  const leftOnly = { ...tracked(), rightHandLandmarks: undefined };
  const rightOnly = { ...tracked(), leftHandLandmarks: undefined };
  assert.equal(handsReadyForRecording(leftOnly, 1100, 1), true);
  assert.equal(handsReadyForRecording(rightOnly, 1100, 1), true);
  assert.equal(handsReadyForRecording(tracked(), 1100, 1), true);
  assert.equal(handsReadyForRecording(leftOnly, 1400, 1), false);
  assert.equal(handsReadyForRecording({ ...leftOnly, enabled: false }, 1100, 1), false);
  assert.equal(handsReadyForRecording({ ...tracked(), leftHandLandmarks: undefined, rightHandLandmarks: undefined }, 1100, 1), false);
});

test('both hands are confirmed once, then one hand can remain through countdown and capture', async () => {
  let time = 1000;
  const tracking = () => ({ ...tracked(), handTime: time, rightHandLandmarks: time < 1700 ? hand() : undefined });
  const countdowns = [];
  await prepareTrackedRecording({
    isReady: () => handsReadyForRecording(tracking(), time),
    isCountdownReady: () => handsReadyForRecording(tracking(), time, 1),
    isCancelled: () => false, now: () => time,
    delay: async ms => { time += ms; }, onWaiting() {},
    onCountdown: number => countdowns.push(number),
  });
  assert.deepEqual(countdowns, [3, 2, 1]);
  let captures = 0;
  const frames = await captureTrackedFrames({
    count: 3, isReady: () => handsReadyForRecording(tracking(), time, 1),
    capture: async () => `frame-${++captures}`, onFrame() {}, delay: async () => { time += 100; },
  });
  assert.equal(frames.length, 3);
  // A new attempt must confirm both again; the previous attempt cannot unlock it.
  await assert.rejects(prepareTrackedRecording({
    isReady: () => handsReadyForRecording(tracking(), time),
    isCountdownReady: () => handsReadyForRecording(tracking(), time, 1),
    isCancelled: () => false, now: () => time, maxWaitMs: 200,
    delay: async ms => { time += ms; }, onWaiting() {},
    onCountdown() { assert.fail('one hand alone cannot perform initial confirmation'); },
  }), /No se inició/);
});

test('initial two-hand confirmation survives loss of all hands during countdown and returns with one', async () => {
  let time = 0;
  let waits = 0;
  const countdowns = [];
  await prepareTrackedRecording({
    isReady: () => time < 700,
    isCountdownReady: () => time < 700 || time >= 1500,
    isCancelled: () => false, now: () => time,
    delay: async ms => { time += ms; }, onWaiting: () => waits++,
    onCountdown: number => countdowns.push(number),
  });
  assert.equal(waits, 2);
  assert.deepEqual(countdowns, [3, 3, 2, 1]);
});

test('no camera frame is captured while hands are missing', async () => {
  let captures = 0;
  await assert.rejects(captureTrackedFrames({ count: 3, isReady: () => false, capture: () => captures++ }), /trazado/);
  assert.equal(captures, 0);
});

test('loss while taking a picture or between pictures discards the sequence', async () => {
  let ready = true;
  let notified = 0;
  await assert.rejects(captureTrackedFrames({
    count: 3, isReady: () => ready,
    capture: async () => { ready = false; return 'frame'; },
    onFrame: () => notified++, delay: async () => {},
  }), /No guardamos/);
  assert.equal(notified, 0);
  ready = true;
  let captures = 0;
  await assert.rejects(captureTrackedFrames({
    count: 3, isReady: () => ready,
    capture: async () => { captures++; return 'frame'; },
    onFrame() {}, delay: async () => { ready = false; },
  }), /No guardamos/);
  assert.equal(captures, 1);
});

test('only a complete sequence with tracking throughout can be returned for upload', async () => {
  let captures = 0;
  const progress = [];
  const frames = await captureTrackedFrames({
    count: 3, isReady: () => true,
    capture: async () => `frame-${++captures}`,
    onFrame: value => progress.push(value), delay: async () => {},
  });
  assert.deepEqual(frames, ['frame-1', 'frame-2', 'frame-3']);
  assert.deepEqual(progress, [1, 2, 3]);
});
test('an unavailable, paused or empty camera cannot prepare a recording', () => {
  const video = { readyState: 4, videoWidth: 640, videoHeight: 480, paused: false, ended: false };
  assert.equal(cameraFrameReady(video), true);
  assert.equal(cameraFrameReady(null), false);
  assert.equal(cameraFrameReady({ ...video, readyState: 0 }), false);
  assert.equal(cameraFrameReady({ ...video, videoWidth: 0 }), false);
  assert.equal(cameraFrameReady({ ...video, paused: true }), false);
  assert.equal(cameraFrameReady({ ...video, ended: true }), false);
});

test('the user can click with no hands visible and place both hands before the countdown', async () => {
  let time = 0;
  const countdowns = [];
  await prepareTrackedRecording({
    isReady: () => time >= 1200, isCancelled: () => false,
    now: () => time, delay: async ms => { time += ms; },
    onWaiting() {}, onCountdown: number => countdowns.push({ number, time }),
  });
  assert.deepEqual(countdowns.map(value => value.number), [3, 2, 1]);
  assert.equal(countdowns[0].time, 1700);
  assert.equal(time, 4700);
});

test('losing a hand in the countdown waits for both hands and restarts the countdown', async () => {
  let time = 0;
  const countdowns = [];
  let waits = 0;
  await prepareTrackedRecording({
    isReady: () => time < 2000 || time >= 2500, isCancelled: () => false,
    now: () => time, delay: async ms => { time += ms; },
    onWaiting: () => waits++, onCountdown: number => countdowns.push(number),
  });
  assert.equal(waits, 2);
  assert.deepEqual(countdowns, [3, 2, 3, 2, 1]);
  assert.equal(time, 6000);
});

test('preparation can be cancelled and missing hands time out instead of capturing', async () => {
  let time = 0;
  const callbacks = {
    isReady: () => false, now: () => time,
    delay: async ms => { time += ms; }, onWaiting() {},
    onCountdown() { assert.fail('no countdown without tracked hands'); },
  };
  await assert.rejects(prepareTrackedRecording({ ...callbacks, isCancelled: () => time >= 150 }), { code: 'CANCELLED' });
  time = 0;
  await assert.rejects(prepareTrackedRecording({ ...callbacks, isCancelled: () => false, maxWaitMs: 200 }), /No se inició/);
});
