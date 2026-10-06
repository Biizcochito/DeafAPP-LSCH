import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { createTimedFetch } from '../recordingSubmission.js';
const root = fileURLToPath(new URL('../', import.meta.url));
try {
  // Reuse only the app's existing public configuration; no privileged key is needed.
  const app = await readFile(resolve(root, 'App.js'), 'utf8');
  const url = process.env.SUPABASE_URL || app.match(/const SUPABASE_URL = "([^"]+)"/)?.[1];
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || app.match(/const SUPABASE_KEY = "([^"]+)"/)?.[1];
  if (!url || !key) throw new Error('Falta la configuración pública de Supabase.');
  const client = createClient(url, key, { global: { fetch: createTimedFetch(fetch, 15000) }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const rows = [];
  for (let offset = 0; offset < 10000; offset += 100) {
    const result = await client.from('grabaciones').select('id,label,categoria,archivo_path,aprobada,moderation_version').eq('aprobada', true).order('id').range(offset, offset + 99).abortSignal(AbortSignal.timeout(15000));
    if (result.error) throw new Error(`No se pudo consultar las grabaciones aprobadas: ${result.error.message}`);
    rows.push(...result.data);
    if (result.data.length < 100) break;
    if (offset === 9900) throw new Error('El conjunto supera 10.000 grabaciones. Ajusta el proceso antes de continuar.');
  }
  const output = resolve(root, 'training/recordings'); await mkdir(output, { recursive: true });
  const failures = [], files = []; let downloaded = 0, cached = 0, normalizedCategories = 0;
  for (const row of rows) {
    try {
      if (typeof row.archivo_path !== 'string' || row.archivo_path.includes('..') || !row.archivo_path.endsWith('.json')) throw new Error('Ruta de grabación no válida.');
      const name = createHash('sha256').update(row.archivo_path).digest('hex') + '.json';
      let previous;
      try { previous = JSON.parse(await readFile(resolve(output, name), 'utf8')); } catch {}
      if (previous?.serverReview?.storagePath === row.archivo_path && previous.recording?.label === row.label && previous.recording?.categoria === row.categoria) {
        previous.serverReview.version = row.moderation_version;
        await writeFile(resolve(output, name), JSON.stringify(previous));
        files.push(name); cached++; continue;
      }
      const result = await client.storage.from('contribuciones').download(row.archivo_path);
      if (result.error) throw new Error(result.error.message);
      if (result.data.size > 25_000_000) throw new Error('Grabación demasiado grande para este proceso.');
      const recording = JSON.parse(await result.data.text());
      if (recording.label !== row.label || (recording.categoria != null && recording.categoria !== row.categoria)) throw new Error('La etiqueta o categoría del archivo contradice el registro aprobado.');
      const categoryMissing = recording.categoria == null;
      if (categoryMissing) normalizedCategories++;
      await writeFile(resolve(output, name), JSON.stringify({
        ...(categoryMissing ? { originalRecording: recording } : {}),
        recording: categoryMissing ? { ...recording, categoria: row.categoria } : recording,
        serverReview: { approved: true, id: row.id, storagePath: row.archivo_path, version: row.moderation_version },
        provenance: { source: 'deafapp-supabase', retrievedAt: new Date().toISOString(), categoryFrom: categoryMissing ? 'approved-database-row' : 'recording-payload' },
      })); downloaded++;
      files.push(name);
    } catch (error) { failures.push({ id: row.id, reason: error.message }); }
  }
  const report = { approvedRows: rows.length, downloaded, cached, normalizedCategories, failures, writesToServer: 0 };
  await writeFile(resolve(root, 'training/sync-manifest.json'), JSON.stringify({ version: 1, retrievedAt: new Date().toISOString(), files }, null, 2) + '\n');
  await writeFile(resolve(root, 'training/sync-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  if (failures.length) process.exitCode = 1;
} catch (error) { console.error(error.message); process.exitCode = 1; }
