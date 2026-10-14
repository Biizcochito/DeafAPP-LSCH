import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createPythonBackendClient,trainingMetrics} from '../training/pythonBackendClient.js';

const session = {token:'a'.repeat(64),expiresAt:Date.now()+3600000};
test('the private training requests carry the existing admin session',async () => {
  const requests=[];
  const client=createPythonBackendClient('http://localhost:5000',session,{fetchImpl:async (url,options) => {
    requests.push({url,options});return {ok:true,json:async () => ({jobs:[]})};
  }});
  await client.status();await client.start('train');
  assert.equal(requests[0].options.headers.Authorization,`Bearer ${session.token}`);
  assert.equal(requests[0].url,'http://localhost:5000/admin/training');
  assert.deepEqual(JSON.parse(requests[1].options.body),{operation:'train'});
});
test('an expired session never contacts Python',async () => {
  let contacted=false;
  const client=createPythonBackendClient('http://localhost:5000',{...session,expiresAt:0},{fetchImpl:async () => {contacted=true;}});
  await assert.rejects(client.status(),/sesión terminó/);assert.equal(contacted,false);
});
test('arbitrary commands and identifiers cannot be sent',() => {
  const client=createPythonBackendClient('http://localhost:5000',session);
  assert.throws(() => client.start('delete'),/no válida/);
  assert.throws(() => client.cancel('../modelo'),/no válido/);
});
test('a legacy backend without training routes gives an actionable message',async () => {
  const client=createPythonBackendClient('http://localhost:5000',session,{fetchImpl:async () =>
    ({ok:false,status:404,json:async () => {throw new SyntaxError('HTML');}})});
  await assert.rejects(client.status(),/Inicia el backend integrado/);
});
test('the uploaded report separates overall accuracy from answered accuracy',async () => {
  const report=JSON.parse(await readFile(new URL('../backend/informe_entrenamiento.json',import.meta.url),'utf8'));
  const metrics=trainingMetrics(report);
  assert.equal(metrics.accuracy,'57,02 %');assert.equal(metrics.answeredAccuracy,'54,84 %');
  assert.equal(metrics.top3,'89,47 %');assert.equal(metrics.samples,114);assert.equal(metrics.answered,62);
  assert.equal(metrics.classes.length,19);
  assert.equal(trainingMetrics(null).accuracy,'Sin evaluación');
});
