import test from 'node:test';
import assert from 'node:assert/strict';
import {createDictation, dictationConstructor} from '../src/app/dictation.js';
import {sanitizeCards, loadCards, saveCards, appendConversation, DEFAULT_CARDS} from '../src/app/communicationData.js';

function dictationHarness() {
  const states = [], texts = [], errors = [], instances = [];
  class Recognition {
    constructor() { this.starts = this.stops = this.aborts = 0; instances.push(this); }
    start() { this.starts++; }
    stop() { this.stops++; }
    abort() { this.aborts++; }
  }
  const controller = createDictation({Recognition, onState:value => states.push(value), onText:value => texts.push(value), onError:value => errors.push(value)});
  return {controller, states, texts, errors, instances};
}
function result(transcript, isFinal) { return Object.assign([{transcript}], {isFinal}); }

test('el micrófono solo se inicia a petición y usa español de Chile sin reinicios', () => {
  const h = dictationHarness(); assert.equal(h.instances.length, 0);
  h.controller.start(); h.controller.start();
  const r = h.instances[0]; assert.equal(h.instances.length, 1); assert.equal(r.starts, 1);
  assert.equal(r.lang, 'es-CL'); assert.equal(r.continuous, false); assert.equal(r.interimResults, true);
  r.onstart(); assert.deepEqual(h.states, ['starting', 'listening']);
  r.onend(); assert.equal(h.states.at(-1), 'off'); assert.equal(h.instances.length, 1);
});
test('los resultados parciales reemplazan el borrador y solo el final queda al terminar', () => {
  const h = dictationHarness(); h.controller.start(); const r = h.instances[0];
  r.onresult({results:[result('Hola', true), result('como', false)]});
  r.onresult({results:[result('Hola', true), result('cómo estás', true)]});
  assert.deepEqual(h.texts, ['Hola como', 'Hola cómo estás']);
  h.controller.stop(); assert.equal(r.stops, 1); assert.equal(h.states.at(-1), 'stopping');
  r.onend(); assert.equal(h.texts.at(-1), 'Hola cómo estás'); assert.equal(h.states.at(-1), 'off');
});
test('terminar antes de onstart no vuelve a activar el indicador de escucha', () => {
  const h = dictationHarness(); h.controller.start(); h.controller.stop();
  h.instances[0].onstart(); assert.equal(h.states.at(-1), 'stopping');
  h.instances[0].onend(); assert.equal(h.states.at(-1), 'off');
});
test('salir o cancelar aborta y descarta callbacks tardíos', () => {
  const h = dictationHarness(); h.controller.start(); const r = h.instances[0], late = r.onresult;
  h.controller.close(); assert.equal(r.aborts, 1); assert.equal(r.onresult, null);
  late({results:[result('No debe aparecer', true)]}); assert.deepEqual(h.texts, []);
  h.controller.start(); assert.equal(h.instances.length, 1);
});
test('permiso denegado libera la sesión aunque el proveedor no emita onend y permite reintentar', () => {
  const h = dictationHarness(); h.controller.start(); const r = h.instances[0];
  r.onerror({error:'not-allowed'}); assert.match(h.errors.at(-1), /No se autorizó/);
  assert.equal(h.states.at(-1), 'off'); assert.equal(r.aborts, 1);
  h.controller.start(); assert.equal(h.instances.length, 2);
});
test('sin API de dictado se conserva la alternativa escrita y se admite el prefijo webkit', () => {
  assert.equal(dictationConstructor({webkitSpeechRecognition:123}), 123);
  assert.equal(dictationConstructor(null), undefined);
  let error = '';
  createDictation({onState(){}, onText(){}, onError:value => error = value}).start();
  assert.match(error, /por escrito/);
});
test('las tarjetas rechazan datos corruptos, duplicados e identificadores que suplanten las predeterminadas', () => {
  const clean = sanitizeCards({custom:[{id:'write', text:'Suplantada'}, {id:'custom-one', text:' Hola '}, {id:'custom-one', text:'Duplicada'}, {id:'custom-empty', text:'  '}], favorites:['write', 'custom-one', 'missing', 'write']});
  assert.deepEqual(clean.custom, [{id:'custom-one', text:'Hola', category:'Mis frases'}]);
  assert.deepEqual(clean.favorites, ['write', 'custom-one']);
  assert.ok(DEFAULT_CARDS.length >= 8);
});
test('almacenamiento bloqueado o JSON corrupto permite continuar usando las tarjetas', () => {
  const blocked = {getItem(){throw Error('denied');}, setItem(){throw Error('quota');}};
  assert.deepEqual(loadCards(blocked), {custom:[], favorites:[]}); assert.equal(saveCards(blocked, {}), false);
  assert.deepEqual(loadCards({getItem:() => '{invalid'}), {custom:[], favorites:[]});
});
test('frases propias y favoritas sobreviven a la recarga', () => {
  const values = new Map(), storage = {getItem:key => values.get(key), setItem:(key, value) => values.set(key, value)};
  const data = sanitizeCards({custom:[{id:'custom-123', text:'Mi mensaje'}], favorites:['custom-123']});
  assert.equal(saveCards(storage, data), true); assert.deepEqual(loadCards(storage), data);
});
test('la conversación combina ambas fuentes, evita duplicar detecciones y limita el historial', () => {
  const sign = {id:'sign-1', text:'hola', source:'sign'}, reply = {id:'reply-1', text:' Buenas tardes ', source:'text'};
  assert.deepEqual(appendConversation([sign], [sign, reply]), [sign, {...reply, text:'Buenas tardes'}]);
  assert.equal(appendConversation([], Array.from({length:75}, (_, id) => ({id, text:'Mensaje', source:'text'}))).length, 60);
});
