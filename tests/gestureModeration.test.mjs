import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {isMiddleFingerGesture, createGestureGate, assertGestureAllowed} from '../gestureModeration.js';
import {prepareTrackedRecording, captureTrackedFrames} from '../recordingHandGuard.js';

function hand(extended = [9], {rotation = 0, mirror = 1, aspect = 1, scale = .7} = {}) {
  const points = Array.from({length: 21}, () => ({x: 0, y: .2}));
  points[0] = {x: 0, y: .3};
  [1, 2, 3, 4].forEach((i) => {points[i] = {x: -.14 - i * .03, y: .15 - i * .025};});
  for (const [i, x] of [[5, -.1], [9, 0], [13, .08], [17, .16]]) {
    points[i] = {x, y: 0};
    points[i + 1] = {x, y: -.13};
    points[i + 2] = {x: x + (extended.includes(i) ? 0 : .02), y: extended.includes(i) ? -.23 : -.06};
    points[i + 3] = {x: x + (extended.includes(i) ? 0 : .03), y: extended.includes(i) ? -.34 : .025};
  }
  return points.map(p => ({
    x: .5 + scale * mirror * (p.x * Math.cos(rotation) - p.y * Math.sin(rotation)) / aspect,
    y: .5 + scale * (p.x * Math.sin(rotation) + p.y * Math.cos(rotation)),
  }));
}
const tracking = (time, left, right) => ({enabled: true, handTime: time, leftHandLandmarks: left, rightHandLandmarks: right, sourceWidth: 640, sourceHeight: 480});

test('the actual model landmarks from the supplied example block in normal and mirrored coordinates', () => {
  const sample = JSON.parse(readFileSync(new URL('./fixtures/middle-finger-landmarks.json', import.meta.url), 'utf8'));
  assert.equal(isMiddleFingerGesture(sample.landmarks, sample.sourceWidth / sample.sourceHeight), true);
  assert.equal(isMiddleFingerGesture(sample.landmarks.map(p => ({...p, x: 1 - p.x})), sample.sourceWidth / sample.sourceHeight), true);
});

test('middle finger is detected on either mirrored hand, at different scales, rotations and camera ratios', () => {
  for (const mirror of [-1, 1]) for (const rotation of [0, .7, 1.6, 3.1]) for (const aspect of [9 / 16, 4 / 3, 16 / 9]) for (const scale of [.2, .7, 1]) {
    assert.equal(isMiddleFingerGesture(hand([9], {mirror, rotation, aspect, scale}), aspect), true);
  }
});

test('an open hand, fist, pointing, victory, I-love-you, horns and OK-like shapes remain allowed', () => {
  for (const fingers of [[5, 9, 13, 17], [], [5], [5, 9], [5, 17], [9, 13, 17]]) {
    assert.equal(isMiddleFingerGesture(hand(fingers)), false, JSON.stringify(fingers));
  }
});

test('incomplete, invalid, degenerate or ambiguous bent-middle configurations cannot trigger moderation', () => {
  assert.equal(isMiddleFingerGesture(hand().slice(1)), false);
  const invalid = hand(); invalid[12].x = NaN;
  assert.equal(isMiddleFingerGesture(invalid), false);
  assert.equal(isMiddleFingerGesture(Array.from({length: 21}, () => ({x: .5, y: .5}))), false);
  assert.equal(isMiddleFingerGesture(hand(), 0), false);
  const bent = hand(); bent[12] = {...bent[10]};
  assert.equal(isMiddleFingerGesture(bent), false);
});

test('the gate requires several independent hand detections and ignores transient configurations', () => {
  const gate = createGestureGate();
  const middle = hand([9], {aspect: 4 / 3});
  const open = hand([5, 9, 13, 17], {aspect: 4 / 3});
  for (let now = 1000; now <= 1300; now += 30) assert.equal(gate.update(tracking(1000, middle), now).blocked, false);
  assert.equal(gate.update(tracking(1100, middle), 1300).blocked, false);
  assert.equal(gate.update(tracking(1300, middle), 1300).blocked, true);
  assert.equal(gate.update(tracking(1400, open), 1400).blocked, true);
  assert.equal(gate.update(tracking(1450, open), 1450).blocked, false);
  assert.equal(gate.update(tracking(1500, middle), 1500).blocked, false);
  assert.equal(gate.update(tracking(1600, open), 1600).blocked, false);
});

test('one uncertain result does not erase a sustained gesture; two clear results release the warning', () => {
  const gate = createGestureGate(), middle = hand([9], {aspect: 4 / 3}), open = hand([5, 9, 13, 17], {aspect: 4 / 3});
  for (const [time, points] of [[0,middle],[100,open],[200,middle],[300,open]]) assert.equal(gate.update(tracking(time,points),time).blocked,false);
  assert.equal(gate.update(tracking(400,middle),400).blocked,true);
  assert.equal(gate.update(tracking(450,open),450).blocked,true);
  assert.equal(gate.update(tracking(500,open),500).blocked,false);
  // Separate brief occurrences must not add up across a long gap.
  for(const time of [1000,1500,2000]) assert.equal(gate.update(tracking(time,middle),time).blocked,false);
});

test('either hand blocks, stale/disabled results clear the warning, and a new camera session starts clean', () => {
  for (const side of ['left', 'right', 'both']) {
    const gate = createGestureGate();
    const middle = hand([9], {aspect: 4 / 3});
    for (const time of [0, 150, 300]) gate.update(tracking(time, side !== 'right' ? middle : undefined, side !== 'left' ? middle : undefined), time);
    assert.equal(gate.update(tracking(300, middle), 300).blocked, true);
    assert.equal(gate.update(tracking(300, middle), 700).blocked, false);
    for (const time of [800, 950, 1100]) gate.update(tracking(time, middle), time);
    assert.equal(gate.update({...tracking(1100, middle), enabled: false}, 1100).blocked, false);
    gate.reset();
    assert.equal(gate.update(tracking(1200, middle), 1200).blocked, false);
  }
});

test('a prohibited gesture during preparation or countdown stops the attempt before capturing', async () => {
  for (const blockAt of [0, 750]) {
    let time = 0;
    await assert.rejects(prepareTrackedRecording({
      isReady: () => true, isCancelled: () => false,
      assertAllowed: () => assertGestureAllowed(time >= blockAt),
      now: () => time, delay: async ms => {time += ms;}, onWaiting() {}, onCountdown() {},
    }), {code: 'BLOCKED_GESTURE'});
  }
});

test('blocking before, during or after a capture discards all frames rather than returning them for upload', async () => {
  for (const phase of ['before', 'capture', 'delay']) {
    let blocked = phase === 'before', captures = 0;
    await assert.rejects(captureTrackedFrames({
      count: 2, isReady: () => true,
      assertAllowed: () => assertGestureAllowed(blocked),
      capture: async () => {captures++; if (phase === 'capture') blocked = true; return 'frame';},
      delay: async () => {if (phase === 'delay') blocked = true;}, onFrame() {},
    }), {code: 'BLOCKED_GESTURE'});
    assert.equal(captures, phase === 'before' ? 0 : 1);
  }
});
