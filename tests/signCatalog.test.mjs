import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIAS, CATEGORIAS_VISIBLES, ORACIONES } from '../signCatalog.js';
import { TARGET_SIGNS } from '../training/datasetPreparation.js';

test('la selección pública contiene exactamente las 29 señas solicitadas y las diez oraciones', () => {
  const expected = {
    saludos: ['hola', 'bien', 'gracias'],
    conversacion: ['si', 'no', 'no entiendo', 'repite'],
    verbos: ['querer', 'tener', 'comer', 'beber', 'ir', 'trabajar', 'estudiar', 'necesitar'],
    pronombres: ['yo', 'tu', 'nosotros'],
    necesidades: ['agua', 'comida', 'hambre', 'sed', 'ayuda', 'cansado', 'casa'],
    tiempo: ['hoy', 'manana', 'ahora', 'despues'],
    oraciones: ORACIONES.señas,
  };
  assert.equal(CATEGORIAS_VISIBLES.length, 7);
  assert.equal(CATEGORIAS_VISIBLES.reduce((sum, category) => sum + category.señas.length, 0), 39);
  for (const category of CATEGORIAS_VISIBLES) {
    assert.deepEqual(new Set(category.señas), new Set(expected[category.id]));
    assert.equal(new Set(category.señas).size, category.señas.length);
  }
  assert.equal(CATEGORIAS_VISIBLES.find(category => category.id === 'oraciones'), ORACIONES);
});

test('ocultar categorías y señas conserva sus etiquetas originales para borradores y entrenamiento', () => {
  for (const [categoryId, label] of [['alimentos', 'arroz'], ['saludos', 'adios'], ['emociones', 'cansado']]) {
    assert.ok(CATEGORIAS.find(category => category.id === categoryId)?.señas.includes(label));
    assert.ok(TARGET_SIGNS.some(sign => sign.classId === `${categoryId}/${label}`));
    assert.ok(!CATEGORIAS_VISIBLES.find(category => category.id === categoryId)?.señas.includes(label));
  }
  assert.equal(CATEGORIAS.length, 29);
  assert.equal(TARGET_SIGNS.length, 542);
  for (const category of CATEGORIAS_VISIBLES) {
    const original = CATEGORIAS.find(item => item.id === category.id);
    for (const field of ['nombre', 'emoji', 'color']) assert.equal(category[field], original[field]);
    assert.ok(category.señas.every(label => original.señas.includes(label)));
  }
});
