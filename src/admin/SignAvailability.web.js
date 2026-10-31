import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {CATEGORIAS} from '../catalog/signCatalog';
import {catalogueKey,collectionGroups,normalizedLabel} from '../training/recognitionCatalog';
import {AppIcon} from '../app/AppWorkspace';
import VocabularyWorkbench from './VocabularyWorkbench';
import './VocabularyWorkbench.css';
import './SignAvailability.css';

const searchText=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es');

export default function SignAvailability({api,session,client,onAccessError,onBusyChange,onMultiply}){
  const [catalogue,setCatalogue]=useState([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false);
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[progress,setProgress]=useState(null),[query,setQuery]=useState('');
  const [selected,setSelected]=useState(null),[newSign,setNewSign]=useState(null),[advanced,setAdvanced]=useState(false);
  const alive=useRef(true),request=useRef(0),lock=useRef(false),form=useRef(null),newButton=useRef(null),signList=useRef(null);
  const accessError=useRef(onAccessError);accessError.current=onAccessError;
  const refresh=useCallback(async()=>{
    if(!alive.current)return;
    const id=++request.current;setLoading(true);
    try{
      const data=await api.vocabulary(session);
      if(alive.current&&id===request.current){setCatalogue(data.catalogue);setLoaded(true);}
    }catch(e){if(alive.current&&id===request.current){setError(e.message);if(e.code==='session_expired')accessError.current?.(e);}}
    finally{if(alive.current&&id===request.current)setLoading(false);}
  },[api,session]);
  useEffect(()=>{
    alive.current=true;void refresh();
    const focus=()=>{if(!lock.current)void refresh();};window.addEventListener('focus',focus);
    return()=>{alive.current=false;request.current++;window.removeEventListener('focus',focus);};
  },[refresh]);
  useEffect(()=>{onBusyChange?.(busy);return()=>onBusyChange?.(false);},[busy,onBusyChange]);
  useEffect(()=>{document.title=`DeafApp — ${advanced?'Reconocimiento y entrenamiento':'Habilitar señas'} · Administración`;},[advanced]);
  useEffect(()=>{if(selected&&!advanced){signList.current?.scrollIntoView({behavior:'smooth',block:'start'});signList.current?.focus({preventScroll:true});}},[selected,advanced]);
  const groups=useMemo(()=>collectionGroups(catalogue),[catalogue]);
  const search=searchText(query.trim());
  const matching=groups.filter(group=>!search||searchText(group.title).includes(search)||group.entries.some(row=>searchText(`${row.displayLabel} ${row.label}`).includes(search)));
  const group=groups.find(row=>row.id===selected);
  const signs=group?.entries.filter(row=>!search||searchText(group.title).includes(search)||searchText(`${row.displayLabel} ${row.label}`).includes(search))||[];
  const disabled=busy||loading||!loaded;
  const enabled=groups.reduce((total,row)=>total+row.enabled,0);

  async function task(action){
    if(lock.current)return;lock.current=true;setBusy(true);setError('');setNotice('');setProgress(null);
    try{await action();}
    catch(e){if(alive.current){setError(e.message||'No se pudo guardar el cambio.');if(e.code==='session_expired')accessError.current?.(e);}}
    finally{if(alive.current)await refresh();lock.current=false;if(alive.current){setBusy(false);setProgress(null);}}
  }
  function publish(rows,value,title){
    void task(async()=>{
      await api.setCollection(session,rows,value,{onProgress:(done,total)=>{if(alive.current)setProgress({done,total});}});
      if(alive.current)setNotice(`${title}: ${value?'habilitada para grabar':'oculta en Grabar'}. El catálogo público se actualiza automáticamente.`);
    });
  }
  function add(){
    setNewSign({category:group?.id||CATEGORIAS[0].id,label:'',collection:true});setError('');setNotice('');
    setTimeout(()=>{form.current?.scrollIntoView({behavior:'smooth',block:'center'});form.current?.querySelector('input')?.focus();},0);
  }
  async function create(event){
    event.preventDefault();const label=normalizedLabel(newSign.label),category=CATEGORIAS.find(row=>row.id===newSign.category);
    if(!label||!category)return;
    if(catalogue.some(row=>catalogueKey(row.category,row.label)===catalogueKey(category.id,label))){setError('Esta seña ya existe. Búscala y pulsa Habilitar.');return;}
    await task(async()=>{
      await api.saveVocabulary(session,{classId:`${category.id}/${label}`,category:category.id,label,displayLabel:newSign.label.trim(),categoryTitle:category.nombre,
        emoji:category.emoji,color:category.color,collection:newSign.collection,state:'collecting',activationScope:'prototype',minimum:3,recordingGoal:50,peopleGoal:10,aliasOf:null,forms:{},version:0},{isNew:true});
      if(alive.current){setNotice(newSign.collection?'Seña creada y habilitada para grabar. Ya puede recibir aportes.':'Seña creada. Puedes habilitarla cuando quieras.');setNewSign(null);setSelected(category.id);newButton.current?.focus();}
    });
  }
  if(advanced)return <div className="sa-advanced"><div className="sa-advanced-back"><button type="button" disabled={busy} onClick={()=>{setAdvanced(false);void refresh();}}><AppIcon name="back" size={18}/>Volver a Habilitar señas</button></div><VocabularyWorkbench api={api} session={session} client={client} onAccessError={onAccessError} onBusyChange={setBusy} onMultiply={onMultiply}/></div>;

  return <div className="vocabulary-workbench sign-availability" aria-busy={busy||loading}>
    <header className="vc-heading"><span>ADMINISTRACIÓN · CATÁLOGO PÚBLICO</span><h1><AppIcon name="toggle" size={36}/>Habilitar señas</h1><p>Elige qué categorías y señas aparecen en la web para que las personas puedan grabarlas.</p></header>
    <section className="sa-guide" aria-label="Cómo habilitar señas"><ol><li><b>Elige una categoría.</b><span>Encuentra todas sus señas en un solo lugar.</span></li><li><b>Pulsa Habilitar categoría.</b><span>Se publican todas sus señas para grabar.</span></li><li><b>Abre Grabar en la web.</b><span>El catálogo se actualiza en unos segundos.</span></li></ol><p>Puedes habilitarlas aunque todavía no tengan grabaciones. Ocultarlas conserva sus aportes.</p></section>
    <div className="sa-toolbar"><p>{enabled} señas habilitadas · {groups.filter(row=>row.enabled>0).length} categorías visibles</p><div><button ref={newButton} type="button" disabled={disabled} onClick={add}>Crear seña nueva</button><button type="button" disabled={busy||loading} onClick={()=>{setError('');setNotice('');void refresh();}}>Actualizar</button></div></div>
    {error&&<p className="vc-error" role="alert">{error}</p>}{notice&&<p className="vc-notice" role="status">{notice}</p>}
    {progress&&<p role="status">Guardando {progress.done} de {progress.total} señas…</p>}
    {loading&&<p role="status">Actualizando catálogo…</p>}
    {newSign&&<form ref={form} className="vc-card sa-create" onSubmit={create} aria-label="Crear seña nueva"><div className="vc-actions"><h2>Crear seña nueva</h2><button type="button" disabled={busy} onClick={()=>{setNewSign(null);newButton.current?.focus();}}>Cerrar</button></div><div className="vc-fields"><label>Categoría<select value={newSign.category} disabled={busy} onChange={e=>setNewSign({...newSign,category:e.target.value})}>{CATEGORIAS.map(row=><option key={row.id} value={row.id}>{row.nombre}</option>)}</select></label><label>Nombre de la seña<input required maxLength={80} value={newSign.label} disabled={busy} placeholder="Por ejemplo: biblioteca" onChange={e=>setNewSign({...newSign,label:e.target.value})}/></label></div><label className="vc-check"><input type="checkbox" checked={newSign.collection} disabled={busy} onChange={e=>setNewSign({...newSign,collection:e.target.checked})}/>Habilitar para grabar al guardar</label><button className="vc-save" type="submit" disabled={disabled||!newSign.label.trim()}>{busy?'Guardando…':'Guardar seña'}</button></form>}
    <label className="sa-search">Buscar categoría o seña<input type="search" value={query} placeholder="Familia, alimentos, agua…" onChange={e=>setQuery(e.target.value)}/></label>
    <section className="sa-categories" aria-label="Categorías para grabar">{matching.map(row=>{
      const all=row.enabled===row.entries.length;
      return <article key={row.id} className="sa-category" aria-label={row.title}><div className="sa-category-top"><span className="sa-emoji" aria-hidden="true">{row.emoji}</span><span className={`sa-status${all?' sa-status-on':''}`}>{all?'Habilitada':row.enabled?'Parcialmente habilitada':'Oculta'}</span></div><h2>{row.title}</h2><p>{row.enabled} de {row.entries.length} señas visibles para grabar</p><div className="sa-category-buttons">{!all&&<button className="sa-primary" type="button" disabled={disabled} aria-label={`Habilitar categoría ${row.title}`} onClick={()=>publish(row.entries,true,row.title)}>Habilitar categoría</button>}{row.enabled>0&&<button type="button" disabled={disabled} aria-label={`Ocultar categoría ${row.title}`} onClick={()=>publish(row.entries,false,row.title)}>Ocultar categoría</button>}<button className="sa-view" type="button" disabled={busy} aria-expanded={selected===row.id} aria-controls="sa-signs" onClick={()=>setSelected(selected===row.id?null:row.id)}>Ver señas de {row.title}</button></div></article>;
    })}</section>
    {!loading&&!matching.length&&<p>No hay categorías o señas con esa búsqueda.</p>}
    {group&&<section ref={signList} tabIndex={-1} id="sa-signs" className="vc-card sa-signs" aria-label={`Señas de ${group.title}`}><div className="vc-actions"><h2>{group.title}</h2><button type="button" disabled={busy} onClick={()=>setSelected(null)}>Cerrar señas</button></div><p>También puedes habilitar u ocultar una seña por separado.</p><ul>{signs.map(row=><li key={row.classId}><div><strong>{row.displayLabel}</strong><small>{row.collection?'Visible para grabar':'Oculta en la web'}</small></div><button type="button" aria-pressed={row.collection} aria-label={`${row.collection?'Ocultar':'Habilitar'} seña ${row.displayLabel}`} disabled={disabled} onClick={()=>publish([row],!row.collection,row.displayLabel)}><AppIcon name="toggle" size={22}/>{row.collection?'Habilitada':'Habilitar'}</button></li>)}</ul>{!signs.length&&<p>No hay señas de esta categoría con esa búsqueda.</p>}</section>}
    <footer className="sa-recognition"><p>Habilitar una seña permite recibir grabaciones. Para usarla en el intérprete, sus muestras se revisan desde entrenamiento.</p><button type="button" disabled={disabled} onClick={()=>setAdvanced(true)}>Opciones de reconocimiento y entrenamiento</button></footer>
  </div>;
}
