// Work around expo-camera 57's web camera selection/error handling.
// Apply to both files: Metro can resolve the source or the compiled package.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', 'node_modules', 'expo-camera');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
if (version !== '57.0.3') {
  throw new Error(`Review the web camera lifecycle patch before applying it to expo-camera ${version}.`);
}
const files = ['src/web/WebCameraUtils.ts', 'build/web/WebCameraUtils.js'];
const replacements = [
  [
    "error instanceof OverconstrainedError && error.constraint === 'facingMode'",
    "typeof error === 'object' && error !== null && 'name' in error && error.name === 'OverconstrainedError' && 'constraint' in error && error.constraint === 'facingMode'",
  ],
  [
    "const key = facingMode === 'user' ? 'exact' : 'ideal';",
    "const key = 'ideal'; // Prefer the front camera without rejecting desktop webcams.",
  ],
];

for (const file of files) {
  const target = path.join(root, file);
  const original = fs.readFileSync(target, 'utf8');
  let patched = original;
  for (const [before, after] of replacements) {
    if (patched.includes(before)) {
      patched = patched.replace(before, after);
    } else if (!patched.includes(after)) {
      throw new Error(`Camera web patch no longer matches ${file}; review the installed expo-camera version.`);
    }
  }
  if (patched !== original) fs.writeFileSync(target, patched);
}
const streamPatch = fs.readFileSync(path.join(__dirname, 'expo-camera-web-stream.js'), 'utf8');
for (const file of ['src/web/useWebCameraStream.ts', 'build/web/useWebCameraStream.js']) {
  const target = path.join(root, file);
  if (fs.readFileSync(target, 'utf8') !== streamPatch) fs.writeFileSync(target, streamPatch);
}
console.log('expo-camera: web camera compatibility and lifecycle patches ready.');
