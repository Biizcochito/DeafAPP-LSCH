import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { createTimedFetch } from '../src/recording/recordingSubmission.js';
import { buildMigrationPlan, selectedBatch, assertSourceCurrent, verifyRecordingBytes, sha256 } from './recording-migration/plan.mjs';
import { copyVerifiedOriginal } from './recording-migration/copy.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const privateDir = resolve(root, '.admin-private/storage-migration');
const rowColumns = 'id,label,categoria,archivo_path,aprobada,moderation_status,moderation_version';
const stamp = () => new Date().toISOString();
async function readJson(path) { return JSON.parse(await readFile(path, 'utf8')); }
async function saveJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  await rename(temporary, path);
}
async function optionalJson(path) { try { return await readJson(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } }
export async function makeSource() {
  const app = await readFile(resolve(root, 'App.js'), 'utf8');
  const url = process.env.SUPABASE_URL || app.match(/const SUPABASE_URL = "([^"]+)"/)?.[1];
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || app.match(/const SUPABASE_KEY = "([^"]+)"/)?.[1];
  if (!url || !key || !/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url)) throw Error('Falta la configuración de Supabase.');
  const client = createClient(url, key, { global: { fetch: createTimedFetch(fetch, 20_000) },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const requireResult = result => { if (result.error) throw Error('No se pudo leer el origen. Revisa el acceso a Supabase.'); return result.data; };
  async function manifest() {
    const value = requireResult(await client.rpc('deafapp_recognition_manifest'));
    if (!value?.ok || !Array.isArray(value.catalogue)) throw Error('El catálogo no está disponible.');
    return value;
  }
  return { project: url, manifest,
    async inventory() {
      const before = await manifest(), rows = [], objects = [];
      for (let offset = 0; ; offset += 500) {
        if (offset >= 10000) throw Error('Revisa el límite del inventario de grabaciones.');
        const page = requireResult(await client.from('grabaciones').select(rowColumns).order('id').range(offset, offset + 499));
        rows.push(...page); if (page.length < 500) break;
      }
      async function walk(prefix = '', depth = 0) {
        if (depth > 6 || objects.length > 10000) throw Error('Revisa el límite del inventario de archivos.');
        const folders = [];
        for (let offset = 0; ; offset += 500) {
          if (offset >= 10000) throw Error('Hay demasiados objetos en una carpeta.');
          const page = requireResult(await client.storage.from('contribuciones').list(prefix, { limit: 500, offset, sortBy: { column: 'name', order: 'asc' } }));
          for (const item of page) {
            const path = [prefix, item.name].filter(Boolean).join('/');
            if (item.id) objects.push({ ...item, path }); else folders.push(path);
          }
          if (page.length < 500) break;
        }
        for (const folder of folders) await walk(folder, depth + 1);
      }
      await walk();
      if ((await manifest()).revision !== before.revision) throw Error('El catálogo cambió durante el inventario. Vuelve a ejecutarlo.');
      return { checkedAt: stamp(), project: url, rows, objects, manifest: before, errors: [] };
    },
    async assertCurrent(item) {
      const rows = requireResult(await client.from('grabaciones').select(rowColumns).eq('id', item.sourceId).limit(1));
      const parts = item.path.split('/'), filename = parts.pop();
      const objects = requireResult(await client.storage.from('contribuciones').list(parts.join('/'), { search: filename, limit: 100 }));
      assertSourceCurrent(item, rows[0], objects.find(object => object.name === filename));
    },
    async download(item) {
      const data = requireResult(await client.storage.from('contribuciones').download(item.path));
      if (!data || data.size !== item.bytes) throw Error('El tamaño del original cambió.');
      return Buffer.from(await data.arrayBuffer());
    },
  };
}

export function makeBackup(project) {
  const backupDir = resolve(privateDir, 'backups', sha256(project).slice(0, 16));
  const filename = path => resolve(backupDir, `${sha256(path)}.json`);
  return {
    async read(path) { try { return await readFile(filename(path)); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } },
    async write(path, bytes) {
      await mkdir(backupDir, { recursive: true });
      await writeFile(filename(path), bytes, { flag: 'wx', mode: 0o600 });
    },
  };
}

export async function makeDestination() {
  const account = process.env.R2_ACCOUNT_ID, bucket = process.env.R2_MIGRATION_BUCKET;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID, secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!/^[a-f0-9]{32}$/.test(account || '') || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket || '') || !accessKeyId || !secretAccessKey) {
    throw Error('Falta configurar R2: cuenta, bucket privado y credenciales de objetos. No se copió nada a Cloudflare.');
  }
  const { S3Client, HeadObjectCommand, GetObjectCommand, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const s3 = new S3Client({ endpoint: `https://${account}.r2.cloudflarestorage.com`, region: 'auto',
    credentials: { accessKeyId, secretAccessKey }, maxAttempts: 2,
    requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' });
  const key = path => `contribuciones/${path}`;
  const requestOptions = () => ({ abortSignal: AbortSignal.timeout(60_000) });
  return { account, bucket,
    async head(path) {
      try {
        const result = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key(path) }), requestOptions());
        return { bytes: result.ContentLength, sha256: result.Metadata?.sha256 };
      } catch (error) { if (error.$metadata?.httpStatusCode === 404) return null; throw Error('No se pudo consultar el objeto R2.'); }
    },
    async putIfAbsent(path, bytes, metadata) {
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key(path), Body: bytes, ContentLength: bytes.byteLength,
        ContentType: 'application/json', StorageClass: 'STANDARD', IfNoneMatch: '*', Metadata: metadata }), requestOptions());
    },
    async download(path, expectedBytes) {
      const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key(path) }), requestOptions());
      if (result.ContentLength !== expectedBytes || !result.Body) { result.Body?.destroy?.(); throw Error('El tamaño de R2 no coincide.'); }
      const chunks = []; let bytes = 0;
      for await (const chunk of result.Body) {
        bytes += chunk.length;
        if (bytes > expectedBytes) { result.Body.destroy(); throw Error('R2 devolvió más bytes de los esperados.'); }
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    },
  };
}

export async function main(argv = process.argv.slice(2)) {
  const { positionals, values } = parseArgs({ args: argv, allowPositionals: true, options: { batch: { type: 'string', default: 'pilot' } } });
  const command = positionals[0];
  if (positionals.length !== 1 || !['inventory', 'plan', 'backup', 'copy'].includes(command)) {
    throw Error('Uso: node scripts/migrate-recordings-r2.mjs inventory|plan|backup|copy [--batch pilot]');
  }
  await mkdir(privateDir, { recursive: true });
  const inventoryFile = resolve(privateDir, 'inventory.json'), planFile = resolve(privateDir, 'plan.json');
  if (command === 'inventory') {
    const source = await makeSource(), inventory = await source.inventory();
    await saveJson(inventoryFile, inventory);
    console.log(JSON.stringify({ command, checkedAt: inventory.checkedAt, recordings: inventory.rows.length,
      files: inventory.objects.length, bytes: inventory.objects.reduce((sum, item) => sum + Number(item.metadata?.size || 0), 0), remoteWrites: 0 })); return;
  }
  if (command === 'plan') {
    const inventory = await readJson(inventoryFile);
    if (Date.now() - Date.parse(inventory.checkedAt) > 86_400_000 || !Number.isFinite(Date.parse(inventory.checkedAt))) throw Error('Actualiza el inventario antes de planificar.');
    const plan = buildMigrationPlan(inventory, inventory.manifest);
    await saveJson(planFile, plan);
    console.log(JSON.stringify({ command, totals: plan.totals, categories: plan.categories,
      batches: plan.batches.map(({ items, ...batch }) => batch), remoteWrites: 0 }, null, 2)); return;
  }
  const plan = await readJson(planFile), batch = selectedBatch(plan, values.batch), source = await makeSource();
  if (source.project !== plan.project || (await source.manifest()).revision !== plan.catalogueRevision) throw Error('Cambió el proyecto o el catálogo. Actualiza el inventario y el plan.');
  const backup = makeBackup(plan.project);
  if (command === 'backup') {
    const file = resolve(privateDir, `backup-${batch.id}.json`), previous = await optionalJson(file), files = [];
    for (const item of batch.items) {
      await source.assertCurrent(item);
      let bytes = await backup.read(item.path);
      const old = previous?.files?.find(value => value.path === item.path);
      if (bytes && !old) {
        const original = await source.download(item);
        if (verifyRecordingBytes(item, original) !== verifyRecordingBytes(item, bytes)) throw Error('El respaldo sin comprobante no coincide con el original.');
      }
      if (!bytes) { bytes = await source.download(item); verifyRecordingBytes(item, bytes); await source.assertCurrent(item); await backup.write(item.path, bytes); }
      const hash = verifyRecordingBytes(item, bytes);
      if (old && old.sha256 !== hash) throw Error('Cambió un respaldo previamente verificado.');
      await source.assertCurrent(item);
      files.push({ path: item.path, sourceId: item.sourceId, sourceVersion: item.sourceVersion, bytes: item.bytes, sha256: hash });
      await saveJson(file, { planDigest: plan.digest, project: plan.project, batch: batch.id, checkedAt: stamp(), files });
    }
    if ((await source.manifest()).revision !== plan.catalogueRevision) throw Error('El catálogo cambió. Se conservó el respaldo; actualiza el plan.');
    console.log(JSON.stringify({ command, batch: batch.id, files: files.length, bytes: batch.bytes, localBackupVerified: true, remoteWrites: 0 })); return;
  }
  // Only known inactive signs are accepted by selectedBatch. Active signs and
  // ambiguous imports remain deferred. Copying still cannot retire a source.
  const destination = await makeDestination(), receiptFile = resolve(privateDir, `r2-${destination.account}-${destination.bucket}-${batch.id}.json`);
  const state = await optionalJson(receiptFile) || { project: plan.project, account: destination.account, bucket: destination.bucket, files: [] };
  if (state.project !== plan.project) throw Error('El comprobante pertenece a otro proyecto.');
  const backupReceipt = await readJson(resolve(privateDir, `backup-${batch.id}.json`));
  if (backupReceipt.project !== plan.project || backupReceipt.planDigest !== plan.digest || backupReceipt.files.length !== batch.items.length) throw Error('Primero respalda y verifica este plan.');
  for (const item of batch.items) {
    const receipt = backupReceipt.files.find(value => value.path === item.path);
    if (!receipt || !await backup.read(item.path)) throw Error('Falta el original o el comprobante del respaldo.');
    await copyVerifiedOriginal({ item, source, destination, backup, receipt, onReceipt: async value => {
      state.files = [...state.files.filter(file => file.path !== value.path), value]; state.checkedAt = stamp();
      state.planDigest = plan.digest; state.sourceDeleted = false; state.databaseChanged = false;
      await saveJson(receiptFile, state);
    } });
    if ((await source.manifest()).revision !== plan.catalogueRevision) throw Error('Cambió el catálogo. Se conservaron las copias; detén la ampliación.');
  }
  console.log(JSON.stringify({ command, batch: batch.id, filesVerifiedInR2: state.files.length, bytes: batch.bytes, sourceDeleted: false,
    databaseChanged: false, productionReadPathChanged: false, storageFreedBytes: 0 }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    // Show our own operational messages, never raw SDK responses or JSON data.
    console.error(error?.constructor === Error ? error.message : 'La etapa no terminó. Revisa el inventario, el respaldo y el acceso configurado; se conservan los originales en Supabase.');
    process.exitCode = 1;
  });
}
