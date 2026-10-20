import {canonicalPhraseLabel} from './training/phraseLabels';
import {useCallback,useEffect,useRef,useState} from 'react';
import {REVIEW_PAGE_SIZE,REVIEW_STATUSES,reviewExportText,segmentTime,segmentWatchUrl,validSegment} from './training/signReview';
import SignReviewPlayer from './SignReviewPlayer';
import './SignReviewWorkbench.css';
export default function SignReviewWorkbench({api,session,onAccessError,onBusyChange}){
  const [scope,setScope]=useState('visible'),[status,setStatus]=useState('pending'),[query,setQuery]=useState(''),[page,setPage]=useState(0),[refresh,setRefresh]=useState(0);
  const [listing,setListing]=useState(null),[selectedKey,setSelectedKey]=useState(null),[label,setLabel]=useState(''),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const sequence=useRef(0),alive=useRef(true),working=useRef(false);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;sequence.current++;};},[]);
  const fail=useCallback(e=>{if(!alive.current)return;setError(e.message||'No se pudo completar la revisión.');if(e.code==='session_expired')onAccessError?.(e);},[onAccessError]);
  useEffect(()=>{
    const request=++sequence.current;setLoading(true);setError('');
    const timer=setTimeout(()=>{api.signReviewList(session,{scope,status,query,page}).then(data=>{
      if(!alive.current||request!==sequence.current)return;
      if(data.rows.some(row=>!validSegment(row)))throw Error('Un segmento tiene datos inválidos. Actualiza la lista.');
      setListing(data);setSelectedKey(previous=>data.rows.some(row=>row.key===previous)?previous:data.rows[0]?.key||null);
      if(page>0&&data.total<=page*REVIEW_PAGE_SIZE)setPage(Math.max(0,Math.ceil(data.total/REVIEW_PAGE_SIZE)-1));
    }).catch(e=>{if(request===sequence.current)fail(e);}).finally(()=>{if(alive.current&&request===sequence.current)setLoading(false);});},query?250:0);
    return()=>{clearTimeout(timer);sequence.current++;};
  },[api,session,scope,status,query,page,refresh]);
  const rows=listing?.rows||[],selected=rows.find(row=>row.key===selectedKey),counts=listing?.counts||{};
  useEffect(()=>{setLabel(canonicalPhraseLabel(selected?.confirmedLabel||selected?.proposedLabel||''));},[selected?.key,selected?.version]);
  function filter(setter,value){setter(value);setPage(0);setListing(null);setSelectedKey(null);setNotice('');}
  async function task(action){if(working.current)return;working.current=true;setBusy(true);onBusyChange?.(true);setError('');setNotice('');try{await action();}catch(e){fail(e);}finally{working.current=false;onBusyChange?.(false);if(alive.current)setBusy(false);}}
  function decide(next){if(!selected||loading)return;void task(async()=>{
    await api.signReviewDecide(session,selected,next,next==='approved'?label:null);
    if(alive.current){setNotice(next==='approved'?`Seña confirmada: ${label}. Revisión guardada.`:next==='rejected'?'Segmento descartado. Revisión guardada.':'Segmento devuelto a pendientes.');setRefresh(value=>value+1);}
  });}
  async function exportDecisions(){await task(async()=>{
    const data=await api.signReviewExport(session,scope);if(!alive.current)return;
    const blob=new Blob([reviewExportText(data)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=`revision_${new Date().toISOString().slice(0,19).replaceAll(':','-').replace('T','_')}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    setNotice(`${Object.keys(data.decisions).length} decisiones exportadas. Se incluyen confirmaciones y descartes del filtro de catálogo.`);
  });}
  const labels=[...new Set([...(listing?.labels||[]),...(selected?.proposedLabel?[selected.proposedLabel]:[])].map(canonicalPhraseLabel))].sort((a,b)=>a.localeCompare(b,'es'));
  return <div className="sign-review" data-admin-root><div className="sr-scroll" data-admin-scroll><div>
    <div className="sr-heading"><div><p className="sr-eyebrow">ADMINISTRACIÓN · REVISIÓN HUMANA</p><h1 data-admin-title>Una seña, bien revisada.</h1><p>Comprueba el movimiento y confirma su significado en LSCh. Las propuestas automáticas siguen pendientes hasta tu revisión.</p></div><button type="button" onClick={exportDecisions} disabled={busy||!listing}>Exportar decisiones</button></div>
    <div className="sr-stats"><div><strong>{counts.total??'—'}</strong><span>segmentos candidatos</span></div><div><strong>{counts.visible??'—'}</strong><span>del catálogo visible</span></div><div><strong>{counts.approved??'—'}</strong><span>confirmados</span></div><div><strong>{counts.pending??'—'}</strong><span>pendientes de revisión</span></div></div>
    <div className="sr-filters"><label>Catálogo<select value={scope} disabled={busy} onChange={e=>filter(setScope,e.target.value)}><option value="visible">Prioridad: señas de la web</option><option value="all">Todos los candidatos</option></select></label><label>Estado<select value={status} disabled={busy} onChange={e=>filter(setStatus,e.target.value)}>{Object.entries(REVIEW_STATUSES).map(([key,text])=><option key={key} value={key}>{text}</option>)}<option value="all">Todos los estados</option></select></label><label className="sr-search">Buscar<input type="search" value={query} maxLength={120} disabled={busy} placeholder="Seña, canal o título" onChange={e=>filter(setQuery,e.target.value)}/></label><button type="button" disabled={busy||loading} onClick={()=>setRefresh(value=>value+1)}>Actualizar</button></div>
    {error&&<div className="sr-error" role="alert">{error}{error.includes('cambió')&&<p>Actualiza la lista antes de decidir nuevamente.</p>}</div>}{notice&&<p className="sr-notice" role="status">{notice}</p>}
    <div className="sr-layout" aria-busy={loading}>
      <section className="sr-queue" aria-label="Segmentos por revisar"><div className="sr-queue-title"><h2>Candidatos</h2><span>{loading?'Cargando…':`${listing?.total??0} en este filtro`}</span></div><div className="sr-cards">{rows.map(row=><button type="button" className={`sr-candidate${row.key===selectedKey?' is-selected':''}`} key={row.key} disabled={busy||loading} aria-pressed={row.key===selectedKey} onClick={()=>{setSelectedKey(row.key);setNotice('');}}><span className="sr-card-top"><strong>{row.confirmedLabel||row.proposedLabel||'Sin etiqueta propuesta'}</strong><span className={`sr-badge sr-${row.status}`}>{REVIEW_STATUSES[row.status]}</span></span><span>{row.metadata.channel||'Canal de origen'}</span><span className="sr-card-title">{row.metadata.title||row.videoId}</span><small>{segmentTime(row.start)} – {segmentTime(row.end)} · {row.priority?'Catálogo visible':'Material adicional'}</small></button>)}{!loading&&!rows.length&&<p className="sr-empty">No hay segmentos con estos filtros.</p>}</div><div className="sr-pagination"><button type="button" disabled={busy||loading||page===0} onClick={()=>setPage(value=>value-1)}>Anterior</button><span>{page+1} / {Math.max(1,Math.ceil((listing?.total||0)/REVIEW_PAGE_SIZE))}</span><button type="button" disabled={busy||loading||(page+1)*REVIEW_PAGE_SIZE>=(listing?.total||0)} onClick={()=>setPage(value=>value+1)}>Siguiente</button></div></section>
      <section className="sr-detail" aria-label="Revisar segmento seleccionado">{selected?<>
        <div className="sr-detail-title"><div><span className="sr-eyebrow">SEGMENTO SELECCIONADO</span><h2>{selected.confirmedLabel||selected.proposedLabel||'Identifica esta seña'}</h2></div><a href={segmentWatchUrl(selected)} target="_blank" rel="noopener noreferrer">Vídeo original ↗</a></div>
        <SignReviewPlayer row={selected}/><div className="sr-source"><strong>{selected.metadata.title}</strong><span>{selected.metadata.channel} · {segmentTime(selected.start)} – {segmentTime(selected.end)}</span>{selected.metadata.license&&<span>Licencia declarada en la fuente: {selected.metadata.license}</span>}</div>
        <div className="sr-proposal"><strong>Propuesta: {selected.proposedLabel||'sin etiqueta'}</strong><p>Fuente de la propuesta: {selected.metadata.source||'sin asignar'} · puntuación automática {Math.round(selected.confidence*100)} %. Esta puntuación no confirma que la seña sea correcta.</p>{selected.metadata.sourceLabel&&selected.metadata.sourceLabel!==selected.proposedLabel&&<p>Etiqueta de origen: «{selected.metadata.sourceLabel}».</p>}{selected.metadata.evidence&&<details><summary>Ver evidencia de la propuesta</summary><p>{selected.metadata.evidence}</p></details>}</div>
        <label className="sr-confirm-label" htmlFor="sr-label">Seña que reconoces en el tramo<select id="sr-label" value={label} disabled={busy||loading} onChange={e=>setLabel(e.target.value)}><option value="">Selecciona una seña</option>{labels.map(text=><option key={text} value={text}>{text}</option>)}</select></label>
        <p className="sr-help">Confirma solo si ves una seña completa y su significado coincide. Si falta contexto o aparecen varias señas, déjalo pendiente o descártalo.</p>
        <div className="sr-actions"><button type="button" className="sr-primary" disabled={busy||loading||!label} onClick={()=>decide('approved')}>{busy?'Guardando…':'Confirmar seña'}</button><button type="button" className="sr-danger" disabled={busy||loading} onClick={()=>decide('rejected')}>Descartar segmento</button>{selected.status!=='pending'&&<button type="button" disabled={busy||loading} onClick={()=>decide('pending')}>Dejar pendiente</button>}</div>
      </>:<div className="sr-empty"><h2>{loading?'Cargando candidatos…':'Elige un segmento'}</h2><p>Las decisiones se guardan para continuar desde otro computador.</p></div>}</section>
    </div><p className="sr-footnote">Confirmar un segmento valida su etiqueta. Para entrenar todavía hay que extraer sus puntos y preparar el conjunto de datos; esta pantalla no ejecuta ese proceso.</p>
  </div></div></div>;
}
