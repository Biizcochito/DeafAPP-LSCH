import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { createHandWorker } from "../handTrackingWorker.js";
import { warmSignTracking } from "../landmarkTracking.js";

test("hand worker transfers frames, correlates results and terminates pending requests", async () => {
  let worker;
  let closedBitmaps = 0;
  globalThis.document = { baseURI: "https://example.test/" };
  globalThis.createImageBitmap = async () => ({ close() { closedBitmaps++; } });
  globalThis.Worker = class {
    constructor(url) { worker = this; assert.equal(url.href, "https://example.test/hand-tracking-worker.js"); }
    postMessage(data, transfers) {
      if (data.type === "init") queueMicrotask(() => this.onmessage({ data: { id: data.id, type: "ready" } }));
      else { this.frame = data; assert.equal(transfers[0], data.image); }
    }
    terminate() { this.terminated = true; }
  };
  try {
    const detector = await createHandWorker();
    const frame = detector.detect({}, 100);
    await Promise.resolve();
    worker.onmessage({ data: { id: worker.frame.id + 5, type: "result", result: {} } });
    const result = { multiHandLandmarks: [[{ x: 0.2, y: 0.3 }]] };
    worker.onmessage({ data: { id: worker.frame.id, type: "result", result } });
    assert.equal(await frame, result);
    assert.equal(closedBitmaps, 1);
    const abandoned = detector.detect({}, 200);
    await Promise.resolve();
    detector.close();
    await assert.rejects(abandoned, /cerrado/);
    assert.equal(worker.terminated, true);
    assert.equal(closedBitmaps, 2);
  } finally { delete globalThis.Worker; delete globalThis.document; delete globalThis.createImageBitmap; }
});

test("worker initialization errors release the worker and permit a new attempt", async () => {
  let terminated = 0;
  globalThis.document = { baseURI: "https://example.test/" };
  globalThis.Worker = class {
    postMessage(data) { queueMicrotask(() => this.onmessage({ data: { id: data.id, type: "error", message: "model unavailable" } })); }
    terminate() { terminated++; }
  };
  try {
    await assert.rejects(createHandWorker(), /model unavailable/);
    await assert.rejects(createHandWorker(), /model unavailable/);
    assert.equal(terminated, 2);
  } finally { delete globalThis.Worker; delete globalThis.document; }
});

test("inference uses local GPU assets, monotonic timestamps and releases images on failure", async () => {
  const messages = [];
  const times = [];
  let options;
  let closed = 0;
  let fail = false;
  const self = { location: { href: "https://example.test/hand-tracking-worker.js" }, postMessage: data => messages.push(data) };
  const context = vm.createContext({ self, URL, OffscreenCanvas: class {
    constructor(width,height) {this.width=width;this.height=height;}
    getContext(){return {drawImage(){}};}
  }, importScripts(url) {
    assert.equal(url, "mediapipe/hands/vision_bundle.js");
    self.exports.FilesetResolver = { async forVisionTasks(url) { assert.equal(url, "https://example.test/mediapipe/hands/"); return {}; } };
    self.exports.HandLandmarker = { async createFromOptions(files, config) {
      options = config;
      return { detectForVideo(image, timestamp) {
        times.push(timestamp);
        if (fail) throw new Error("inference failed");
        return { landmarks: [[{x:0.2,y:0.3}]], handedness: [[{categoryName:"Left"}]] };
      } };
    } };
  } });
  vm.runInContext(await readFile(new URL("../public/hand-tracking-worker.js", import.meta.url), "utf8"), context);
  await self.onmessage({ data: { type: "init", id: 1 } });
  assert.equal(options.baseOptions.delegate, "GPU");
  assert.equal(options.baseOptions.modelAssetPath, "https://example.test/mediapipe/hands/hand_landmarker.task");
  assert.equal(options.numHands, 2);
  const image = { close() { closed++; } };
  await self.onmessage({ data: { type: "frame", id: 2, timestamp: 100, image } });
  await self.onmessage({ data: { type: "frame", id: 3, timestamp: 100, image } });
  assert.deepEqual(times, [100, 101]);
  assert.equal(messages[1].result.multiHandedness[0].label, "Right");
  fail = true;
  await self.onmessage({ data: { type: "frame", id: 4, timestamp: 110, image } });
  assert.equal(messages.at(-1).type, "error");
  assert.equal(closed, 3);
});

test("face and worker hands warm concurrently and retain the prepared detector", async () => {
  let faceStarted = false, handStarted = false, finishFace, finishHands, detector;
  globalThis.document = {
    baseURI: "https://example.test/",
    createElement(kind) {
      if (kind === "script") return { remove() {} };
      return { width: 0, height: 0, getContext: () => ({ fillRect() {}, drawImage() {} }) };
    },
    head: { appendChild(script) { assert.ok(script.src.includes("face_mesh")); queueMicrotask(() => script.onload()); } },
  };
  globalThis.window = { FACEMESH_CONTOURS: [], FaceMesh: class {
    setOptions() {}
    onResults(fn) { this.callback = fn; }
    send() { faceStarted = true; return new Promise(resolve => { finishFace = () => { this.callback({}); resolve(); }; }); }
    async close() {}
  } };
  globalThis.createImageBitmap = async () => ({ close() {} });
  globalThis.Worker = class {
    postMessage(data) {
      if (data.type === "init") queueMicrotask(() => this.onmessage({ data: { id: data.id, type: "ready" } }));
      else { handStarted = true; finishHands = () => this.onmessage({ data: { id: data.id, type: "result", result: {} } }); }
    }
    terminate() {}
  };
  try {
    const loading = warmSignTracking();
    for (let step = 0; step < 30; step++) await Promise.resolve();
    assert.equal(faceStarted, true);
    assert.equal(handStarted, true);
    finishFace(); finishHands();
    detector = await loading;
    assert.equal(detector.handBackend, "worker-gpu");
    assert.equal(await warmSignTracking(), detector);
  } finally {
    await detector?.close();
    delete globalThis.Worker; delete globalThis.document; delete globalThis.window; delete globalThis.createImageBitmap;
  }
});
