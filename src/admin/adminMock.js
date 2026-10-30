// Backend de administración SIMULADO, solo para probar la interfaz en local. No usa Supabase.
// Se activa únicamente con EXPO_PUBLIC_ADMIN_MOCK=1 en localhost (ver App.js y scripts/web-mock-admin.cjs).
// Contraseña de prueba: no es la del panel real.
export const MOCK_ADMIN_PASSWORD = "deafapp-prueba-local";
import {catalogueSeed,catalogueKey,validateCatalogueEntry} from '../training/recognitionCatalog.js';
import {prepareControlledModel} from '../training/controlledModel.js';
import {encodeRuntimePackage} from '../training/runtimePackage.js';

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const SAMPLE = [
  ["saludos", "hola"], ["saludos", "adios"], ["saludos", "buenos dias"], ["alimentos", "cerdo"], ["alimentos", "pollo"],
  ["alimentos", "arroz"], ["tiempo", "dia"], ["tiempo", "noche"], ["familia", "mama"], ["familia", "papa"],
];

function seedRecordings() {
  const states = ["pending", "pending", "approved", "rejected"];
  return Array.from({ length: 58 }, (_, i) => {
    const [category, label] = SAMPLE[i % SAMPLE.length];
    const id = String(1000 - i);
    return { id, label, category, path: `mock/${id}.json`, status: states[i % states.length], version: 0, createdAt: new Date(Date.now() - i * 3_600_000).toISOString() };
  });
}

const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
const reply = data => Promise.resolve({ data, error: null });
const fail = code => Promise.resolve({ data: null, error: { code, message: code } });

export function createMockAdminBackend() {
  const rows = seedRecordings();
  const catalogue=catalogueSeed(),assignments=new Map();let prepared;
  const getPrepared=()=>prepared||=prepareControlledModel(catalogue,['saludos/hola','necesidades/agua'].flatMap((classId,c)=>Array.from({length:4},(_,i)=>({id:`${c*10+i+1}`,classId,hash:`mock-${c}-${i}`,role:'train',person:`P0${i+1}`,personConfirmed:true,sequence:Array.from({length:32},(_,t)=>Array.from({length:88},(_,k)=>k<42?c*.8+t*.005+i*.0001+k*.002:k===42?1:0))})))).then(async result=>({...result,packet:await encodeRuntimePackage(result.model)}));
  const sessions = new Map();
  let failures = [];
  let lockedUntil = 0;

  function auth(token) {
    const expiresAt = sessions.get(token);
    return expiresAt && expiresAt > Date.now();
  }

  const handlers = {
    deafapp_recognition_revision(){return reply({ok:true,ready:true,preparing:false,revision:'1:1:1'});},
    async deafapp_admin_vocabulary_list({p_token}) {
      if(!auth(p_token))return fail('28000');const result=await getPrepared();
      return reply({ok:true,catalogue:catalogue.map(row=>({...row})),coverage:result.coverage,dirty:false,evaluationPending:0,evaluationDone:0,modelId:result.model.id,compressedBytes:result.packet.compressedBytes});
    },
    deafapp_admin_vocabulary_save({p_token,p_entry,p_version,p_ack_prototype}) {
      if(!auth(p_token))return fail('28000');try{validateCatalogueEntry(p_entry);}catch{return fail('22023');}
      const index=catalogue.findIndex(row=>row.classId===p_entry.classId),previous=catalogue[index];
      if((previous?.version??-1)!==p_version)return fail('40001');
      if(catalogue.some(row=>row.classId!==p_entry.classId&&catalogueKey(row.category,row.label)===catalogueKey(p_entry.category,p_entry.label)))return fail('23505');
      if(p_entry.state==='enabled'&&previous?.state!=='enabled'&&(!['saludos/hola','necesidades/agua'].includes(p_entry.classId)||!p_ack_prototype))return fail('22023');
      const entry={...p_entry,version:p_version+1};if(index<0)catalogue.push(entry);else catalogue[index]=entry;prepared=null;return reply({ok:true,entry});
    },
    deafapp_admin_vocabulary_samples({p_token,p_class_id,p_offset}) {
      if(!auth(p_token))return fail('28000');const c=['saludos/hola','necesidades/agua'].indexOf(p_class_id);
      const samples=c<0?[]:Array.from({length:4},(_,i)=>({id:String(c*10+i+1),sourceVersion:0,usable:true,role:'train',person:`P0${i+1}`,personConfirmed:true,assignmentVersion:-1,...assignments.get(String(c*10+i+1))}));
      return reply({ok:true,total:samples.length,rows:samples.slice(p_offset,p_offset+25)});
    },
    deafapp_admin_vocabulary_assign({p_token,p_id,p_source_version,p_version,p_role,p_person,p_confirmed}) {
      if(!auth(p_token))return fail('28000');if((assignments.get(p_id)?.assignmentVersion??-1)!==p_version||p_source_version!==0)return fail('40001');
      assignments.set(p_id,{role:p_role,person:p_person,personConfirmed:p_confirmed,assignmentVersion:p_version+1});return reply({ok:true});
    },
    async deafapp_admin_vocabulary_preview({p_token}) {
      if(!auth(p_token))return fail('28000');const result=await getPrepared();return reply({ok:true,packet:result.packet,modelId:result.model.id+'-preview',enabledClasses:result.model.enabledClasses,revision:'1:1:1',catalogue});
    },
    deafapp_admin_training_progress({p_token}) {
      if(!auth(p_token))return fail('28000');
      return reply({ok:true,progress:{updatedAt:new Date().toISOString(),targetCount:32,trainedCount:0,originals:0,models:[],sources:[],targets:[],mock:true}});
    },
    deafapp_admin_login({ p_password }) {
      const now = Date.now();
      if (lockedUntil > now) return reply({ ok: false, code: "rate_limited" });
      if (p_password !== MOCK_ADMIN_PASSWORD) {
        failures = [...failures.filter(t => now - t < 600_000), now];
        if (failures.length >= 5) { lockedUntil = now + 120_000; failures = []; }
        return reply({ ok: false, code: "invalid_password" });
      }
      const token = hex(crypto.getRandomValues(new Uint8Array(32)));
      const expiresAt = now + 2 * 3_600_000;
      sessions.set(token, expiresAt);
      return reply({ ok: true, token, expiresAt: new Date(expiresAt).toISOString() });
    },
    deafapp_admin_list({ p_token, p_status, p_query, p_offset, p_limit }) {
      if (!auth(p_token)) return fail("28000");
      const q = (p_query || "").toLowerCase();
      const match = rows.filter(r => (p_status === "all" || r.status === p_status) && (!q || `${r.label} ${r.category}`.toLowerCase().includes(q)));
      const count = status => rows.filter(r => r.status === status).length;
      return reply({ ok: true, rows: match.slice(p_offset, p_offset + p_limit), counts: { pending: count("pending"), approved: count("approved"), rejected: count("rejected") }, total: match.length });
    },
    deafapp_admin_review({ p_token, p_items, p_status }) {
      if (!auth(p_token)) return fail("28000");
      const targets = p_items.map(item => rows.find(r => r.id === item.id && r.version === item.version));
      if (targets.some(r => !r)) return fail("40001");
      targets.forEach(r => { r.status = p_status; r.version++; r.moderatedAt=Date.now(); });
      return reply({ ok: true, changed: targets.length, status: p_status });
    },
    deafapp_admin_overview({ p_token }) {
      if (!auth(p_token)) return fail("28000");
      return reply({ ok: true, preparation: require("../../admin/dataset-snapshot.json"), checkedAt: new Date().toISOString() });
    },
    deafapp_admin_material({ p_token }) {
      if (!auth(p_token)) return fail("28000");
      return reply({ ok: true, catalog: require("../../admin/catalog-snapshot.json") });
    },
    deafapp_admin_logout({ p_token }) {
      sessions.delete(p_token);
      return reply({ ok: true });
    },
  };

  return {
    functions:{invoke:async()=>({data:{ok:true,preparing:false},error:null})},
    rpc(name, args) { return handlers[name] ? handlers[name](args) : fail("PGRST202"); },
    from() {
      const query={select:()=>query,eq:()=>query,order:()=>query,limit:()=>query,abortSignal:async()=>{
        const approved=rows.filter(row=>row.status==='approved').sort((a,b)=>(b.moderatedAt||0)-(a.moderatedAt||0)||Number(b.id)-Number(a.id)),latest=approved[0];
        return {count:approved.length,data:latest?[{id:latest.id,moderation_version:latest.version,moderated_at:latest.moderatedAt||null}]:[]};
      }};return query;
    },
    storage: {
      from: () => ({
        async download(path) {
          const row = rows.find(r => r.path === path);
          if (!row) return { data: null, error: { message: "not found" } };
          const payload = JSON.stringify({ label: row.label, intervalMs: 100, frameAspectRatio: 4 / 3, frames: Array.from({ length: 30 }, () => PNG) });
          return { data: { size: payload.length, text: async () => payload }, error: null };
        },
      }),
    },
  };
}
