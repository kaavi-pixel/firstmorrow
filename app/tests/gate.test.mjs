// The gate: processes, not outcomes. Everything is mass-checked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../kernel/world.mjs';
import { applyDeclarations, RULES } from '../kernel/validate.mjs';
import { terrainAt, region } from '../public/terrain.mjs';
import { runProgram } from '../kernel/sandbox.mjs';

const actorAt = (x, y, extra = {}) => ({
  id: 'probe', name: 'Probe', kind: 'author', x, y, alive: true, health: 100,
  pack: { water: 0, food: 0, material: 0, soil: 0 }, labor: { day: 0, used: 0 }, say: null, ...extra,
});

function coastBesideSea(S) {
  for (const t of S.terrain.tiles.values()) {
    if (t.regionId !== 'coast') continue;
    const sea = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => terrainAt(S.terrain, t.x + dx, t.y + dy)?.regionId === 'sea');
    if (sea) return t;
  }
  return null;
}

test('an unknown declaration is refused outright', () => {
  const S = createWorld();
  assert.throws(() => applyDeclarations(S, actorAt(S.camp.x, S.camp.y), { conjure: { gold: 5 } }), /Unknown declaration/);
});

test('a process cannot make more mass than it takes in', () => {
  const S = createWorld();
  const t = coastBesideSea(S);
  S.structures.push({ id: 's1', name: 'Still', x: t.x, y: t.y, mass: 60, shelter: 0, built: true, progressHours: 9, laborHours: 9, store: { water: 0, food: 0, material: 0, soil: 0 } });
  const who = actorAt(t.x, t.y);
  assert.throws(() => applyDeclarations(S, who, { labor: 4, use: {}, make: { food: 100 } }), /cannot make more mass/);
});

test('a garden yields no more food than its soil allows', () => {
  const S = createWorld();
  const who = actorAt(S.camp.x, S.camp.y);
  S.structures.push({ id: 's1', name: 'Garden', x: S.camp.x, y: S.camp.y - 1, mass: 40, shelter: 0, built: true, progressHours: 9, laborHours: 9 });
  assert.throws(() => applyDeclarations(S, who, { labor: 4, use: { soil: 10 }, make: { food: 35000 } }), /at most/);
});

test('fresh water comes only from the sea, and only at a rate', () => {
  const S = createWorld();
  const inland = actorAt(S.camp.x, S.camp.y);
  S.structures.push({ id: 's1', name: 'Hut', x: S.camp.x, y: S.camp.y - 1, mass: 40, shelter: 0, built: true, progressHours: 9, laborHours: 9 });
  assert.throws(() => applyDeclarations(S, inland, { labor: 4, make: { water: 4 } }), /beside the sea/);

  const t = coastBesideSea(S);
  S.structures.push({ id: 's2', name: 'Still', x: t.x, y: t.y, mass: 60, shelter: 0, built: true, progressHours: 9, laborHours: 9, store: { water: 0, food: 0, material: 0, soil: 0 } });
  const atSea = actorAt(t.x, t.y, { onward: true });
  const cap = 4 * RULES.stillLitersPerLaborHour;
  assert.throws(() => applyDeclarations(S, atSea, { labor: 4, make: { water: cap + 1 } }), /per labour hour/);
  applyDeclarations(S, atSea, { labor: 4, make: { water: cap - 1 } });
  const still = S.structures.find(s => s.id === 's2');
  assert.ok(still.store.water > 0, 'the still filled up');
});

test('a process needs a structure to run in', () => {
  const S = createWorld();
  assert.throws(() => applyDeclarations(S, actorAt(S.camp.x, S.camp.y), { labor: 1, make: { water: 1 } }), /finished structure/);
});

test('drawing from the land is bounded by what is actually there', () => {
  const S = createWorld();
  const who = actorAt(S.camp.x, S.camp.y);
  const before = terrainAt(S.terrain, S.camp.x, S.camp.y).material;
  applyDeclarations(S, who, { draw: { material: 5 } });
  assert.equal(terrainAt(S.terrain, S.camp.x, S.camp.y).material, before - 5, 'the tile is depleted');
  assert.equal(who.pack.material, 5);
});

test('carrying more than a person can carry is refused', () => {
  const S = createWorld();
  const who = actorAt(S.camp.x, S.camp.y);
  S.camp.stock.material = 100;
  assert.throws(() => applyDeclarations(S, who, { take: { material: RULES.carryKg + 1 } }), /can carry/);
});

test('a program that lies is refused, and nothing is applied', () => {
  const S = createWorld();
  const who = actorAt(S.camp.x, S.camp.y);
  const before = JSON.stringify(S.camp.stock);
  const decl = runProgram('return {take:{material:1000}};', { self: who }, 1);
  assert.throws(() => applyDeclarations(S, who, decl));
  assert.equal(JSON.stringify(S.camp.stock), before, 'no partial application');
});

test('shelter cannot be claimed out of thin air', () => {
  const S = createWorld();
  const who = actorAt(S.camp.x, S.camp.y);
  assert.throws(() => applyDeclarations(S, who, { propose: { name: 'Hall', x: S.camp.x + 1, y: S.camp.y, mass: 6, shelter: 10, form: 'hall' } }), /at least 30 kg/);
});

test('a proposal that names no art and no form is refused', () => {
  const S = createWorld();
  const who = actorAt(S.camp.x, S.camp.y);
  assert.throws(() => applyDeclarations(S, who, { propose: { name: 'Thing', x: S.camp.x + 1, y: S.camp.y, mass: 8 } }), /form or sprite/);
});

test('region exposes a physical, not a score', () => {
  assert.equal(typeof region('interior').material, 'number');
  assert.notEqual(region('interior').material, region('sea').material);
});
