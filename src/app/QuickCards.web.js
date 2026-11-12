import {useEffect, useRef, useState} from 'react';
import {CommunicationHeader, CommunicationIcon} from './CommunicationNav.web';
import {DEFAULT_CARDS, cleanMessage, loadCards, saveCards, browserCardStorage, MAX_MESSAGE_LENGTH} from './communicationData';
import useReadAloud from './useReadAloud.web';

export default function QuickCards({navigate}) {
  const [saved, setSaved] = useState(() => loadCards(browserCardStorage()));
  const [filter, setFilter] = useState('Todas'), [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false), [customText, setCustomText] = useState('');
  const [selected, setSelected] = useState(null), [text, setText] = useState('');
  const [editing, setEditing] = useState(false), [replying, setReplying] = useState(false), [reply, setReply] = useState('');
  const [storageError, setStorageError] = useState(false);
  const dialog = useRef(null), voice = useReadAloud();
  useEffect(() => { setStorageError(!saveCards(browserCardStorage(), saved)); }, [saved]);
  useEffect(() => {
    if (selected && !dialog.current.open) dialog.current.showModal();
    else if (!selected && dialog.current.open) dialog.current.close();
  }, [selected]);
  const cards = [...DEFAULT_CARDS, ...saved.custom];
  const normalize = value => value.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const visible = cards.filter(card => (filter === 'Todas' || filter === 'Favoritas' && saved.favorites.includes(card.id) || card.category === filter) && normalize(card.text).includes(normalize(query.trim())));
  function favorite(id) { setSaved(value => ({...value, favorites:value.favorites.includes(id) ? value.favorites.filter(item => item !== id) : [...value.favorites, id]})); }
  function open(card) { voice.stop(); setText(card.text); setSelected(card); setEditing(false); setReplying(false); setReply(''); }
  function close() { voice.stop(); setSelected(null); }
  function add(event) {
    event.preventDefault(); const message = cleanMessage(customText);
    if (!message || saved.custom.length >= 50) return;
    setSaved(value => ({...value, custom:[...value.custom, {id:`custom-${crypto.randomUUID()}`, text:message, category:'Mis frases'}]}));
    setCustomText(''); setAdding(false); setFilter('Mis frases'); setQuery('');
  }
  function remove(id) { setSaved(value => ({custom:value.custom.filter(card => card.id !== id), favorites:value.favorites.filter(item => item !== id)})); }
  return <div className="deaf-app communication-page">
    <CommunicationHeader navigate={navigate} current="tarjetas"/>
    <main className="communication-main">
      <div className="communication-page-heading"><div><span className="li-eyebrow">TUS PALABRAS, SIEMPRE A MANO</span><h1>Comunicación <em>rápida.</em></h1><p>Elige una tarjeta, muéstrala en grande y hazte entender a tu ritmo.</p></div><span className="communication-badge"><CommunicationIcon name="cards"/>Sin cámara ni micrófono</span></div>
      <section className="quick-cards-toolbar" aria-label="Buscar y filtrar tarjetas"><label className="quick-cards-search">Buscar una frase<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="¿Qué necesitas comunicar?"/></label><button className="communication-button" disabled={saved.custom.length >= 50} onClick={() => setAdding(value => !value)} aria-expanded={adding}>{adding ? 'Cerrar formulario' : '+ Crear mi frase'}</button></section>
      {adding && <form className="quick-cards-create" onSubmit={add}><label htmlFor="custom-phrase">Tu nueva frase</label><textarea autoFocus id="custom-phrase" placeholder="Escribe un mensaje que uses seguido…" value={customText} onChange={event => setCustomText(event.target.value)} maxLength={MAX_MESSAGE_LENGTH}/><div className="communication-actions"><span className="communication-note">Se guarda en este navegador · {customText.length}/{MAX_MESSAGE_LENGTH}</span><button className="communication-button" disabled={!customText.trim()}>Guardar frase</button></div></form>}
      <div className="quick-cards-filters" role="group" aria-label="Categorías de tarjetas">{['Todas', 'Favoritas', 'Comunicación', 'Ayuda', 'Día a día', 'Mis frases'].map(item => <button key={item} aria-pressed={filter === item} onClick={() => setFilter(item)}>{item === 'Favoritas' && <CommunicationIcon name="star" size={16}/>} {item}</button>)}</div>
      <p className="quick-cards-count" role="status">{visible.length} {visible.length === 1 ? 'tarjeta disponible' : 'tarjetas disponibles'} · Toca una para mostrarla</p>
      <section className="quick-cards-grid" aria-label="Tarjetas de comunicación">{visible.map((card, index) => <article key={card.id} className="quick-card" data-category={card.category}>
        <div className="quick-card-top"><span>{card.category}</span><button className="quick-card-favorite" onClick={() => favorite(card.id)} aria-pressed={saved.favorites.includes(card.id)} aria-label={`${saved.favorites.includes(card.id) ? 'Quitar de' : 'Agregar a'} favoritas: ${card.text}`}><CommunicationIcon name="star"/></button></div>
        <button className="quick-card-open" onClick={() => open(card)}><span className="quick-card-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><h2>{card.text}</h2><span className="quick-card-show">Mostrar en grande<CommunicationIcon name="arrow"/></span></button>
        {card.category === 'Mis frases' && <button className="communication-text-button quick-card-delete" aria-label={`Eliminar mi frase: ${card.text}`} onClick={() => remove(card.id)}>Eliminar frase</button>}
      </article>)}</section>
      {!visible.length && <div className="quick-cards-empty"><CommunicationIcon name="cards" size={36}/><h2>{filter === 'Favoritas' ? 'Tus frases más útiles, aquí.' : 'Todavía no hay tarjetas aquí.'}</h2><p>{filter === 'Favoritas' ? 'Pulsa la estrella de una tarjeta para guardarla en favoritas.' : 'Prueba otra búsqueda o crea tu propia frase.'}</p></div>}
      <p className="communication-note quick-cards-footer">Tus frases y favoritas se guardan solo en este navegador. Al borrar sus datos, se eliminan. La voz depende de las opciones de tu dispositivo.</p>
      {storageError && <p className="communication-error" role="status">No se pudieron guardar las frases en este navegador. Puedes seguir usando las tarjetas durante esta visita.</p>}
    </main>
    <dialog ref={dialog} className="quick-card-dialog" aria-labelledby="shown-card-title" onCancel={close} onClose={() => { if (selected) close(); }}>
      <div className="quick-card-dialog-bar"><span id="shown-card-title">{replying ? 'Tu respuesta' : 'DeafApp · Comunicación rápida'}</span><button autoFocus className="communication-button communication-secondary" onClick={close}>Cerrar <span aria-hidden="true">×</span></button></div>
      {replying ? <form className="quick-card-reply" onSubmit={event => {event.preventDefault(); if (reply.trim()) {setText(cleanMessage(reply)); setReplying(false);}}}><label htmlFor="card-reply">Escribe tu respuesta</label><textarea id="card-reply" autoFocus maxLength={MAX_MESSAGE_LENGTH} value={reply} onChange={event => setReply(event.target.value)} placeholder="Escribe aquí para que la otra persona pueda leerte…"/><div className="communication-actions"><button type="button" className="communication-button communication-secondary" onClick={() => setReplying(false)}>Volver al mensaje</button><button className="communication-button" disabled={!reply.trim()}>Mostrar respuesta</button></div></form> : <>
        {editing ? <div className="quick-card-editor"><label htmlFor="card-edit">Editar mensaje para mostrar</label><textarea autoFocus id="card-edit" maxLength={MAX_MESSAGE_LENGTH} value={text} onChange={event => {voice.stop(); setText(event.target.value);}}/><p className="communication-note">Este cambio se aplica a la tarjeta abierta.</p><button className="communication-button" disabled={!text.trim()} onClick={() => setEditing(false)}>Listo, mostrar mensaje</button></div> : <p className="quick-card-big-text" aria-live="polite">{text}</p>}
        <div className="quick-card-dialog-actions"><button className="communication-button" disabled={!voice.supported || !text.trim()} onClick={() => voice.speaking ? voice.stop() : voice.speak(text)}><CommunicationIcon name="volume"/>{voice.speaking ? 'Detener voz' : 'Leer con voz'}</button><button className="communication-button communication-secondary" onClick={() => {voice.stop(); setEditing(value => !value);}}>Editar mensaje</button><button className="communication-button communication-secondary" onClick={() => {voice.stop(); setReplying(true); setEditing(false);}}>Responder por escrito<CommunicationIcon name="message"/></button></div>
        {!voice.supported && <p className="communication-note">La voz no está disponible en este navegador. Puedes mostrar el mensaje escrito.</p>}
      </>}
      {voice.error && <p className="communication-error" role="alert">{voice.error}</p>}
    </dialog>
  </div>;
}
