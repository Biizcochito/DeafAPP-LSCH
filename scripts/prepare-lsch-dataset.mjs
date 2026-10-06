import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareDataset } from '../training/datasetPreparation.js';
import { createTrainingPlan } from '../training/trainingPlan.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const input = resolve(root, 'training/recordings'), output = resolve(root, 'training/prepared');
try {
  await mkdir(input, { recursive: true }); await mkdir(output, { recursive: true });
  const entries = [], unreadable = [];
  let syncedFiles = new Set();
  try {
    const manifest = JSON.parse(await readFile(resolve(root, 'training/sync-manifest.json'), 'utf8'));
    if (manifest.version !== 1 || !Array.isArray(manifest.files)) throw new Error('Manifiesto de sincronización no válido.');
    syncedFiles = new Set(manifest.files);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  for (const file of (await readdir(input)).filter(name => name.endsWith('.json')).sort()) {
    try {
      const value = JSON.parse(await readFile(resolve(input, file), 'utf8'));
      if (value.provenance?.source === 'deafapp-supabase' && !syncedFiles.has(file)) {
        unreadable.push({ file, reasons: ['not-in-latest-approved-snapshot'] }); continue;
      }
      const recording = value.recording || value;
      const contentHash = createHash('sha256').update(JSON.stringify(recording.frames || [])).digest('hex');
      entries.push({ ...value, recording, file, contentHash });
    } catch { unreadable.push({ file, reasons: ['unreadable-json'] }); }
  }
  let participantAliases = {};
  try { participantAliases = JSON.parse(await readFile(resolve(root, 'training/participant-aliases.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error('No se pudo leer la equivalencia de participantes.'); }
  if (!participantAliases || Array.isArray(participantAliases) || typeof participantAliases !== 'object' ||
    !Object.entries(participantAliases).every(([key, value]) => /^[\w-]{1,100}$/.test(key) && typeof value === 'string' && /^[\w-]{1,100}$/.test(value))) throw new Error('Equivalencias de participantes no válidas.');
  const dataset = prepareDataset(entries, { participantAliases });
  dataset.quarantine.push(...unreadable);
  const usedFiles = new Set([...dataset.train,...dataset.evaluation].map(sample => sample.file));
  dataset.reviewSnapshot = entries.filter(entry => usedFiles.has(entry.file) && entry.serverReview?.approved).map(entry => ({id:String(entry.serverReview.id),version:entry.serverReview.version}));
  dataset.reviewedBundleVersion = 1;
  dataset.createdAt = new Date().toISOString();
  dataset.approvedCounts = {};
  for (const entry of entries) if (entry.serverReview?.approved || entry.externalReview?.approved) {
    const classId = `${entry.recording.categoria}/${entry.recording.label}`;
    dataset.approvedCounts[classId] = (dataset.approvedCounts[classId] || 0) + 1;
  }
  for (const [name, value] of Object.entries(dataset)) await writeFile(resolve(output, `${name}.json`), JSON.stringify(value, null, 2) + '\n');
  await writeFile(resolve(output, 'dataset.json'), JSON.stringify(dataset) + '\n');
  const plan = createTrainingPlan(dataset, { approvedCounts: dataset.approvedCounts });
  await writeFile(resolve(output, 'training-plan.json'), JSON.stringify(plan, null, 2) + '\n');
  const csv = value => '"' + String(value ?? '').replaceAll('"', '""') + '"';
  const fields = ['classId', 'category', 'label', 'recordings', 'declaredParticipants', 'trainingParticipants', 'evaluationParticipants', 'status'];
  await writeFile(resolve(output, 'coverage.csv'), [fields.join(','), ...dataset.report.classes.map(sign => fields.map(field => csv(sign[field])).join(','))].join('\n') + '\n');
  const { classes: _classes, ...summary } = dataset.report;
  console.log(JSON.stringify({ ...summary, quarantined: dataset.quarantine.length, readyClasses: plan.readyClasses.length, output: 'training/prepared' }, null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
