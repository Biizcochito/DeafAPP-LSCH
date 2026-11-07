import React,{useEffect,useMemo,useState} from 'react';
import {registerRootComponent} from 'expo';
import {catalogueSeed} from '../../src/training/recognitionCatalog';
import VocabularyQuality,{QualityOverride} from '../../src/training/VocabularyQuality.web';
import {createAdminClient} from '../../src/admin/adminClient';
import {createMockAdminBackend,MOCK_ADMIN_PASSWORD} from '../../src/admin/adminMock';
import '../../src/ui/theme.css';
import '../../src/app/LiveInterpretation.css';
import '../../src/admin/VocabularyWorkbench.css';

const entries=catalogueSeed().slice(0,58),words=entries.map(row=>row.classId),labels=new Map(entries.map(row=>[row.classId,row.displayLabel]));
const initialQuality=entries.map((row,i)=>({classId:row.classId,manualLevel:null,manualVersion:0,
  evaluation:i%4===3?null:{samples:10,correct:[9,7,3][i%4],predicted:10,scope:'different-recordings'}}));
function QualityPreview(){
  const api=useMemo(()=>createAdminClient(createMockAdminBackend()),[]),[session,setSession]=useState(null),[quality,setQuality]=useState(initialQuality);
  const [selected,setSelected]=useState(words[0]),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
  useEffect(()=>{let active=true;api.login(MOCK_ADMIN_PASSWORD).then(value=>{if(active)setSession(value);});return()=>{active=false;};},[api]);
  const row=quality.find(item=>item.classId===selected);
  return <div className="deaf-app live-interpretation">
    <header className="li-nav"><a href="/" aria-label="DeafApp"><img src="/brand/deafapp-mark.svg" alt="" width="34" height="34"/><span>Deaf<span>App</span></span></a><span>Prueba local</span></header>
    <main className="li-main"><div className="li-heading"><span className="li-eyebrow">DEMOSTRACIÓN VISUAL · DATOS DE EJEMPLO</span><h1>Interpretar en vivo</h1><p>Colores de muestra para revisar la interfaz. No representan la precisión real de la biblioteca.</p></div>
      <div className="li-workspace"><section className="li-camera-section" aria-label="Cámara de demostración"><div className="li-camera-frame"><div className="li-camera"><div className="li-welcome-camera"><h2>Tu cámara sigue apagada.</h2><p>Esta prueba solo muestra los niveles de color.</p></div><span className="li-camera-badge"><i/>Prueba visual</span></div></div></section>
        <section className="li-conversation" aria-label="Vocabulario con niveles"><div className="li-tools"><div className="li-result-heading"><span className="li-eyebrow">DE TUS MANOS A LAS PALABRAS</span><span className="li-text-badge">Texto en vivo</span></div><section className="li-vocabulary" aria-labelledby="li-vocabulary-title"><h3 id="li-vocabulary-title">58 palabras y oraciones habilitadas · ejemplo</h3><VocabularyQuality words={words} quality={quality} labels={id=>labels.get(id)}/></section></div></section></div>
      <section className="vocabulary-workbench" style={{padding:'24px 0'}} aria-label="Administración de niveles de demostración"><div className="vc-card"><h2>Probar la valoración manual</h2><p>El guardado se simula en memoria. Cambia una seña y comprueba su color en la lista de arriba.</p><label style={{display:'grid',gap:8,maxWidth:440}}>Seña que quieres valorar<select aria-label="Seña que quieres valorar" value={selected} onChange={e=>{setSelected(e.target.value);setNotice('');}}>{entries.map(entry=><option key={entry.classId} value={entry.classId}>{entry.displayLabel} · {entry.categoryTitle}</option>)}</select></label>
        <QualityOverride key={`${selected}:${row.manualVersion}`} row={row} busy={busy||!session} onSave={async level=>{setBusy(true);setNotice('');try{const response=await api.saveRecognitionQuality(session,selected,level,row.manualVersion);setQuality(values=>values.map(item=>item.classId===selected?{...item,...response.qualityReview}:item));setNotice('Nivel guardado en esta demostración. El color de la lista se actualizó.');}catch(e){setNotice(e.message);}finally{setBusy(false);}}}/>
        {notice&&<p role="status">{notice}</p>}</div></section>
    </main>
  </div>;
}
document.body.style.margin='0';document.body.style.background='#080c0a';
registerRootComponent(QualityPreview);
