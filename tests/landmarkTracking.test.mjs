import assert from "node:assert/strict";
import { test } from "node:test";
import { combineSignResults, createSignTracker, drawSignLandmarks, loadHolistic, mapCroppedHands, mergeHandDetections, warmSignTracking } from "../landmarkTracking.js";
import { freshLandmarks, landmarkViewport, withTrackingTimeout } from "../trackingOverlay.js";

test("a failed download can retry, and concurrent callers wait for the same script", async () => {
  const scripts = [];
  globalThis.document = {
    createElement: () => ({ remove() { this.removed = true; } }),
    head: { appendChild: script => scripts.push(script) },
  };
  globalThis.window = {};
  const failed = loadHolistic();
  const rejected = assert.rejects(failed, /descargar/);
  scripts[0].onerror();
  await rejected;
  assert.equal(scripts[0].removed, true);

  const first = loadHolistic();
  const second = loadHolistic();
  assert.equal(first, second);
  assert.equal(scripts.length, 2);
  let resolved = false;
  first.then(() => { resolved = true; });
  await Promise.resolve();
  assert.equal(resolved, false);
  window.Holistic = class Holistic {};
  window.HAND_CONNECTIONS = [[0, 1]];
  window.FACEMESH_CONTOURS = [[0, 1]];
  scripts[1].onload();
  assert.equal(await first, window.Holistic);
});

test("face and both hands are retained when the body is absent; raw webcam handedness is corrected", () => {
  const face = Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.25 }));
  const rightHand = Array.from({ length: 21 }, () => ({ x: 0.25, y: 0.5 }));
  const leftHand = Array.from({ length: 21 }, () => ({ x: 0.75, y: 0.5 }));
  const results = combineSignResults({}, { multiFaceLandmarks: [face] }, {
    multiHandLandmarks: [rightHand, leftHand],
    multiHandedness: [{ label: "Left" }, { label: "Right" }],
  });
  assert.equal(results.poseLandmarks, undefined);
  assert.equal(results.faceLandmarks, face);
  assert.equal(results.rightHandLandmarks, rightHand);
  assert.equal(results.leftHandLandmarks, leftHand);
  const empty = combineSignResults({}, {}, {});
  assert.equal(empty.faceLandmarks, undefined);
  assert.equal(empty.leftHandLandmarks, undefined);
  assert.equal(empty.rightHandLandmarks, undefined);
});

test("a left hand is preserved when it appears alone or the detector reverses the order", () => {
  const leftHand = Array.from({ length: 21 }, () => ({ x: 0.8, y: 0.5 }));
  const rightHand = Array.from({ length: 21 }, () => ({ x: 0.2, y: 0.5 }));
  const single = combineSignResults({}, {}, {
    multiHandLandmarks: [leftHand], multiHandedness: [{ label: "Right" }],
  });
  assert.equal(single.leftHandLandmarks, leftHand);
  assert.equal(single.rightHandLandmarks, undefined);
  const reversed = combineSignResults({}, {}, {
    multiHandLandmarks: [leftHand, rightHand], multiHandedness: [{ label: "Right" }, { label: "Left" }],
  });
  assert.equal(reversed.leftHandLandmarks, leftHand);
  assert.equal(reversed.rightHandLandmarks, rightHand);
});

test("recovered left-hand points return to full-frame coordinates without duplicating the other palm", () => {
  const hand = (x, y, z = -0.1) => Array.from({ length: 21 }, () => ({ x, y, z }));
  const primary = { multiHandLandmarks: [hand(0.2, 0.5)], multiHandedness: [{ label: "Left" }] };
  const recovered = mapCroppedHands({
    multiHandLandmarks: [hand(0.8, 0.5)], multiHandedness: [{ label: "Right" }],
  }, { x: 0.35, y: 0, width: 0.65, height: 1 });
  assert.ok(Math.abs(recovered.multiHandLandmarks[0][0].x - 0.87) < 1e-10);
  assert.equal(recovered.multiHandLandmarks[0][0].y, 0.5);
  assert.equal(recovered.multiHandLandmarks[0][0].z, -0.065);
  const merged = mergeHandDetections(primary, recovered);
  const result = combineSignResults({}, {}, merged);
  assert.equal(result.leftHandLandmarks.length, 21);
  assert.equal(result.rightHandLandmarks.length, 21);
  const duplicate = mergeHandDetections(primary, {
    multiHandLandmarks: [hand(0.22, 0.51)], multiHandedness: [{ label: "Left" }],
  });
  assert.equal(duplicate.multiHandLandmarks.length, 1);
  const padded = mapCroppedHands({ multiHandLandmarks: [hand(0.5, 0.5)] }, {
    x: -0.2, y: -0.2, width: 1.4, height: 1.4,
  });
  assert.ok(Math.abs(padded.multiHandLandmarks[0][0].x - 0.5) < 1e-10);
  assert.ok(Math.abs(padded.multiHandLandmarks[0][0].y - 0.5) < 1e-10);
});

test("drawing uses video coordinates and distinct face/hand colors; absent detections leave no marks", () => {
  globalThis.window = { HAND_CONNECTIONS: [[0, 1]], FACEMESH_CONTOURS: [[0, 1]] };
  const lines = [];
  const dots = [];
  const ctx = {
    canvas: { width: 640, height: 480 },
    save() {}, restore() {}, beginPath() {}, stroke() {}, fill() {},
    moveTo(x, y) { this.start = [x, y]; },
    lineTo(x, y) { lines.push({ from: this.start, to: [x, y], color: this.strokeStyle }); },
    arc(x, y) { dots.push({ x, y, color: this.fillStyle }); },
  };
  const hand = [{ x: 0.25, y: 0.5 }, { x: 0.5, y: 0.75 }];
  const face = Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.25 }));
  drawSignLandmarks(ctx, { faceLandmarks: face, rightHandLandmarks: hand, leftHandLandmarks: hand });
  assert.deepEqual(lines.map(line => line.color), ["#F7DC6F", "#4ECDC4", "#79B8FF"]);
  assert.deepEqual(lines[1], { from: [160, 240], to: [320, 360], color: "#4ECDC4" });
  assert.equal(dots.filter(dot => dot.color === "#F7DC6F").length, 42);
  assert.ok(dots.filter(dot => dot.color === "#F7DC6F").every(dot => dot.x === 320 && dot.y === 120));
  lines.length = 0;
  dots.length = 0;
  drawSignLandmarks(ctx, {});
  assert.equal(lines.length, 0);
  assert.equal(dots.length, 0);
  assert.doesNotThrow(() => drawSignLandmarks(ctx, { rightHandLandmarks: [{ x: NaN, y: 0 }] }));
});

test("a stalled hand model does not block moving face results or enqueue more hand frames", async () => {
  let finishHands;
  let handSends = 0;
  const faceFrames = [];
  class Face {
    setOptions() {}
    onResults(fn) { this.callback = fn; }
    async send({ image }) {
      assert.equal(image.width, 640);
      this.callback({ multiFaceLandmarks: [[{ x: image.marker, y: 0.5 }]] });
    }
    async close() {}
  }
  class Hands {
    setOptions(options) { assert.equal(options.maxNumHands, 2); assert.equal(options.modelComplexity, 1); }
    onResults(fn) { this.callback = fn; }
    async reset() { assert.fail('live hand tracking must never reset the WASM graph'); }
    send() {
      handSends++;
      if (handSends === 1) { this.callback({}); return Promise.resolve(); }
      return new Promise(resolve => { finishHands = () => { this.callback({}); resolve(); }; });
    }
    async close() {}
  }
  globalThis.window = { FaceMesh: Face, Hands, HAND_CONNECTIONS: [], FACEMESH_CONTOURS: [] };
  globalThis.document = {
    createElement(kind) {
      if (kind === "script") return { remove() {} };
      const canvas = { width: 0, height: 0 };
      canvas.getContext = () => ({ drawImage(image) { canvas.marker = image.marker; }, fillRect() {} });
      return canvas;
    },
    head: { appendChild(script) { queueMicrotask(() => script.onload()); } },
  };
  const tracker = await createSignTracker();
  const image = { width: 1280, height: 960, marker: 0.2 };
  await tracker.sendFace({ image });
  await tracker.sendHands({ image });
  tracker.onResults(result => faceFrames.push(result.faceLandmarks?.[0]?.x));
  const handJob = tracker.sendHands({ image });
  await Promise.resolve();
  await tracker.sendFace({ image });
  image.marker = 0.7;
  await tracker.sendFace({ image });
  assert.deepEqual(faceFrames, [0.2, 0.7]);
  assert.equal(tracker.sendHands({ image }), handJob);
  assert.equal(handSends, 2);
  finishHands();
  await handJob;
  await tracker.close();
});

test("old points expire independently and a hung detector produces a timeout", async () => {
  const face = [{ x: 0.3, y: 0.4 }];
  const hand = [{ x: 0.7, y: 0.5 }];
  const result = freshLandmarks({ faceLandmarks: face, leftHandLandmarks: hand, faceTime: 1000, handTime: 1600 }, 1700);
  assert.equal(result.faceLandmarks, undefined);
  assert.equal(result.leftHandLandmarks, hand);
  assert.equal(freshLandmarks({ faceLandmarks: face, faceTime: 1000 }, 1500).faceLandmarks, face);
  assert.equal(await withTrackingTimeout(Promise.resolve(42), 100), 42);
  await assert.rejects(withTrackingTimeout(new Promise(() => {}), 5), /tardó demasiado/);
});

test("cover cropping and selfie mirroring place off-centre points over the displayed video", () => {
  const viewport = landmarkViewport(640, 480, 600, 480, { objectFit: "cover", objectPosition: "50% 50%", transform: "matrix(-1, 0, 0, 1, 0, 0)" });
  assert.equal(viewport.x, -20);
  assert.equal(viewport.y, 0);
  assert.equal(viewport.mirrored, true);
  const displayedX = 600 - (viewport.x + 0.25 * viewport.drawWidth);
  assert.equal(displayedX, 460);
  const tall = landmarkViewport(640, 480, 300, 600, { objectFit: "cover", transform: "none" });
  assert.equal(tall.x, -250);
  assert.equal(tall.drawHeight, 600);
  assert.equal(tall.mirrored, false);
});

test("interleaved live detectors retain the other channel until its next completed result", async () => {
  let finishFace;
  let finishHands;
  class Face {
    calls = 0;
    setOptions() {}
    onResults(fn) { this.callback = fn; }
    send() {
      this.calls++;
      if (this.calls === 2) return new Promise(resolve => {
        finishFace = () => { this.callback({ multiFaceLandmarks: [[{ x: 0.8, y: 0.5 }]] }); resolve(); };
      });
      this.callback({ multiFaceLandmarks: [[{ x: this.calls === 1 ? 0.2 : 0.9, y: 0.5 }]] });
      return Promise.resolve();
    }
    async close() {}
  }
  class Hands {
    calls = 0;
    setOptions() {}
    onResults(fn) { this.callback = fn; }
    async reset() {}
    send() {
      this.calls++;
      if (this.calls === 3) return new Promise(resolve => {
        finishHands = () => { this.callback({}); resolve(); };
      });
      const hand = Array.from({ length: 21 }, () => ({ x: 0.7, y: 0.5 }));
      this.callback({ multiHandLandmarks: [hand, hand], multiHandedness: [{ label: 'Right' }, { label: 'Left' }] });
      return Promise.resolve();
    }
    async close() {}
  }
  globalThis.window = { FaceMesh: Face, Hands, HAND_CONNECTIONS: [], FACEMESH_CONTOURS: [] };
  const tracker = await createSignTracker();
  let latest;
  tracker.onResults(value => { latest = value; });
  const image = { width: 640, height: 480 };
  await tracker.sendFace({ image });
  await tracker.sendHands({ image });
  const faceJob = tracker.sendFace({ image });
  await tracker.sendHands({ image });
  assert.equal(latest.faceLandmarks[0].x, 0.2, 'hands must not publish an empty in-flight face');
  finishFace();
  await faceJob;
  const handJob = tracker.sendHands({ image });
  await tracker.sendFace({ image });
  assert.equal(latest.leftHandLandmarks.length, 21, 'face must not publish empty in-flight hands');
  assert.equal(latest.rightHandLandmarks.length, 21);
  finishHands();
  await handJob;
  assert.equal(latest.leftHandLandmarks, undefined, 'a completed empty detection must remove the missing hand');
  await tracker.close();
});
test("preloading retries failures, initializes hands first and reuses warm graphs across signs", async () => {
  const sends = [];
  let handInstances = 0;
  let fail = true;
  class Hands {
    constructor() { handInstances++; }
    setOptions() {}
    onResults(fn) { this.callback = fn; }
    async send() {
      sends.push("hands");
      if (fail) { fail = false; throw new Error("download failed"); }
      this.callback({});
    }
    async close() {}
  }
  class Face {
    setOptions() {}
    onResults(fn) { this.callback = fn; }
    async send() { sends.push("face"); this.callback({}); }
    async close() {}
  }
  globalThis.window = { Hands, FaceMesh: Face, HAND_CONNECTIONS: [], FACEMESH_CONTOURS: [] };
  globalThis.document = {
    createElement() {
      return { width: 0, height: 0, getContext: () => ({ fillRect() {}, drawImage() {} }) };
    },
  };
  await assert.rejects(warmSignTracking(), /download failed/);
  const first = warmSignTracking();
  assert.equal(warmSignTracking(), first);
  const tracker = await first;
  assert.deepEqual(sends, ["hands", "hands", "face"]);
  assert.equal(await warmSignTracking(), tracker);
  assert.equal(handInstances, 2);
  assert.equal(sends.length, 3, "reopening a sign must not repeat detector initialization");
});
