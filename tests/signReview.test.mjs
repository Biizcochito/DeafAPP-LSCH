import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdminClient} from '../adminClient.js';
import {segmentWatchUrl,validSegment,reviewExportText} from '../training/signReview.js';
const session=()=>({token:'a'.repeat(64),expiresAt:Date.now()+60000});
const row={key:'abcdefghijk@1250',videoId:'abcdefghijk',start:1.25,end:3.75,version:2};
test('la cola privada pagina y transmite la sesión sin aprobar candidatos',async()=>{
 const calls=[],api=createAdminClient({rpc:async(name,args)=>{calls.push({name,args});return {data:{ok:true,rows:[]}};}});
 await api.signReviewList(session(),{scope:'visible',status:'pending',query:"hola%'",page:2});
 assert.equal(calls.length,1);assert.equal(calls[0].name,'deafapp_admin_sign_review_list');
 assert.equal(calls[0].args.p_offset,50);assert.equal(calls[0].args.p_limit,25);assert.equal(calls[0].args.p_query,"hola%'");
 assert.throws(()=>api.signReviewList({...session(),expiresAt:0}),e=>e.code==='session_expired');assert.equal(calls.length,1);
});
test('las decisiones necesitan una versión y una etiqueta humana para confirmar',async()=>{
 const calls=[],api=createAdminClient({rpc:async(name,args)=>{calls.push({name,args});return {data:{ok:true}};}});
 await api.signReviewDecide(session(),row,'approved','hola');
 assert.equal(calls[0].args.p_version,2);assert.equal(calls[0].args.p_label,'hola');
 assert.throws(()=>api.signReviewDecide(session(),row,'approved',''));
 assert.throws(()=>api.signReviewDecide(session(),row,'rejected','hola'));
 assert.throws(()=>api.signReviewDecide(session(),{...row,version:2.5},'approved','hola'));
 assert.throws(()=>api.signReviewDecide(session(),{...row,key:"x');delete"},'rejected'));
 assert.throws(()=>api.signReviewDecide(session(),row,'automatic','hola'));
 assert.equal(calls.length,1);
});
test('un conflicto o una sesión vencida no se convierten en guardado correcto',async()=>{
 for(const code of ['40001','28000']){
  const api=createAdminClient({rpc:async()=>({error:{code}})});
  await assert.rejects(()=>api.signReviewDecide(session(),row,'approved','hola'),e=>e.code===(code==='40001'?'conflict':'session_expired'));
 }
});
test('los enlaces solo usan IDs válidos y la exportación conserva las decisiones explícitas',()=>{
 assert.equal(validSegment(row),true);assert.equal(segmentWatchUrl(row),'https://www.youtube.com/watch?v=abcdefghijk&t=1s');
 assert.equal(validSegment({...row,videoId:'javascript:alert(1)'}),false);
 assert.equal(validSegment({...row,end:NaN}),false);assert.equal(validSegment({...row,start:4}),false);
 const decisions={[row.key]:'hola','123456789ab@0':'descartar'};
 assert.deepEqual(JSON.parse(reviewExportText({decisions})),decisions);
 assert.throws(()=>reviewExportText({decisions:{'__proto__/x':'hola'}}));
 assert.throws(()=>reviewExportText({decisions:{[row.key]:{approved:true}}}));
});
