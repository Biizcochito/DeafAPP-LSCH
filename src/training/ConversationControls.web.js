import './ConversationControls.css';
const issues={'tracking-lost':'Se perdió el seguimiento. Revisa el borrador antes de terminar.','unrecognized-gap':'Hubo una seña sin coincidencia clara. Revisa el borrador.','too-long':'La frase es larga. Termina o corrige este borrador antes de continuar.'};
export default function ConversationControls({conversation,prefix='conversation'}){
  const {mode,setMode,person,setPerson,draft,finish,undo,clearDraft}=conversation;
  return <div className="conversation-controls">
    <div className="conversation-mode" role="group" aria-label="Modo de interpretación">
      <button type="button" aria-pressed={mode==='phrases'} onClick={()=>setMode('phrases')}>Frases</button>
      <button type="button" aria-pressed={mode==='signs'} onClick={()=>setMode('signs')}>Seña por seña</button>
    </div>
    {mode==='phrases'&&<>
      <details><summary>Contexto y funcionamiento</summary>
      <label htmlFor={`${prefix}-person`}>Sujeto para los verbos</label>
      <select id={`${prefix}-person`} value={person} onChange={event=>setPerson(event.target.value)}>
        <option value="signed">Solo el sujeto expresado con señas</option><option value="yo">Yo</option><option value="tu">Tú</option><option value="el">Él / ella / usted</option><option value="nosotros">Nosotros</option><option value="ellos">Ellos / ellas / ustedes</option>
      </select>
      <p>Une las señas confirmadas y lee la frase tras una pausa con las manos visibles. El sujeto elegido aporta contexto; no se adivina.</p>
      </details>
      {draft.issue&&<p className="conversation-issue" role="status">{issues[draft.issue]||'Revisa el borrador.'} La voz automática queda en pausa.</p>}
      {draft.canFinish&&<div className="conversation-actions"><button type="button" onClick={finish}>{draft.issue?'Guardar para revisar':'Terminar frase'}</button>
        <button type="button" onClick={undo}>Deshacer última</button><button type="button" onClick={clearDraft}>Borrar borrador</button></div>}
      <p className="conversation-scope">Composición de vocabulario reconocido. Revisa el resultado: todavía no es traducción libre de LSCh.</p>
    </>}
  </div>;
}
