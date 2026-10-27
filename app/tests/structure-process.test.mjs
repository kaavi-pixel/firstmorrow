// A standing structure's daily process, end to end.
//
// This is the loop that never actually ran in the live world: every structure
// was handed a labour day already spent, so `make` was impossible for every
// structure for ever, and the refusal blamed the author for a declaration they
// had made. These tests hold the two faults apart and hold the process open.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, runStructures, dayIndex, advance, living, MINUTES_PER_DAY } from '../kernel/world.mjs';
import { applyDeclarations, RULES } from '../kernel/validate.mjs';
import { runProgram } from '../kernel/sandbox.mjs';
import { structureEnv } from '../kernel/capability.mjs';
import { terrainAt, walkable, BOUNDS } from '../public/terrain.mjs';
import { repairState } from '../kernel/store.mjs';

const runner = (code, s, S) => runProgram(code, structureEnv(S, s), 1);

/** The first walkable tile with the sea beside it: the only place a still works. */
function besideSea(S) {
  for (let y = BOUNDS.minY; y <= BOUNDS.maxY; y++) {
    for (let x = BOUNDS.minX; x <= BOUNDS.maxX; x++) {
      if (!walkable(S.terrain, x, y)) continue;
      const sea = [[1, 0], [-1, 0], [0, 1], [0, -1]]
        .some(([dx, dy]) => terrainAt(S.terrain, x + dx, y + dy)?.regionId === 'sea');
      if (sea) return { x, y };
    }
  }
  throw new Error('this seed has no coast');
}

/** A finished structure that has been standing since before the test began. */
function standing(S, { x, y, program, mass = 20 }) {
  const s = {
    id: `s${S.structures.length + 1}`, name: 'Coastal Still',
    description: 'A still, to make drinking water from the sea beside it.',
    x, y, sprite: null, built: true, progressHours: mass * 0.9, mass, shelter: 0,
    laborHours: Math.round(mass * 0.9 * 10) / 10, authorId: S.authors[0].id, program,
  };
  S.structures.push(s);
  return s;
}

/** The person who will run it, standing at the site with a fresh day. */
function operator(S, x, y) {
  const p = S.people[0];
  p.x = x; p.y = y;
  p.labor = { day: dayIndex(S), used: 0 };
  return p;
}

test('a process that declares no labour is told exactly that', () => {
  const S = createWorld();
  const { x, y } = besideSea(S);
  standing(S, { x, y, program: 'return { make: { water: 8 } };' });
  const p = operator(S, x, y);
  assert.throws(() => applyDeclarations(S, p, { make: { water: 8 } }),
    /declare labor alongside make/, 'the declaration is the fault, and it is named');
});

test('a process whose person is out of hours is told the hours, not the declaration', () => {
  const S = createWorld();
  const { x, y } = besideSea(S);
  standing(S, { x, y, program: 'return { labor: 8, make: { water: 8 } };' });
  const p = operator(S, x, y);
  // A whole day already spent. The budget is the waking day, so it is taken from
  // the rule rather than written as a number that would drift from it.
  p.labor = { day: dayIndex(S), used: RULES.laborHoursPerDay };
  // Labour WAS declared. Saying otherwise sent the live author round this loop
  // nineteen days running.
  assert.throws(() => applyDeclarations(S, p, { labor: 8, make: { water: 8 } }),
    /No labour hours left today/);
});

test('a process short of hours is told the shortfall, not that its yield is wrong', () => {
  const S = createWorld();
  const { x, y } = besideSea(S);
  standing(S, { x, y, program: 'return { labor: 8, make: { water: 32 } };' });
  const p = operator(S, x, y);
  p.labor = { day: dayIndex(S), used: RULES.laborHoursPerDay - 7.5 };   // seven and a half hours left
  assert.throws(() => applyDeclarations(S, p, { labor: 8, make: { water: 32 } }),
    /8 h are needed and 7\.5 h are left today/,
    'the hour is the shortage: 32 L at 4 L/h needs eight of them');
});

test('a standing structure makes what its author declared, once a day', () => {
  const S = createWorld();
  const { x, y } = besideSea(S);
  const s = standing(S, { x, y, program: 'return { labor: 8, make: { water: 16 } };' });
  const clock = S.minute;
  runStructures(S, dayIndex(S), { run: runner });
  assert.equal(s.failures, undefined, 'it did not fail');
  assert.equal(s.store.water, 16, 'sixteen litres are in the still');
  assert.equal(S.minute, clock, 'and the camp did not lose eight hours of daylight to it');
});

test('a structure that asks for more hours than its day has is refused, and says why', () => {
  const S = createWorld();
  const { x, y } = besideSea(S);
  const s = standing(S, { x, y, program: 'return { labor: 8, make: { water: 32 } };' });
  // Seven and a half hours: enough to be told the truth, not enough to fill it.
  const p = operator(S, x, y);
  p.labor = { day: dayIndex(S), used: RULES.laborHoursPerDay - 7.5 };
  assert.throws(() => applyDeclarations(S, p, { labor: 8, make: { water: 32 } }), /7\.5 h are left today/);
  assert.equal(s.store, undefined, 'nothing was made');
  assert.equal((s.failures || 0), 0, 'the refusal is the person\'s, not the structure\'s');
});

test('water a structure made is reachable, so the people can drink it', () => {
  const S = createWorld();
  // A still beside the camp square: whoever is home is within arm's reach of it.
  const spot = [[1, 0], [-1, 0], [0, 1], [0, -1]]
    .map(([dx, dy]) => ({ x: S.camp.x + dx, y: S.camp.y + dy }))
    .find(t => walkable(S.terrain, t.x, t.y));
  assert.ok(spot, 'the camp has walkable ground beside it');
  const s = standing(S, { x: spot.x, y: spot.y, program: 'return { labor: 8, make: { water: 16 } };' });
  s.store = { water: 40, food: 0, material: 0, soil: 0 };
  S.camp.stock.water = 0;
  const alive = living(S).length;

  advance(S, MINUTES_PER_DAY, { run: runner });

  assert.ok(s.store.water < 40, `the camp drank from it: ${s.store.water.toFixed(1)} L left of 40`);
  assert.equal(living(S).length, alive, 'and nobody died of thirst beside a full still');
});

test('a structure standing before descriptions existed is given a plain one', () => {
  const S = createWorld();
  S.structures.push({ id: 's1', name: 'Old Works', x: 5, y: 5, mass: 10, built: true, description: null });
  S.structures.push({ id: 's2', name: 'New Works', x: 6, y: 5, mass: 10, built: true, description: 'A wall, to break the wind off the sea.' });
  repairState(S);
  assert.match(S.structures[0].description, /before designs had to say/);
  assert.equal(S.structures[1].description, 'A wall, to break the wind off the sea.', 'a real description is left alone');
});
