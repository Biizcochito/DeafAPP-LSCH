// Train a private temporal candidate from reviewed originals. No video download or automatic labels.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {randomBytes} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {VISIBLE_TARGETS} from '../src/training/trainingAssistant.js';
import {SEQUENCE_CANDIDATE_FORMAT,sequenceReferences,validateSequenceCandidate,predictSequenceCandidate} from '../src/training/sequenceCandidate.js';
const args=process.argv.slice(2),option=name=>args[args.indexOf(name)+1],read=async file=>JSON.parse((await readFile(resolve(file),'utf8')).replace(/^\uFEFF/,''));
if(!args.includes('--dataset')||!args.includes('--output'))throw Error('Uso: node scripts/train-sequence-candidate.mjs --dataset datos.json --output .admin-private/candidato [--evaluation pruebas.json]');
const output=resolve(option('--output')),privateRoot=resolve('.admin-private'),fromPrivate=relative(privateRoot,output);
if(!fromPrivate||fromPrivate.startsWith('..')||isAbsolute(fromPrivate))throw Error('Guarda los pesos en una subcarpeta privada de .admin-private.');
const dataset=await read(option('--dataset')),evaluation=args.includes('--evaluation')?await read(option('--evaluation')):[],allowed=new Set(VISIBLE_TARGETS.filter(row=>row.category!=='oraciones').map(row=>row.classId));
if(!Array.isArray(dataset.train)||!Array.isArray(evaluation))throw Error('Dataset incompatible.');
const references=sequenceReferences([...dataset.train,...evaluation]),classes=[...new Set(references.map(row=>row.classId))].sort();
if(classes.some(id=>!allowed.has(id)))throw Error('El dataset contiene señas ajenas al catálogo visible.');
const model={format:SEQUENCE_CANDIDATE_FORMAT,version:1,id:randomBytes(16).toString('hex'),createdAt:new Date().toISOString(),inputShape:[32,171],classes,
 references:references.map(row=>({...row,sequence:row.sequence.map(frame=>frame.map(value=>Math.round(value*100000)/100000))})),
 enabledClasses:args.includes('--enable')?option('--enable').split(','):classes,
 decision:{maximumDistance:.35,minimumRelativeMargin:.25,calibrated:false},featureLayout:'hand-shape-position-dtw-v1',publicActivation:false,wholePhraseOnly:false};
validateSequenceCandidate(model);
const results=evaluation.map(row=>({...Object.fromEntries(['classId','recordingId','parentHash','source'].map(k=>[k,row[k]])),prediction:predictSequenceCandidate(model,row.features)}));
const correct=results.filter(row=>row.prediction.accepted&&row.prediction.classId===row.classId).length;
model.report={modelId:model.id,classes,architecture:model.featureLayout,enabledClasses:model.enabledClasses,trainOriginals:model.references.length,trainVariants:model.references.length,evaluationSamples:results.length,correct,accuracy:results.length?correct/results.length:null,results,participantIndependenceTested:false,unknownGesturesEvaluated:false,publicActivation:false,evaluationScope:'held-out-recordings-and-context-videos-not-independent-people',status:'private-candidate-needs-user-validation'};
await mkdir(output,{recursive:true});
for(const [name,value] of Object.entries({'modelo.json':model,'informe.json':model.report,'training-candidate.json':{encoding:'gzip-base64',data:gzipSync(JSON.stringify(model)).toString('base64')}}))await writeFile(resolve(output,name),JSON.stringify(value,null,2));
console.log(JSON.stringify({modelId:model.id,classes:classes.length,originals:model.references.length,evaluationSamples:results.length,correct,results:results.map(row=>({expected:row.classId,...row.prediction})),output}));
