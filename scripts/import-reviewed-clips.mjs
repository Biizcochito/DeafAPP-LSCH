import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createTrainingCapture } from '../trainingCapture.js';
import { auditRecording } from '../training/datasetPreparation.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const input = resolve(root, 'training/clips');
try {
  await mkdir(input, { recursive: true }); await mkdir(resolve(root, 'training/recordings'), { recursive: true });
  const annotations = JSON.parse(await readFile(resolve(root, 'training/reviewed-clips.json'), 'utf8'));
  if (!Array.isArray(annotations)) throw new Error('La lista de fragmentos revisados no es válida.');
  const imported = [], excluded = [];
  for (const annotation of annotations) {
    try {
      if (typeof annotation.framesFile !== 'string') throw new Error('Falta el archivo local del fragmento.');
      const path = resolve(input, annotation.framesFile);
      if (!path.startsWith(input + sep) || !path.endsWith('.json')) throw new Error('El archivo debe estar dentro de training/clips.');
      const clip = JSON.parse(await readFile(path, 'utf8'));
      const hash = createHash('sha256').update(JSON.stringify(clip.frames)).digest('hex');
      const training = createTrainingCapture({
        participantId: annotation.participantId, sessionId: annotation.sourceSessionId,
        source: 'public-reviewed-clip', participantIdentity: 'source-reviewed-participant', sourceUrl: annotation.sourceUrl,
        samples: clip.samples, platform: 'web', frameSize: clip.frameSize, jpegQuality: clip.jpegQuality,
      });
      const entry = {
        recording: { language: annotation.language, label: annotation.label, categoria: annotation.category,
          recordingId: `external-${hash}`, frames: clip.frames, intervalMs: clip.intervalMs, training },
        externalReview: { approved: annotation.approved, language: annotation.language, reviewer: annotation.reviewer,
          reviewedAt: annotation.reviewedAt, trainingAllowed: annotation.trainingAllowed, evidenceUrl: annotation.evidenceUrl,
          sourceUrl: annotation.sourceUrl, license: annotation.license, startSeconds: annotation.startSeconds, endSeconds: annotation.endSeconds },
        provenance: { source: 'reviewed-external-lsch-clip', importedAt: new Date().toISOString() },
      };
      if (!(annotation.startSeconds >= 0 && annotation.endSeconds > annotation.startSeconds)) throw new Error('Falta el intervalo de la seña en el video original.');
      const audit = auditRecording(entry);
      if (!audit.eligible) throw new Error(audit.reasons.join(', '));
      const annotationId = createHash('sha256').update(`${annotation.category}/${annotation.label}/${annotation.sourceUrl}`).digest('hex').slice(0, 16);
      const file = `external-${annotationId}-${hash}.json`;
      await writeFile(resolve(root, 'training/recordings', file), JSON.stringify(entry)); imported.push(file);
    } catch (error) { excluded.push({ sourceUrl: annotation.sourceUrl, label: annotation.label, reason: error.message }); }
  }
  const report = { imported, excluded, mediaDownloaded: 0 };
  await writeFile(resolve(root, 'training/external-import-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2)); if (excluded.length) process.exitCode = 1;
} catch (error) { console.error(error.message); process.exitCode = 1; }
