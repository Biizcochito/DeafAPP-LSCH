// Backend de administración SIMULADO, solo para probar la interfaz en local. No usa Supabase.
// Se activa únicamente con EXPO_PUBLIC_ADMIN_MOCK=1 en localhost (ver App.js y scripts/web-mock-admin.cjs).
// Contraseña de prueba: no es la del panel real.
export const MOCK_ADMIN_PASSWORD = "deafapp-prueba-local";
import {catalogueSeed,catalogueKey,validateCatalogueEntry} from '../training/recognitionCatalog.js';
import {prepareControlledModel} from '../training/controlledModel.js';
import {encodeRuntimePackage} from '../training/runtimePackage.js';
import {variantSpecification} from '../training/recordingVariants.js';

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
  const batches=[],files=new Map();
  const batchValue=b=>({...b,parents:b.parentIds.map(id=>rows.find(r=>r.id===id)).filter(Boolean).map(row=>({...row,usable:false})),parentCount:b.parentIds.length});
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
    deafapp_admin_variant_create({p_token,p_request_id,p_items,p_quantity}){
      if(!auth(p_token))return fail('28000');
      if(![50,100].includes(p_quantity)||!Array.isArray(p_items)||p_items.length<1||p_items.length>3||new Set(p_items.map(r=>r.id)).size!==p_items.length)return fail('22023');
      const previous=batches.find(b=>b.requestId===p_request_id);if(previous)return previous.quantity===p_quantity&&JSON.stringify(previous.parentIds)===JSON.stringify(p_items.map(r=>r.id))?reply({ok:true,batch:batchValue(previous),alreadyCreated:true}):fail('40001');
      const parents=p_items.map(item=>rows.find(r=>r.id===item.id&&r.version===item.version&&r.status!=='rejected'));
      if(parents.some(r=>!r))return fail('40001');if(parents.some(r=>r.label!==parents[0].label||r.category!==parents[0].category))return fail('22023');
      const batch={id:crypto.randomUUID(),requestId:p_request_id,classId:`${parents[0].category}/${parents[0].label}`,displayLabel:parents[0].label,categoryTitle:parents[0].category,quantity:p_quantity,parentIds:parents.map(r=>r.id),status:'pending',version:0,createdAt:new Date().toISOString()};batches.unshift(batch);return reply({ok:true,batch:batchValue(batch)});
    },
    deafapp_admin_variant_list({p_token,p_status,p_offset}){if(!auth(p_token))return fail('28000');const match=batches.filter(b=>p_status==='all'||b.status===p_status);return reply({ok:true,total:match.length,pending:batches.filter(b=>b.status==='pending').length,rows:match.slice(p_offset,p_offset+25).map(batchValue)});},
    deafapp_admin_variant_detail({p_token,p_id}){if(!auth(p_token))return fail('28000');const b=batches.find(b=>b.id===p_id);if(!b)return fail('22023');return reply({ok:true,batch:batchValue(b),variants:Array.from({length:b.quantity},(_,i)=>{const v=variantSpecification(i,b.quantity,b.parentIds.length);return {...v,parentId:b.parentIds[v.parentIndex]};})});},
    deafapp_admin_variant_review({p_token,p_id,p_version,p_status,p_parents}){
      if(!auth(p_token))return fail('28000');const b=batches.find(b=>b.id===p_id);if(!b||b.version!==p_version)return fail('40001');if(!['approved','pending','rejected'].includes(p_status))return fail('22023');
      if(p_status==='approved'&&b.parentIds.some(id=>!p_parents.some(item=>{const row=rows.find(r=>r.id===id);return item.id===id&&row?.status==='approved'&&row.version===item.version;})))return fail('40001');
      b.status=p_status;b.version++;return reply({ok:true,batch:batchValue(b)});
    },
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
      targets.forEach(r => { r.status = p_status; r.version++; r.moderatedAt=Date.now();for(const b of batches)if(b.status==='approved'&&b.parentIds.includes(r.id)){b.status='pending';b.version++;} });
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
      let filePath;
      const query={select:()=>query,eq:(key,value)=>{if(key==='archivo_path')filePath=value;return query;},order:()=>query,limit:()=>query,
      insert:async value=>{rows.unshift({id:String(Math.max(...rows.map(r=>Number(r.id)))+1),label:value.label,category:value.categoria,path:value.archivo_path,status:'pending',version:0,createdAt:new Date().toISOString()});return {data:null,error:null};},
      then:(resolve,reject)=>Promise.resolve({data:rows.filter(row=>row.path===filePath).map(row=>({id:row.id,moderation_version:row.version})),error:null}).then(resolve,reject),
      abortSignal:async()=>{
        const approved=rows.filter(row=>row.status==='approved').sort((a,b)=>(b.moderatedAt||0)-(a.moderatedAt||0)||Number(b.id)-Number(a.id)),latest=approved[0];
        return {count:approved.length,data:latest?[{id:latest.id,moderation_version:latest.version,moderated_at:latest.moderatedAt||null}]:[]};
      }};return query;
    },
    storage: {
      from: () => ({
        async upload(path,blob){if(files.has(path))return {error:{code:'Duplicate'}};files.set(path,await blob.text());return {data:{path},error:null};},
        async download(path) {
          const row = rows.find(r => r.path === path);
          if (!row) return { data: null, error: { message: "not found" } };
          const payload = files.get(path)||JSON.stringify({ label: row.label,categoria:row.category, intervalMs: 100, frameAspectRatio: 4 / 3, frames: Array.from({ length: 30 }, () => PNG) });
          return { data: { size: payload.length, text: async () => payload }, error: null };
        },
      }),
    },
  };
}
