import test from "node:test";
import assert from "node:assert/strict";
import { addContribution, contributionKey, emptyContributions, sanitizeContributions } from "../myContributions.js";

test("cada envío suma una vez a la seña y categoría correctas", () => {
  let state = emptyContributions();
  state = addContribution(state, { id: "a1", category: "saludos", label: "hola" }, 1000);
  state = addContribution(state, { id: "a2", category: "saludos", label: "hola" }, 2000);
  state = addContribution(state, { id: "a3", category: "familia", label: "mama" }, 3000);
  assert.deepEqual(state.items[contributionKey("saludos", "hola")], { n: 2, last: 2000 });
  assert.deepEqual(state.items[contributionKey("familia", "mama")], { n: 1, last: 3000 });
});

test("reintentar el mismo envío no cuenta dos veces", () => {
  const first = addContribution(emptyContributions(), { id: "x", category: "saludos", label: "hola" }, 1);
  const again = addContribution(first, { id: "x", category: "saludos", label: "hola" }, 2);
  assert.equal(again, first);
  assert.equal(again.items["saludos/hola"].n, 1);
});

test("una misma palabra en dos categorías se cuenta por separado", () => {
  let state = addContribution(emptyContributions(), { id: "p1", category: "familia", label: "papa" });
  state = addContribution(state, { id: "p2", category: "frutas_verduras", label: "papa" });
  assert.equal(state.items["familia/papa"].n, 1);
  assert.equal(state.items["frutas_verduras/papa"].n, 1);
});

test("datos dañados o ajenos se descartan sin romper la app", () => {
  assert.deepEqual(sanitizeContributions(null), emptyContributions());
  assert.deepEqual(sanitizeContributions({ version: 2, items: {}, seen: [] }), emptyContributions());
  const cleaned = sanitizeContributions({
    version: 1,
    items: { "saludos/hola": { n: 3, last: 10 }, "malo": { n: 1, last: 1 }, "saludos/adios": { n: -1, last: 1 }, "familia/mama": { n: 1, last: "x" } },
    seen: ["ok", 5, null],
  });
  assert.deepEqual(Object.keys(cleaned.items), ["saludos/hola"]);
  assert.deepEqual(cleaned.seen, ["ok"]);
});

test("el registro de envíos ya contados tiene un tope", () => {
  let state = emptyContributions();
  for (let i = 0; i < 520; i++) state = addContribution(state, { id: `r${i}`, category: "saludos", label: "hola" }, i);
  assert.equal(state.seen.length, 500);
  assert.equal(state.items["saludos/hola"].n, 520);
});
