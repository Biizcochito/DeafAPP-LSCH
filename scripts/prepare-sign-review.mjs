import {canonicalPhraseLabel} from '../training/phraseLabels.js';
// Prepara metadatos privados para importar; no confirma candidatos ni modifica el entrenamiento.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {execFileSync} from 'node:child_process';
import {CATEGORIAS,CATEGORIAS_VISIBLES} from '../signCatalog.js';
import {validCandidateKey,validSegment} from '../training/signReview.js';
const [sourceArg,outputArg]=process.argv.slice(2);
if(!sourceArg||!outputArg)throw Error('Uso: node scripts/prepare-sign-review.mjs <Proyecto_LSCh> <carpeta .admin-private>');
const root=process.cwd(),source=resolve(sourceArg),output=resolve(outputArg),privateRoot=resolve(root,'.admin-private');
const rel=relative(privateRoot,output);if(!rel||rel.startsWith('..')||isAbsolute(rel))throw Error('La salida debe estar dentro de .admin-private.');
const readJson=async path=>JSON.parse((await readFile(path,'utf8')).replace(/^\uFEFF/,''));
const commit=execFileSync('git',['-C',source,'rev-parse','HEAD'],{encoding:'utf8'}).trim();if(!/^[a-f0-9]{40}$/.test(commit))throw Error('Falta un commit de origen válido.');
const rows=await readJson(resolve(source,'youtube_lsch/yt/candidatos.json'));
if(!Array.isArray(rows)||!rows.length||rows.length>10000)throw Error('Lista de candidatos inválida.');
const visibleLabels=[...new Set(CATEGORIAS_VISIBLES.flatMap(c=>c.señas))],visible=new Set(visibleLabels);
const labels=[...new Set([...CATEGORIAS.flatMap(c=>c.señas),...rows.map(r=>r.etiqueta).filter(Boolean)])].sort();
if(labels.some(label=>typeof label!=='string'||!label.trim()||label.length>80))throw Error('Etiqueta inválida.');
const safeText=(value,max)=>String(value??'').slice(0,max),seen=new Set(),metas=new Map(),prepared=[];
for(const row of rows){
 const proposedLabel=canonicalPhraseLabel(row.etiqueta);
 const segment={key:row.clave,videoId:row.id,start:row.inicio,end:row.fin};
 if(!validSegment(segment)||!validCandidateKey(row.clave)||seen.has(row.clave)||!Number.isFinite(row.confianza)||row.confianza<0||row.confianza>1)throw Error('Segmento duplicado o inválido.');
 if(row.etiqueta!=null&&!labels.includes(row.etiqueta))throw Error('Etiqueta ajena al catálogo de importación.');
 seen.add(row.clave);
 if(!metas.has(row.id))metas.set(row.id,await readJson(resolve(source,'youtube_lsch/youtube/meta',row.id+'.json')));
 const meta=metas.get(row.id);
 prepared.push({key:row.clave,video_id:row.id,start_seconds:row.inicio,end_seconds:row.fin,proposed_label:proposedLabel||null,confidence:row.confianza,priority:visible.has(proposedLabel),source_commit:commit,
  metadata:{sourceLabel:row.etiqueta||null,title:safeText(meta.titulo,300),channel:safeText(meta.canal,160),license:safeText(meta.licencia,120),source:safeText(row.fuente,80),evidence:safeText(row.evidencia,1800),alternatives:(row.alternativas||[]).filter(x=>typeof x==='string').slice(0,8).map(x=>safeText(x,80))}});
}
await mkdir(output,{recursive:true});
const literal=value=>"'"+JSON.stringify(value).replaceAll("'","''")+"'::jsonb";
const config={labels,visibleLabels,sourceRepository:'Biizcochito/Proyecto_LSCh',sourceCommit:commit,rawPointsIncluded:false,automaticApproval:false};
const configSql=`-- Importación privada autorizada por el administrador en el backend DeafApp verificado.\ninsert into deafapp_private.admin_data(name,value) values('sign-review-config',${literal(config)}) on conflict(name) do update set value=excluded.value,updated_at=now();\nselect jsonb_array_length(value->'labels') as labels from deafapp_private.admin_data where name='sign-review-config';`;
await writeFile(resolve(output,'config.sql'),configSql);
const columns='key,video_id,start_seconds,end_seconds,proposed_label,confidence,metadata,priority,source_commit';
const recordType='key text,video_id text,start_seconds double precision,end_seconds double precision,proposed_label text,confidence double precision,metadata jsonb,priority boolean,source_commit text';
const chunks=[];
for(let i=0;i<prepared.length;i+=40){
 const file=`candidates-${String(chunks.length).padStart(3,'0')}.sql`,batch=prepared.slice(i,i+40);
 const sql=`-- Solo metadatos de candidatos pendientes. No se importan vídeos, puntos ni aprobaciones.\nwith added as (insert into deafapp_private.sign_review_candidates(${columns}) select ${columns} from jsonb_to_recordset(${literal(batch)}) as r(${recordType}) on conflict(key) do nothing returning 1) select count(*) as imported from added;`;
 await writeFile(resolve(output,file),sql);chunks.push(file);
}
const manifest={sourceCommit:commit,total:prepared.length,priority:prepared.filter(r=>r.priority).length,proposed:prepared.filter(r=>r.proposed_label).length,automaticApprovals:0,configFile:'config.sql',chunks};
await writeFile(resolve(output,'manifest.json'),JSON.stringify(manifest,null,2));
await writeFile(resolve(output,'candidates.json'),JSON.stringify(prepared));
console.log(JSON.stringify(manifest));
