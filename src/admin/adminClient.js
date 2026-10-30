import {REVIEW_PAGE_SIZE,validCandidateKey} from '../training/signReview.js';
import {notifyRecordingReview} from '../training/recordingLibrarySync.js';
import {validateCatalogueEntry} from '../training/recognitionCatalog.js';
export const ADMIN_PAGE_SIZE = 25;
export const MODERATION_LABELS = { pending: "Pendiente", approved: "Aprobada", rejected: "Rechazada" };

export class AdminError extends Error {
  constructor(message, code) { super(message); this.name = "AdminError"; this.code = code; }
}

export function validAdminSession(session, now = Date.now()) {
  return !!session && typeof session.token === "string" && /^[a-f0-9]{64}$/.test(session.token) &&
    Number.isFinite(session.expiresAt) && session.expiresAt > now;
}

export function createAdminClient(client) {
  async function call(name, args) {
    let result;
    try { result = await client.rpc(name, args); }
    catch { throw new AdminError("No se pudo conectar. Inténtalo nuevamente.", "connection"); }
    if (result.error) {
      const code = result.error.code;
      if (code === "PGRST202" || code === "42883") throw new AdminError("El panel todavía no está activado en Supabase.", "not_configured");
      if (code === "28000") throw new AdminError("La sesión terminó. Vuelve a ingresar.", "session_expired");
      if (code === "40001") throw new AdminError("Otra persona cambió esta revisión. Actualiza la lista y revísala nuevamente.", "conflict");
      if (code === "23505") throw new AdminError("Esta seña ya existe en esa categoría. Busca la entrada antes de agregarla.", "duplicate");
      if (code === "22023") throw new AdminError(name.includes('_variant_')?'Revisa el lote: elige de una a tres tomas de la misma seña y 50 o 100 variantes. Para aprobarlo, revisa sus originales.':"Revisa los datos y los requisitos: prepara las muestras antes de habilitar; la evaluación independiente necesita personas y pruebas reservadas suficientes.", "invalid_input");
      throw new AdminError("No se pudo completar la operación. Actualiza e inténtalo nuevamente.", "server");
    }
    if (result.data?.ok !== true) {
      const code = result.data?.code || "server";
      const messages = { invalid_password: "Contraseña incorrecta.", rate_limited: "Demasiados intentos. Espera dos minutos e inténtalo nuevamente.", not_configured: "Falta configurar la contraseña del administrador." };
      throw new AdminError(messages[code] || "No se pudo completar la operación.", code);
    }
    return result.data;
  }
  function token(session) {
    if (!validAdminSession(session)) throw new AdminError("La sesión terminó. Vuelve a ingresar.", "session_expired");
    return session.token;
  }
  return {
    async login(password) {
      if (typeof password !== "string" || !password || password.length > 72) throw new AdminError("Escribe la contraseña.", "invalid_password");
      const data = await call("deafapp_admin_login", { p_password: password });
      const session = { token: data.token, expiresAt: Date.parse(data.expiresAt) };
      if (!validAdminSession(session)) throw new AdminError("No se pudo abrir una sesión válida.", "server");
      return session;
    },
    list(session, { status = "pending", query = "", page = 0 } = {}) {
      if (!["all", ...Object.keys(MODERATION_LABELS)].includes(status) || !Number.isInteger(page) || page < 0) throw new AdminError("Filtro no válido.", "invalid_input");
      return call("deafapp_admin_list", { p_token: token(session), p_status: status, p_query: String(query).slice(0, 120), p_offset: page * ADMIN_PAGE_SIZE, p_limit: ADMIN_PAGE_SIZE });
    },
    review(session, rows, status) {
      if (!Object.hasOwn(MODERATION_LABELS, status) || !Array.isArray(rows) || rows.length < 1 || rows.length > 50 ||
        rows.some(row => !/^\d+$/.test(String(row.id)) || !Number.isInteger(row.version) || row.version < 0) || new Set(rows.map(r => String(r.id))).size !== rows.length) {
        throw new AdminError("Selecciona grabaciones válidas.", "invalid_input");
      }
      return call("deafapp_admin_review", { p_token: token(session), p_items: rows.map(row => ({ id: String(row.id), version: row.version })), p_status: status })
        .then(data=>{if(data.changed>0)notifyRecordingReview();return data;});
    },
    overview(session) { return call("deafapp_admin_overview", { p_token: token(session) }); },
    material(session) { return call("deafapp_admin_material", { p_token: token(session) }); },
    trainingProgress(session) { return call("deafapp_admin_training_progress", { p_token: token(session) }); },
    vocabulary(session) { return call('deafapp_admin_vocabulary_list',{p_token:token(session)}); },
    createVariants(session,{requestId,rows,quantity}) {
      if(typeof requestId!=='string'||!/^[a-f0-9-]{36}$/i.test(requestId)||![50,100].includes(quantity)||!Array.isArray(rows)||rows.length<1||rows.length>3||
        rows.some(row=>!/^\d+$/.test(String(row.id))||!Number.isInteger(row.version)||row.version<0)||new Set(rows.map(row=>String(row.id))).size!==rows.length)throw new AdminError('Elige una grabación real y 50 o 100 variantes.','invalid_input');
      return call('deafapp_admin_variant_create',{p_token:token(session),p_request_id:requestId,p_items:rows.map(row=>({id:String(row.id),version:row.version})),p_quantity:quantity});
    },
    variants(session,{status='pending',page=0}={}) {
      if(!['all','pending','approved','rejected'].includes(status)||!Number.isInteger(page)||page<0||page>4000)throw new AdminError('Filtro de variantes no válido.','invalid_input');
      return call('deafapp_admin_variant_list',{p_token:token(session),p_status:status,p_offset:page*25});
    },
    variantDetail(session,id) {
      if(typeof id!=='string'||!/^[a-f0-9-]{36}$/i.test(id))throw new AdminError('Lote de variantes no válido.','invalid_input');
      return call('deafapp_admin_variant_detail',{p_token:token(session),p_id:id});
    },
    reviewVariants(session,batch,status) {
      if(!batch||typeof batch.id!=='string'||!/^[a-f0-9-]{36}$/i.test(batch.id)||!Number.isInteger(batch.version)||batch.version<0||!['approved','rejected','pending'].includes(status))throw new AdminError('Revisión de variantes no válida.','invalid_input');
      return call('deafapp_admin_variant_review',{p_token:token(session),p_id:batch.id,p_version:batch.version,p_status:status,p_parents:(batch.parents||[]).map(row=>({id:String(row.id),version:row.version}))})
        .then(data=>{notifyRecordingReview();return data;});
    },
    saveVocabulary(session,entry,{acknowledgePrototype=false,isNew=false}={}) {
      try{validateCatalogueEntry(entry);}catch(e){throw new AdminError(e.message,'invalid_input');}
      return call('deafapp_admin_vocabulary_save',{p_token:token(session),p_entry:entry,p_version:isNew?-1:entry.version,p_ack_prototype:acknowledgePrototype===true})
        .then(data=>{notifyRecordingReview();return data;});
    },
    vocabularySamples(session,classId,page=0) {
      if(typeof classId!=='string'||classId.length>122||!classId.includes('/')||!Number.isInteger(page)||page<0||page*25>100000)throw new AdminError('Consulta de muestras no válida.','invalid_input');
      return call('deafapp_admin_vocabulary_samples',{p_token:token(session),p_class_id:classId,p_offset:page*25});
    },
    assignVocabularySample(session,row) {
      const person=row.person?.trim()||null;
      if(!/^\d+$/.test(String(row.id))||!Number.isInteger(row.sourceVersion)||row.sourceVersion<0||!Number.isInteger(row.assignmentVersion)||row.assignmentVersion< -1||!['train','evaluation'].includes(row.role)||person!==null&&!/^[A-Za-z0-9_-]{1,32}$/.test(person)||typeof row.personConfirmed!=='boolean'||row.personConfirmed&&!person)throw new AdminError('Revisa el código de persona y el destino de la muestra.','invalid_input');
      return call('deafapp_admin_vocabulary_assign',{p_token:token(session),p_id:String(row.id),p_source_version:row.sourceVersion,p_version:row.assignmentVersion,p_role:row.role,p_person:person,p_confirmed:row.personConfirmed})
        .then(data=>{notifyRecordingReview();return data;});
    },
    vocabularyPreview(session) { return call('deafapp_admin_vocabulary_preview',{p_token:token(session)}); },
    async prepareVocabulary(session) {
      await call('deafapp_admin_vocabulary_list',{p_token:token(session)});
      try{const result=await client.functions.invoke('recognition-runtime',{body:{action:'refresh'}});if(result.error)throw result.error;return result.data;}
      catch{throw new AdminError('No se pudo solicitar la preparación. Vuelve a intentarlo.','connection');}
    },
    trainingCandidate(session, modelId) {
      if(typeof modelId!=="string"||!/^[a-f0-9]{32}$/.test(modelId)) throw new AdminError("Candidato no válido.","invalid_input");
      return call("deafapp_admin_training_candidate", {p_token:token(session),p_model_id:modelId});
    },
    signReviewList(session,{scope='visible',status='pending',query='',page=0}={}) {
      if(!['visible','all'].includes(scope)||!['all','pending','approved','rejected'].includes(status)||!Number.isInteger(page)||page<0||page*REVIEW_PAGE_SIZE>10000)throw new AdminError('Filtro de revisión no válido.','invalid_input');
      return call('deafapp_admin_sign_review_list',{p_token:token(session),p_scope:scope,p_status:status,p_query:String(query).slice(0,120),p_offset:page*REVIEW_PAGE_SIZE,p_limit:REVIEW_PAGE_SIZE});
    },
    signReviewDecide(session,row,status,label=null) {
      if(!validCandidateKey(row?.key)||!Number.isInteger(row.version)||row.version<0||!['pending','approved','rejected'].includes(status)||(status==='approved'?(typeof label!=='string'||!label.trim()||label.length>80):label!==null))throw new AdminError('Decisión de revisión no válida.','invalid_input');
      return call('deafapp_admin_sign_review_decide',{p_token:token(session),p_key:row.key,p_version:row.version,p_status:status,p_label:label});
    },
    signReviewExport(session,scope='visible') {
      if(!['visible','all'].includes(scope))throw new AdminError('Filtro de revisión no válido.','invalid_input');
      return call('deafapp_admin_sign_review_export',{p_token:token(session),p_scope:scope});
    },
    async logout(session) {
      if (validAdminSession(session)) await call("deafapp_admin_logout", { p_token: session.token });
    },
  };
}

export function frameDataUri(frame) {
  if (typeof frame !== "string" || frame.length > 4_000_000) return null;
  if (/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=\r\n]+$/.test(frame)) return frame;
  if (/^[A-Za-z0-9+/=\r\n]+$/.test(frame)) {
    if (frame.startsWith("/9j/")) return `data:image/jpeg;base64,${frame}`;
    if (frame.startsWith("iVBORw0KGgo")) return `data:image/png;base64,${frame}`;
    if (frame.startsWith("UklGR")) return `data:image/webp;base64,${frame}`;
  }
  return null;
}

export function recordingPreview(payload) {
  if (!payload || !Array.isArray(payload.frames) || payload.frames.length < 1 || payload.frames.length > 200) throw new Error("El archivo no contiene una secuencia de imágenes válida.");
  const frames = payload.frames.map(frameDataUri);
  if (frames.some(frame => frame == null)) throw new Error("El formato de esta grabación requiere revisión antes de reproducirlo.");
  const intervalMs = Number.isFinite(payload.intervalMs) ? Math.min(1000, Math.max(30, payload.intervalMs)) : 113;
  return { frames, intervalMs, aspectRatio: Number.isFinite(payload.frameAspectRatio) && payload.frameAspectRatio > 0 ? payload.frameAspectRatio : 4 / 3 };
}
