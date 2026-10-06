import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
for (const script of ['import-public-lsch.mjs', 'sync-lsch-recordings.mjs', 'import-reviewed-clips.mjs', 'prepare-lsch-dataset.mjs', 'build-admin-snapshot.mjs']) {
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL(script, import.meta.url))], { stdio: 'inherit', windowsHide: true });
    child.on('error', reject); child.on('exit', code => resolve(code));
  });
  if (exitCode !== 0) { process.exitCode = exitCode || 1; break; }
}
