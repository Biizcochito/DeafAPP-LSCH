import {sha256} from './plan.mjs';

// Full feature/model hashing is expensive on a Nano database. Perform it at
// batch boundaries and at least once per minute, while checking the live
// catalogue/model on every intervening guard. Each source file still has its
// own approval, version, object and byte checks immediately before retirement.
export function createIntegrityGuard({baseline,snapshot,manifest,now=Date.now,intervalMs=60_000}){
  let checkedAt=null;
  const same=(a,b)=>sha256(JSON.stringify(a))===sha256(JSON.stringify(b));
  return async function integrity(force=false){
    if(force||checkedAt===null||now()-checkedAt>=intervalMs){
      if(!same(await snapshot(),baseline))throw Error('Cambió la base de datos o el modelo; se detuvo el retiro.');
      checkedAt=now();
    }else if(!same(await manifest(),baseline.manifest))throw Error('Cambió el catálogo o el modelo; se detuvo el retiro.');
  };
}
