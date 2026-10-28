// The gate: processes, not outcomes. Everything is mass-checked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../kernel/world.mjs';
import { applyDeclarations, RULES } from '../kernel/validate.mjs';
import { terrainAt, region, walkable, neighbours } from '../public/terrain.mjs';
import { runProgram } from '../kernel/sandbox.mjs';
import { livePayload } from '../kernel/payload.mjs';

// A place is a cell id now. The probe is an author, which has no body, so it may
// stand anywhere it has surveyed.
const actorAt = (at, extra = {}) => ({
  id: 'probe', name: 'Probe', kind: 'author', at, alive: true, health: 100,
  pack: { water: 0, food: 0, material: 0, soil: 0 }, labor: { day: 0, used: 0 }, say: null, ...extra,
});

/** Walkable ground with the sea beside it: the only place a still works. */
function coastBesideSea(S) {
  for (const t of S.terrain.tiles.values()) {
    if (t.regionId !== 'coast') continue;
    if (neighbours(S.terrain, t.id).some(n => terrainAt(S.terrain, n)?.regionId === 'sea')) return t;
  }
  return null;
}

/** A walkable cell beside the camp: where anything about to be proposed goes. */
const campSpot = S => neighbours(S.terrain, S.camp.at).find(at => walkable(S.terrain, at));

test('an unknown declaration is refused outright', () => {
  const S = createWorld();
  assert.throws(() => applyDeclarations(S, actorAt(S.camp.at), { conjure: { gold: 5 } }), /Unknown declaration/);
});

test('a process cannot make more mass than it takes in', () => {
  const S = createWorld();
  const t = coastBesideSea(S);
  S.structures.push({ id: 's1', name: 'Still', at: t.id, mass: 60, shelter: 0, built: true, progressHours: 9, laborHours: 9, store: { water: 0, food: 0, material: 0, soil: 0 } });
  const who = actorAt(t.id);
  assert.throws(() => applyDeclarations(S, who, { labor: 4, use: {}, make: { food: 100 } }), /cannot make more mass/);
});

test('a garden yields no more food than its soil allows', () => {
  const S = createWorld();
  const who = actorAt(S.camp.at);
  S.structures.push({ id: 's1', name: 'Garden', at: campSpot(S), mass: 40, shelter: 0, built: true, progressHours: 9, laborHours: 9 });
  assert.throws(() => applyDeclarations(S, who, { labor: 4, use: { soil: 10 }, make: { food: 35000 } }), /at most/);
});

test('fresh water comes only from the sea, and only at a rate', () => {
  const S = createWorld();
  const inland = actorAt(S.camp.at);
  S.structures.push({ id: 's1', name: 'Hut', at: campSpot(S), mass: 40, shelter: 0, built: true, progressHours: 9, laborHours: 9 });
  assert.throws(() => applyDeclarations(S, inland, { labor: 4, make: { water: 4 } }), /beside the sea/);

  const t = coastBesideSea(S);
  S.structures.push({ id: 's2', name: 'Still', at: t.id, mass: 60, shelter: 0, built: true, progressHours: 9, laborHours: 9, store: { water: 0, food: 0, material: 0, soil: 0 } });
  const atSea = actorAt(t.id, { onward: true });
  const cap = 4 * RULES.stillLitersPerLaborHour;
  assert.throws(() => applyDeclarations(S, atSea, { labor: 4, make: { water: cap + 1 } }), /per labour hour/);
  applyDeclarations(S, atSea, { labor: 4, make: { water: cap - 1 } });
  const still = S.structures.find(s => s.id === 's2');
  assert.ok(still.store.water > 0, 'the still filled up');
});

test('a process needs a structure to run in', () => {
  const S = createWorld();
  assert.throws(() => applyDeclarations(S, actorAt(S.camp.at), { labor: 1, make: { water: 1 } }), /finished structure/);
});

test('drawing from the land is bounded by what is actually there', () => {
  const S = createWorld();
  const who = actorAt(S.camp.at);
  const before = terrainAt(S.terrain, S.camp.at).material;
  applyDeclarations(S, who, { draw: { material: 5 } });
  assert.equal(terrainAt(S.terrain, S.camp.at).material, before - 5, 'the tile is depleted');
  assert.equal(who.pack.material, 5);
});

test('carrying more than a person can carry is refused', () => {
  const S = createWorld();
  const who = actorAt(S.camp.at);
  S.camp.stock.material = 100;
  assert.throws(() => applyDeclarations(S, who, { take: { material: RULES.carryKg + 1 } }), /can carry/);
});

test('a program that lies is refused, and nothing is applied', () => {
  const S = createWorld();
  const who = actorAt(S.camp.at);
  const before = JSON.stringify(S.camp.stock);
  const decl = runProgram('return {take:{material:1000}};', { self: who }, 1);
  assert.throws(() => applyDeclarations(S, who, decl));
  assert.equal(JSON.stringify(S.camp.stock), before, 'no partial application');
});

test('shelter cannot be claimed out of thin air', () => {
  const S = createWorld();
  const who = actorAt(S.camp.at);
  assert.throws(() => applyDeclarations(S, who, { propose: { name: 'Hall', description: 'A hall that claims more shelter than its material can hold.', at: campSpot(S), mass: 6, shelter: 10, form: 'hall' } }), /at least 30 kg/);
});

test('a proposal that names no art and no form is refused', () => {
  const S = createWorld();
  const who = actorAt(S.camp.at);
  assert.throws(() => applyDeclarations(S, who, { propose: { name: 'Thing', description: 'A thing with no shape at all, which cannot be drawn.', at: campSpot(S), mass: 8 } }), /form or sprite/);
});

test('a proposal with no description is refused', () => {
  const S = createWorld();
  const who = actorAt(S.camp.at);
  assert.throws(() => applyDeclarations(S, who, { propose: { name: 'Mystery', at: campSpot(S), mass: 8, form: 'hut' } }), /description/);
  assert.throws(() => applyDeclarations(S, who, { propose: { name: 'Mystery', description: 'too short', at: campSpot(S), mass: 8, form: 'hut' } }), /description/);
  assert.equal(S.structures.length, 0, 'and nothing was built');
});

test('a description is kept on the structure, and read back to the observer', () => {
  const S = createWorld();
  const who = actorAt(S.camp.at);
  applyDeclarations(S, who, { propose: { name: 'Garden', description: 'A garden, so the camp grows food instead of walking for it.', at: campSpot(S), mass: 20, form: 'hut' } });
  const s = S.structures.at(-1);
  assert.equal(s.description, 'A garden, so the camp grows food instead of walking for it.');
  const b = livePayload(S).buildings.find(x => x.id === s.id);
  assert.equal(b.description, 'A garden, so the camp grows food instead of walking for it.', 'the browser can read what it is for');
});

test('region exposes a physical, not a score', () => {
  assert.equal(typeof region('interior').material, 'number');
  assert.notEqual(region('interior').material, region('sea').material);
});
