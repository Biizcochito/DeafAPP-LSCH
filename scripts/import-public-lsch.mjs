import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { parseCsv, buildLschSourceCatalog, TUB_REVISION } from '../training/sourceCatalog.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const rawBase = `https://raw.githubusercontent.com/DFKI-SignLanguage/TUB-Sign-Language-Corpus-Collection/${TUB_REVISION}/`;
const read = async path => {
  const response = await fetch(rawBase + path, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`No se pudo leer ${path}: HTTP ${response.status}`);
  const value = await response.text();
  if (value.length > 2_000_000) throw new Error('El catálogo supera el tamaño esperado.');
  return value;
};

try {
  const [channelsCsv, videosCsv, license] = await Promise.all(['catalogue/channels.csv', 'catalogue/videos.csv', 'LICENSE'].map(read));
  const catalog = buildLschSourceCatalog(parseCsv(channelsCsv), parseCsv(videosCsv), { retrievedAt: new Date().toISOString() });
  if (!catalog.videos.length) throw new Error('No se encontraron fuentes de LSCh. No se sustituyó el catálogo anterior.');
  catalog.inputHashes = Object.fromEntries([['channels.csv', channelsCsv], ['videos.csv', videosCsv]].map(([name, text]) => [name, createHash('sha256').update(text).digest('hex')]));
  const sourceDir = resolve(root, 'training/sources/tub');
  await mkdir(sourceDir, { recursive: true });
  await mkdir(resolve(root, 'public'), { recursive: true });
  for (const [name, content] of [['channels.csv', channelsCsv], ['videos.csv', videosCsv], ['LICENSE', license]]) await writeFile(resolve(sourceDir, name), content);
  const json = JSON.stringify(catalog, null, 2) + '\n';
  await writeFile(resolve(sourceDir, 'lsch-catalog.json'), json);
  await mkdir(resolve(root, 'admin'), { recursive: true });
  await writeFile(resolve(root, 'admin/catalog-snapshot.json'), json);
  await writeFile(resolve(root, 'public/lsch-catalog-LICENSE.txt'), license);
  console.log(JSON.stringify({ videos: catalog.videos.length, channels: catalog.channels.length, durationHours: Math.round(catalog.totalDurationSeconds / 360) / 10, rejected: catalog.rejected, revision: TUB_REVISION, mediaDownloaded: 0 }, null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
