import {useEffect,useRef,useState} from 'react';
import VariantPlayer,{loadVariantRecording} from './VariantPlayer.web';
import './RecordingVariants.css';
const labels={pending:'Pendiente',approved:'Aprobado',rejected:'Rechazado',all:'Todos'};
export default function VariantReviewPanel({api,session,client,onBack,onAccessError,onBusyChange,onChanged,initialStatus='pending',embedded=false,query=''}){
  const [status,setStatus]=useState(initialStatus),[page,setPage]=useState(0),[data,setData]=useState(null),[detail,setDetail]=useState(null),[index,setIndex]=useState(0),[clip,setClip]=useState(null),[original,setOriginal]=useState(false);
  const pageSize=embedded?5:25;
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const alive=useRef(true),lock=useRef(false),request=useRef(0),clips=useRef(new Map()),listRequest=useRef(0);
  function fail(e){if(!alive.current)return;setError(e.message||'No se pudo completar la operación.');if(e.code==='session_expired')onAccessError?.(e);}
  async function refresh(){const id=++listRequest.current;setLoading(true);try{const value=await api.variants(session,{status,page,query,pageSize});if(alive.current&&id===listRequest.current)setData(value);}catch(e){fail(e);}finally{if(alive.current&&id===listRequest.current)setLoading(false);}}
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;request.current++;listRequest.current++;onBusyChange?.(false);};},[]);
  useEffect(()=>{setPage(0);},[query]);
  useEffect(()=>{setDetail(null);setError('');void refresh();},[status,page,query]);
  useEffect(()=>{onBusyChange?.(busy);},[busy]);
  const variant=detail?.variants[index],parent=detail?.batch.parents.find(row=>String(row.id)===String(variant?.parentId));
  useEffect(()=>{
    const id=++request.current;setClip(null);if(!parent)return;
    const key=`${parent.id}:${parent.version}:${parent.path}`;
    if(clips.current.has(key)){setClip(clips.current.get(key));return;}
    loadVariantRecording(client,parent,session).then(value=>{if(alive.current&&id===request.current){clips.current.set(key,value);setClip(value);}}).catch(e=>{if(id===request.current)fail(e);});
  },[parent?.id,parent?.version,parent?.path]);
  async function task(action){if(lock.current)return;lock.current=true;setBusy(true);setError('');setNotice('');try{await action();}catch(e){fail(e);}finally{lock.current=false;if(alive.current)setBusy(false);}}
  async function open(id){await task(async()=>{const value=await api.variantDetail(session,id);if(alive.current){setDetail(value);setIndex(0);}});}
  async function approveOriginals(){await task(async()=>{
    const rows=detail.batch.parents.filter(row=>row.status!=='approved');await api.review(session,rows,'approved');
    const value=await api.variantDetail(session,detail.batch.id);if(alive.current){setDetail(value);setNotice(value.batch.status==='approved'?'Originales y variantes aprobados. Ya aparecen en Aprobadas.':'Originales aprobados. Revisa las variantes y aprueba el lote cuando esté correcto.');}await refresh();onChanged?.();
  });}
  async function review(next){await task(async()=>{
    await api.reviewVariants(session,detail.batch,next);const value=await api.variantDetail(session,detail.batch.id);
    if(alive.current){setDetail(value);setNotice(`Lote ${labels[next].toLocaleLowerCase('es')}.`);}await refresh();onChanged?.();
  });}
  const allPresent=detail&&detail.batch.parents.length===detail.batch.parentCount;
  const allApproved=allPresent&&detail.batch.parents.every(row=>row.status==='approved');
  const Title=embedded?'h2':'h1';
  return <div className={`mv-workbench${embedded?' mv-embedded':''}`}><header>{!embedded&&<p className="mv-eyebrow">ADMINISTRACIÓN · REVISIÓN</p>}<Title>{embedded?`Variantes ${status==='all'?'multiplicadas':status==='approved'?'aprobadas':status==='rejected'?'rechazadas':'pendientes'}`:'Variantes de señas'}</Title><p>{data?.totalVariants??'—'} variantes · {data?.total??'—'} {data?.total===1?'lote':'lotes'}. Conservan los tiempos de sus originales.</p>{!embedded&&<button disabled={busy} onClick={onBack}>Volver a originales</button>}</header>
    {error&&<p role="alert" className="mv-error">{error}</p>}{notice&&<p role="status" className="mv-notice">{notice}</p>}
    <nav className="mv-tabs" aria-label={embedded?'Actualizar variantes':'Filtrar lotes'}>{!embedded&&Object.entries(labels).map(([key,label])=><button key={key} disabled={busy} aria-pressed={status===key} onClick={()=>{setStatus(key);setPage(0);}}>{label}</button>)}<button disabled={busy||loading} onClick={()=>{setDetail(null);void refresh();}}>Actualizar lotes</button></nav>
    {loading&&<p role="status">Cargando lotes…</p>}
    {detail&&<section className="mv-card" aria-label="Revisar lote"><h2>{detail.batch.displayLabel} · {detail.batch.quantity} variantes</h2><p>{detail.batch.parentCount} {detail.batch.parentCount===1?'original':'originales'} · {labels[detail.batch.status]}</p>
      <label>Variante<select disabled={busy} value={index} onChange={e=>{setOriginal(false);setIndex(Number(e.target.value));}}>{detail.variants.map((row,i)=><option key={row.index} value={i}>Variante {row.index} de {detail.batch.quantity} · original #{row.parentId}</option>)}</select></label>
      {parent?<><p>{original?'Original':'Variante del original'} #{parent.id} · {labels[parent.status]}</p><button onClick={()=>setOriginal(!original)}>{original?'Ver variante':'Ver sin variación'}</button><VariantPlayer clip={clip} angle={original?0:variant?.angleDegrees||0}/></>:<p className="mv-error">El original ya no está disponible. Este lote no puede aprobarse.</p>}
      <p>Los originales se conservan por separado. Las variantes aprobadas amplían el aprendizaje cuando sus originales tienen puntos aptos; no cuentan como personas ni tomas reales nuevas.</p>
      {detail.batch.parents.some(row=>!row.usable)&&<small>Hay originales con puntos pendientes o no aptos. Su aprobación no garantiza que puedan usarse para reconocer señas.</small>}
      {!allApproved&&<p className="mv-notice">{detail.batch.inheritApproval?'Las variantes se aprobarán automáticamente cuando sus originales estén aprobados.':'Antes de aprobar este lote, revisa y aprueba sus originales.'}</p>}
      {detail.batch.parents.map(row=><div className="mv-source" key={row.id}><strong>Original #{row.id} · {labels[row.status]}</strong><button disabled={busy} onClick={()=>{const position=detail.variants.findIndex(v=>String(v.parentId)===String(row.id));setIndex(position);setOriginal(true);}}>Ver original #{row.id}</button></div>)}
      <div className="mv-actions">{!allApproved&&allPresent&&<button disabled={busy||!clip} onClick={approveOriginals}>Aprobar originales del lote</button>}
        <button className="mv-primary" disabled={busy||!allApproved||!clip||detail.batch.status==='approved'} onClick={()=>review('approved')}>Aprobar {detail.batch.quantity} variantes</button>
        <button className="mv-danger" disabled={busy||detail.batch.status==='rejected'} onClick={()=>review('rejected')}>Rechazar lote</button>
        {detail.batch.status!=='pending'&&<button disabled={busy} onClick={()=>review('pending')}>Devolver lote a pendientes</button>}
        <button disabled={busy} onClick={()=>{setDetail(null);request.current++;}}>Cerrar lote</button></div>
    </section>}
    <div className="mv-list">{(data?.rows||[]).map(row=><section className="mv-card mv-batch" key={row.id}><div><h3>{row.displayLabel}</h3><small>{row.categoryTitle} · {labels[row.status]}{row.inheritApproval?' · Hereda la aprobación del original':''}</small><p>{row.parentCount} {row.parentCount===1?'original':'originales'} + {row.quantity} variantes</p></div><button disabled={busy} onClick={()=>open(row.id)}>Revisar lote de {row.displayLabel}</button></section>)}</div>
    {!loading&&data?.rows.length===0&&<p>No hay lotes con este filtro. Puedes multiplicar una grabación desde «Originales».</p>}
    <div className="mv-actions"><button disabled={busy||loading||page===0} onClick={()=>setPage(page-1)}>Anterior</button><span>Página {page+1} · {data?.total||0} lotes</span><button disabled={busy||loading||(page+1)*pageSize>=(data?.total||0)} onClick={()=>setPage(page+1)}>Siguiente</button></div>
  </div>;
}
