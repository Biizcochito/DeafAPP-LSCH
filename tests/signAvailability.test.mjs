import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdminClient} from '../src/admin/adminClient.js';
import {createMockAdminBackend,MOCK_ADMIN_PASSWORD} from '../src/admin/adminMock.js';
import {catalogueSeed,collectionCategories,collectionGroups} from '../src/training/recognitionCatalog.js';

const session=()=>({token:'a'.repeat(64),expiresAt:Date.now()+60000});

test('habilitar para grabar es independiente del estado y de las muestras del reconocedor',()=>{
  const base=catalogueSeed().find(row=>row.category==='familia');
  for(const state of ['collecting','testing','enabled','paused']){
    const row={...base,collection:true,state};
    assert.deepEqual(collectionCategories([row])[0].señas,[row.label]);
  }
  assert.deepEqual(collectionCategories([{...base,collection:false}]),[]);
  assert.deepEqual(collectionCategories([{...base,collection:true,aliasOf:'familia/otra'}]),[]);
});

test('una categoría completa incluye las señas ocultas y separa alias y homónimos',()=>{
  const catalogue=catalogueSeed(),groups=collectionGroups(catalogue),family=groups.find(row=>row.id==='familia');
  assert.equal(family.entries.length,17);assert.equal(family.enabled,0);
  const visible=collectionGroups(catalogue.map(row=>row.category==='familia'?{...row,collection:true}:row));
  assert.equal(visible.find(row=>row.id==='familia').enabled,17);
  assert.equal(visible.find(row=>row.id==='frutas_verduras').enabled,0);
  assert.equal(collectionGroups([{...family.entries[0],aliasOf:'familia/otra'}]).length,0);
});

test('publicar una categoría sin originales guarda versiones y no cambia el reconocimiento',async()=>{
  const calls=[],progress=[],entries=catalogueSeed().filter(row=>row.category==='familia');
  const api=createAdminClient({rpc:async(name,args)=>{calls.push({name,args});return {data:{ok:true,entry:{...args.p_entry,version:args.p_version+1}}};}});
  const result=await api.setCollection(session(),entries,true,{onProgress:(done,total)=>progress.push([done,total])});
  assert.equal(result.changed,17);assert.equal(calls.length,17);assert.deepEqual(progress.at(-1),[17,17]);
  calls.forEach(({name,args},i)=>{
    assert.equal(name,'deafapp_admin_vocabulary_save');assert.equal(args.p_token,session().token);
    assert.deepEqual(args.p_entry,{...entries[i],collection:true});assert.equal(args.p_version,entries[i].version);assert.equal(args.p_ack_prototype,false);
  });
  assert.equal(collectionCategories(result.entries)[0].señas.length,17);
  assert.equal((await api.setCollection(session(),result.entries,true)).changed,0);assert.equal(calls.length,17);
});

test('un conflicto informa el avance real, detiene el lote y permite reintentar pendientes',async()=>{
  const entries=catalogueSeed().filter(row=>row.category==='familia'),stored=new Map(entries.map(row=>[row.classId,row]));let calls=0;
  const api=createAdminClient({rpc:async(_name,args)=>{
    calls++;if(calls===2)return {error:{code:'40001'}};
    const entry={...args.p_entry,version:args.p_version+1};stored.set(entry.classId,entry);return {data:{ok:true,entry}};
  }});
  await assert.rejects(api.setCollection(session(),entries,true),error=>error.code==='conflict'&&error.changed===1&&/1 de 17/.test(error.message));
  assert.equal(calls,2);assert.equal([...stored.values()].filter(row=>row.collection).length,1);
  const result=await api.setCollection(session(),[...stored.values()],true);assert.equal(result.changed,16);
  assert.equal([...stored.values()].filter(row=>row.collection).length,17);
});

test('la publicación masiva rechaza sesiones vencidas, entradas repetidas y alias',async()=>{
  let called=0;const api=createAdminClient({rpc:async()=>{called++;return {data:{ok:true}};}}),entry=catalogueSeed()[0];
  await assert.rejects(api.setCollection({...session(),expiresAt:0},[entry],true),e=>e.code==='session_expired');
  for(const [rows,enabled]of [[[],true],[[entry,entry],true],[[{...entry,aliasOf:'saludos/otra'}],true],[[entry],'yes']])
    await assert.rejects(api.setCollection(session(),rows,enabled),e=>e.code==='invalid_input');
  assert.equal(called,0);
});

test('se puede crear, habilitar y ocultar una categoría sin muestras en el backend de prueba',async()=>{
  const api=createAdminClient(createMockAdminBackend()),active=await api.login(MOCK_ADMIN_PASSWORD);
  let data=await api.vocabulary(active),family=data.catalogue.filter(row=>row.category==='familia');
  assert.equal(data.coverage.find(row=>row.classId===family[0].classId)?.originals||0,0);
  await api.setCollection(active,family,true);data=await api.vocabulary(active);
  assert.equal(collectionCategories(data.catalogue).find(row=>row.id==='familia').señas.length,17);
  const example={...family[0],classId:'familia/prueba nueva',label:'prueba nueva',displayLabel:'Prueba nueva',collection:true,version:0,state:'collecting'};
  await api.saveVocabulary(active,example,{isNew:true});data=await api.vocabulary(active);
  assert.equal(collectionCategories(data.catalogue).find(row=>row.id==='familia').señas.length,18);
  await api.setCollection(active,data.catalogue.filter(row=>row.category==='familia'),false);data=await api.vocabulary(active);
  assert.equal(collectionCategories(data.catalogue).some(row=>row.id==='familia'),false);
  assert.equal(data.catalogue.filter(row=>row.category==='familia').length,18);
});
