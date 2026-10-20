import {useEffect, useRef} from 'react';
import {AppIcon} from './AppWorkspace';
import './AdminWorkspace.css';
const items = [
  ['recordings','camera','Grabaciones','Revisión'],
  ['video-review','check','Revisión de señas','Vídeos'],
  ['training','play','Entrenamiento LSCh','Entrenar'],
  ['material','search','Material de LSCh','Material'],
  ['tools','more','Datos y diagnóstico','Datos'],
];
export default function AdminWorkspace({children,section,onNavigate,onExit,busy}) {
  const main=useRef(null);
  const previous=useRef(section);
  useEffect(()=>{
    if(previous.current!==section) {main.current?.focus({preventScroll:true});previous.current=section;}
  },[section]);
  const local=process.env.EXPO_PUBLIC_ADMIN_MOCK==='1' && typeof window!=='undefined' && ['localhost','127.0.0.1'].includes(window.location.hostname);
  return <div className="deaf-app admin-workspace">
    <header className="admin-brandbar">
      <a className="app-brand" href="/app" aria-label="Ir a DeafApp"><img src="/brand/deafapp-mark.svg" alt="" width="36" height="36"/><span>Deaf<span>App</span></span><span className="app-beta">Beta</span></a>
      <span className="admin-area-label">Administración</span>
      <button className="admin-mobile-exit app-icon-button" type="button" aria-label="Cerrar sesión" onClick={onExit} disabled={busy}><AppIcon name="lock" size={19}/></button>
    </header>
    <nav className="admin-navigation" aria-label="Administración">
      <span className="admin-nav-caption">ESPACIO DE TRABAJO</span>
      {items.map(([id,icon,label,short])=><button key={id} type="button" aria-label={label} aria-current={section===id?'page':undefined} onClick={()=>onNavigate(id)} disabled={busy}><AppIcon name={icon}/><span className="admin-nav-full">{label}</span><span className="admin-nav-short">{short}</span>{section===id&&<i aria-hidden="true"/>}</button>)}
    </nav>
    <aside className="admin-sidebar-footer"><div className="admin-private-note"><span className="admin-lock"><AppIcon name="lock" size={19}/></span><strong>Un aporte a la vez.</strong><p>Revisamos las señas para construir juntos el futuro de la LSCh.</p></div><button className="admin-signout" type="button" aria-label="Cerrar sesión" onClick={onExit} disabled={busy}>Cerrar sesión<AppIcon name="arrow" size={18}/></button></aside>
    <main ref={main} tabIndex={-1} className="admin-main" aria-label={items.find(([id])=>id===section)?.[2]} key={section}>{local&&<div className="admin-local-notice"><span/>Vista local · Datos de prueba</div>}{children}</main>
  </div>;
}
