import test from 'node:test';
import assert from 'node:assert/strict';
import {buildReviewedBrowserDataset,listApprovedRows,assertReviewSnapshotCurrent} from '../training/browserDataset.js';

test('admin preparation paginates approved rows and never downloads unknown vocabulary',async()=>{
  const rows=[{id:1,version:2,category:'saludos',label:'hola',path:'hola.json'},{id:2,version:1,category:'other',label:'unreviewed-label',path:'other.json'}];
  const calls=[],downloads=[];
  const api={list:async(session,options)=>{calls.push(options);assert.equal(session.token,'test-only-session');return {rows:[rows[options.page]],total:2};}};
  const client={storage:{from:bucket=>{assert.equal(bucket,'contribuciones');return {download:async path=>{downloads.push(path);return {data:new Blob([JSON.stringify({label:'hola',frames:[]})]),error:null};}};}}};
  const dataset=await buildReviewedBrowserDataset({api,client,session:{token:'test-only-session'}});
  assert.deepEqual(calls,[{status:'approved',page:0},{status:'approved',page:1}]);
  assert.deepEqual(downloads,['hola.json']);
  assert.equal(dataset.report.inputRecordings,2);assert.equal(dataset.report.acceptedRecordings,0);
  assert.deepEqual(dataset.reviewSnapshot,[{id:1,version:2},{id:2,version:1}]);
  assert.equal(dataset.quarantine.length,2);
  assert.deepEqual(dataset.quarantine.find(row=>row.classId==='other/unreviewed-label').reasons,['unknown-label-or-category']);
});

test('training refuses recordings removed from approval or reviewed again',async()=>{
  const dataset={reviewSnapshot:[{id:'7',version:3}]};
  const api=rows=>({list:async()=>({rows,total:rows.length})});
  await assertReviewSnapshotCurrent(dataset,api([{id:7,version:3}]),{});
  await assert.rejects(()=>assertReviewSnapshotCurrent(dataset,api([]),{}),/Cambió una revisión/);
  await assert.rejects(()=>assertReviewSnapshotCurrent(dataset,api([{id:7,version:4}]),{}),/Cambió una revisión/);
  await assert.rejects(()=>assertReviewSnapshotCurrent({},api([]),{}),/Vuelve a analizar/);
});

test('cancelled or unauthenticated requests cannot supply training rows',async()=>{
  const abort=new AbortController();abort.abort();let calls=0;
  await assert.rejects(()=>listApprovedRows({list:async()=>{calls++;}}, {},abort.signal),/cancelada/);
  assert.equal(calls,0);
  await assert.rejects(()=>buildReviewedBrowserDataset({api:{list:async()=>{throw new Error('Sesión vencida');}},session:{},client:{}}),/Sesión vencida/);
});
