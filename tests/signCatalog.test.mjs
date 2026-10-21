import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIAS, CATEGORIAS_VISIBLES, ORACIONES } from '../src/catalog/signCatalog.js';
import { TARGET_SIGNS } from '../src/training/datasetPreparation.js';

test('la selección pública contiene exactamente 29 señas y las cuatro oraciones prioritarias', () => {
  const expected = {
    saludos: ['hola', 'bien', 'gracias'],
    conversacion: ['si', 'no', 'no entiendo', 'repite'],
    verbos: ['querer', 'tener', 'comer', 'beber', 'ir', 'trabajar', 'estudiar', 'necesitar'],
    pronombres: ['yo', 'tu', 'nosotros'],
    necesidades: ['agua', 'comida', 'hambre', 'sed', 'ayuda', 'cansado', 'casa'],
    tiempo: ['hoy', 'manana', 'ahora', 'despues'],
    oraciones: ['quiero agua', 'quiero comer', 'necesito ayuda', 'estoy bien'],
  };
  assert.equal(CATEGORIAS_VISIBLES.length, 7);
  assert.equal(CATEGORIAS_VISIBLES.reduce((sum, category) => sum + category.señas.length, 0), 33);
  for (const category of CATEGORIAS_VISIBLES) {
    assert.deepEqual(new Set(category.señas), new Set(expected[category.id]));
    assert.equal(new Set(category.señas).size, category.señas.length);
  }
  assert.deepEqual(CATEGORIAS_VISIBLES.find(category => category.id === 'oraciones').señas, expected.oraciones);
});

test('las cuatro oraciones se apoyan en las señas del catálogo visible', () => {
  const support = {
    'quiero agua': ['verbos/querer', 'necesidades/agua'],
    'quiero comer': ['verbos/querer', 'verbos/comer'],
    'necesito ayuda': ['verbos/necesitar', 'necesidades/ayuda'],
    'estoy bien': ['pronombres/yo','saludos/bien'],
  };
  const visibleSigns = new Set(CATEGORIAS_VISIBLES.filter(category => category.id !== 'oraciones')
    .flatMap(category => category.señas.map(label => `${category.id}/${label}`)));
  for (const phrase of CATEGORIAS_VISIBLES.find(category => category.id === 'oraciones').señas) {
    assert.ok(support[phrase].every(classId => visibleSigns.has(classId)), phrase);
  }
});

test('ocultar categorías, señas y seis oraciones conserva sus etiquetas para borradores y entrenamiento', () => {
  for (const [categoryId, label] of [['alimentos', 'arroz'], ['saludos', 'adios'], ['emociones', 'cansado']]) {
    assert.ok(CATEGORIAS.find(category => category.id === categoryId)?.señas.includes(label));
    assert.ok(TARGET_SIGNS.some(sign => sign.classId === `${categoryId}/${label}`));
    assert.ok(!CATEGORIAS_VISIBLES.find(category => category.id === categoryId)?.señas.includes(label));
  }
  assert.equal(CATEGORIAS.length, 29);
  assert.equal(TARGET_SIGNS.length, 542);
  assert.equal(ORACIONES.señas.length, 10);
  const visiblePhrases = CATEGORIAS_VISIBLES.find(category => category.id === 'oraciones').señas;
  const hiddenPhrases = ORACIONES.señas.filter(label => !visiblePhrases.includes(label));
  assert.equal(hiddenPhrases.length, 6);
  for (const label of hiddenPhrases) {
    assert.ok(TARGET_SIGNS.some(sign => sign.classId === `oraciones/${label}`));
  }
  for (const category of CATEGORIAS_VISIBLES) {
    const original = CATEGORIAS.find(item => item.id === category.id);
    for (const field of ['nombre', 'emoji', 'color']) assert.equal(category[field], original[field]);
    assert.ok(category.señas.every(label => original.señas.includes(label)));
  }
});
