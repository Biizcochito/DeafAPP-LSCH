import test from 'node:test';
import assert from 'node:assert/strict';
import { createHiddenAdminEntry } from '../adminAccess.js';
test('el acceso requiere cinco pulsaciones y vuelve a empezar después de abrir', () => {
  const entry = createHiddenAdminEntry();
  for(let i=0;i<4;i++) assert.equal(entry.press(i*200),false);
  assert.equal(entry.press(800),true);
  assert.equal(entry.press(1000),false);
  entry.reset();
  assert.equal(entry.press(1100),false);
});
test('las pulsaciones lejanas y los retrocesos del reloj no acumulan acceso', () => {
  const entry = createHiddenAdminEntry();
  assert.equal(entry.press(0),false); assert.equal(entry.press(4000),false);
  assert.equal(entry.press(4100),false); assert.equal(entry.press(4200),false); assert.equal(entry.press(4300),false);
  assert.equal(entry.press(4400),true);
  entry.press(5000); entry.press(5100); entry.press(5200);
  assert.equal(entry.press(2000),false); assert.equal(entry.press(2100),false);
  assert.equal(entry.press(NaN),false);
});
