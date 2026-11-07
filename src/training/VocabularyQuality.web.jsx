import {useId,useState} from 'react';
import {recognitionQuality,qualityByClass,QUALITY_LEVELS,QUALITY_LABELS,QUALITY_SYMBOLS} from './recognitionQuality';
import './VocabularyQuality.css';

export function QualityBadge({quality}) {
  return <span className="rq-badge" data-quality={quality.level}><i aria-hidden="true">{QUALITY_SYMBOLS[quality.level]}</i>{quality.label}<small>{quality.source==='manual'?'Manual':'Auto'}</small></span>;
}

export default function VocabularyQuality({words,quality,labels}) {
  const rows=qualityByClass(quality),[selected,setSelected]=useState(null),descriptionId=useId();
  const selection=selected&&words.includes(selected)?{label:labels(selected),quality:recognitionQuality(rows.get(selected))}:null;
  return <>
    <div className="rq-legend" aria-label="Colores del nivel de reconocimiento">{QUALITY_LEVELS.map(level=><span key={level} data-quality={level}><i aria-hidden="true">{QUALITY_SYMBOLS[level]}</i>{QUALITY_LABELS[level]}</span>)}</div>
    <div className="li-chips rq-chips" tabIndex="0" role="region" aria-label="Todas las palabras y oraciones habilitadas">{words.map(id=>{
      const item=recognitionQuality(rows.get(id)),label=labels(id);
      return <button type="button" key={id} data-quality={item.level} aria-pressed={selected===id} aria-label={`${label}: reconocimiento ${item.label.toLocaleLowerCase('es')}; ${item.source==='manual'?'nivel manual':'nivel automático'}`} title={`${label} · ${item.label} · ${item.detail}`} aria-describedby={selected===id?descriptionId:undefined} onClick={()=>setSelected(previous=>previous===id?null:id)}><i aria-hidden="true">{QUALITY_SYMBOLS[item.level]}</i><span>{label}</span></button>;
    })}</div>
    {selection&&<div className="rq-detail" id={descriptionId} role="status"><strong>{selection.label}</strong><QualityBadge quality={selection.quality}/><p>{selection.quality.detail}</p></div>}
    <p className="rq-note">Automático: alto ≥ 85 %, medio ≥ 60 %, bajo &lt; 60 % en acierto y precisión, con al menos 5 pruebas. «Manual» indica una valoración del administrador.</p>
  </>;
}

export function QualityOverride({row,onSave,busy=false}) {
  const [level,setLevel]=useState(row?.manualLevel||'automatic'),assessment=recognitionQuality(row);
  return <section className="rq-override" aria-label="Nivel de reconocimiento mostrado"><h3>Color en el intérprete en vivo</h3>
    <QualityBadge quality={assessment}/><p>{assessment.detail}</p>
    <label>Nivel mostrado<select aria-label="Nivel de reconocimiento mostrado" value={level} disabled={busy} onChange={event=>setLevel(event.target.value)}><option value="automatic">Automático · según pruebas reservadas</option>{QUALITY_LEVELS.map(value=><option key={value} value={value}>{QUALITY_LABELS[value]} · manual</option>)}</select></label>
    <p>El nivel manual tiene prioridad. Elige «Automático» para volver a los resultados de las pruebas.</p>
    <button type="button" disabled={busy||level===(row?.manualLevel||'automatic')} onClick={()=>onSave(level==='automatic'?null:level)}>Guardar nivel de reconocimiento</button>
  </section>;
}
