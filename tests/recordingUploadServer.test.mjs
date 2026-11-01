import test from 'node:test';
import assert from 'node:assert/strict';
import {createRecordingUploadHandler,recordingPayload} from '../src/storage/recordingUploadServer.js';
import {createRecordingDraft} from '../src/recording/recordingSubmission.js';
import {createConsentReceipt} from '../src/privacy/privacyConsent.js';
import {testChoices} from './fixtures/consent.mjs';
const token='a'.repeat(64),submittedAt='2026-11-01T12:00:00.000Z';
const draft=()=>createRecordingDraft({id:'upload-test',label:'hola',category:'saludos',frames:['/9j/2Q=='],now:123456789,consent:createConsentReceipt(testChoices,{now:123456000,id:'upload-consent'})});
function harness(overrides={}){
  const saved=[],calls=[];const handler=createRecordingUploadHandler({
    reserve:async input=>{calls.push(['reserve',input]);return {token,submittedAt};},
    writeVerified:async(path,bytes,hash)=>{saved.push({path,bytes,hash});},markReady:async input=>{calls.push(['ready',input]);},
    complete:async input=>{calls.push(['complete',input]);return {};},...overrides});
  return {saved,calls,send:(input,origin='https://deafapps.com')=>handler(new Request('https://api.test/recording-upload',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(input)}))};
}
test('el servidor conserva imágenes, datos, consentimiento y cuatro años desde el primer envío, antes de registrar',async()=>{
  const h=harness(),value=draft(),response=await h.send({action:'stage',draft:value}),result=await response.json();
  assert.equal(response.status,200);assert.equal(result.provider,'r2');assert.equal(result.token,token);
  const payload=JSON.parse(new TextDecoder().decode(h.saved[0].bytes));
  assert.deepEqual(payload.frames,value.frames);assert.deepEqual(payload.consent,value.consent);
  assert.deepEqual(payload.retention,{months:48,startsAt:submittedAt,expiresAt:'2030-11-01T12:00:00.000Z'});
  assert.equal(payload.recordingId,value.id);assert.equal(payload.schemaVersion,2);assert.equal(payload.language,'csg');
  assert.deepEqual(h.calls.map(call=>call[0]),['reserve','ready']);
  assert.equal((await h.send({action:'complete',path:value.storagePath,token})).status,200);
  assert.equal(h.calls.at(-1)[0],'complete');assert.ok(!JSON.stringify(result).includes('cloudflarestorage'));
});
test('los reintentos conservan exactamente el archivo y su huella, sin cambiar las fechas de conservación',async()=>{
  const h=harness();await h.send({action:'stage',draft:draft()});await h.send({action:'stage',draft:{...draft(),uploaded:true,uploadProvider:'r2'}});
  assert.deepEqual(h.saved[0].bytes,h.saved[1].bytes);assert.equal(h.saved[0].hash,h.saved[1].hash);
  assert.equal(h.calls[0][1].hash,h.calls[2][1].hash);
});
test('una copia no verificada nunca queda lista para registrarse',async()=>{
  const h=harness({writeVerified:async()=>{throw Error('R2 integrity mismatch');}});
  assert.equal((await h.send({action:'stage',draft:draft()})).status,503);
  assert.deepEqual(h.calls.map(call=>call[0]),['reserve']);
});
test('se rechazan orígenes ajenos, imágenes remotas, consentimiento anterior y plazos manipulados',async()=>{
  const h=harness();assert.equal((await h.send({action:'stage',draft:draft()},'https://evil.test')).status,403);
  for(const value of [{...draft(),frames:['https://other.test/image.jpg']},
    {...draft(),consent:{...draft().consent,noticeVersion:'anterior'}},
    {...draft(),consent:{...draft().consent,notice:{...draft().consent.notice,retentionMonths:24}}}])assert.notEqual((await h.send({action:'stage',draft:value})).status,200);
  assert.equal(h.calls.length,0);
});
test('conflictos, señas deshabilitadas y tokens inválidos no se confunden con envíos exitosos',async()=>{
  for(const [code,status] of [['40001',409],['22023',400]]){
    const h=harness({reserve:async()=>{throw Object.assign(Error('internal'),{code});}});
    const response=await h.send({action:'stage',draft:draft()});assert.equal(response.status,status);assert.ok(!(await response.text()).includes('internal'));
  }
  const h=harness();assert.equal((await h.send({action:'complete',path:draft().storagePath,token:'wrong'})).status,400);assert.equal(h.calls.length,0);
});
