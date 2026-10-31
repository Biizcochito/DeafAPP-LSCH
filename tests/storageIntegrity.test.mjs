import test from 'node:test';
import assert from 'node:assert/strict';
import {createIntegrityGuard} from '../scripts/recording-migration/integrity.mjs';
function fixture(){let time=0,calls=0,revision='1',digest='original';
 const baseline={recordings:{count:435,digest:'original'},manifest:{ready:true,revision:'1'}};
 const guard=createIntegrityGuard({baseline,now:()=>time,snapshot:async()=>{calls++;return {recordings:{count:435,digest},manifest:{ready:true,revision}};},manifest:async()=>({ready:true,revision})});
 return {guard,calls:()=>calls,tick:()=>{time+=60000;},changeRow:()=>{digest='changed';},changeModel:()=>{revision='2';}};
}
test('full audits bound each batch and refresh after one minute',async()=>{
 const f=fixture();await f.guard();await f.guard();assert.equal(f.calls(),1);
 f.tick();await f.guard();assert.equal(f.calls(),2);await f.guard(true);assert.equal(f.calls(),3);
});
test('a model change is detected between full audits',async()=>{
 const f=fixture();await f.guard();f.changeModel();await assert.rejects(f.guard(),/catálogo o el modelo/);
});
test('a changed row is detected at the batch boundary and at the periodic audit',async()=>{
 for(const forced of [true,false]){const f=fixture();await f.guard();f.changeRow();if(!forced)f.tick();await assert.rejects(f.guard(forced),/base de datos o el modelo/);}
});
test('an unavailable audit fails closed without advancing its reference',async()=>{
 const f=fixture();f.changeRow();await assert.rejects(f.guard(),/base de datos/);await assert.rejects(f.guard(),/base de datos/);
});
