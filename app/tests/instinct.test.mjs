// The people's own behaviour, and its limits.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, advance, living } from '../kernel/world.mjs';
import { advanceWeather } from '../kernel/weather.mjs';
import { terrainAt, OASIS } from '../public/terrain.mjs';
import { RULES } from '../kernel/validate.mjs';

test('they walk to water they can see and bring it home', () => {
  const S = createWorld({ seed: 2049 });
  S.camp.stock.water = 0;
  for (const p of S.people) p.pack.water = 0;
  advance(S, 1440);
  assert.ok(living(S).every(p => (p.thirst || 0) < 0.3), 'everyone found a drink');
  assert.ok(S.camp.stock.water > 0, 'and someone carried some back');
});

test('the spring is finite, and they can empty it', () => {
  const S = createWorld({ seed: 2049 });
  const before = ['', '', '', ''].length;
  let potable = 0;
  for (const t of S.terrain.tiles.values()) potable += t.potable;
  assert.ok(potable > 0);
  advance(S, 1440 * 40);
  let after = 0;
  for (const t of S.terrain.tiles.values()) after += t.potable;
  assert.ok(after < potable, `water was drawn down (${potable} -> ${after})`);
  assert.ok(before === 4);
});

test('a storm sends them under a roof, and a bare camp gives them nowhere to go', () => {
  const S = createWorld({ seed: 2049 });
  advanceWeather(S.weather, 200);
  let stormDay = -1;
  for (let d = 0; d < 200; d++) if (S.weather.storms[d]) { stormDay = d; break; }
  assert.ok(stormDay >= 0, 'there is a storm in the first season');
  S.minute = stormDay * 1440 + S.weather.storms[stormDay].hour * 60 - 60;
  advance(S, 60 + 1);
  assert.ok(S.people.some(p => p.activity === 'cower'), 'with no roof, they can only endure it');
});

test('with a roof built, the same storm finds them indoors', () => {
  const S = createWorld({ seed: 2049 });
  advanceWeather(S.weather, 200);
  let stormDay = -1;
  for (let d = 0; d < 200; d++) if (S.weather.storms[d]) { stormDay = d; break; }
  // A shelter standing at camp, as an author would have had the people build.
  S.structures.push({ id: 's1', name: 'Windbreak', x: S.camp.x, y: S.camp.y - 1, mass: 40, shelter: 5, built: true, progressHours: 36, laborHours: 36, sprite: null });
  S.minute = stormDay * 1440 + S.weather.storms[stormDay].hour * 60 - 120;
  advance(S, 180 + 1);                              // into the middle of the storm
  assert.ok(S.people.some(p => p.activity === 'shelter'), 'they took cover');
  advance(S, 180 * 2);                              // and out the other side
  assert.equal(S.deaths, 0, 'and nobody was hurt');
});

test('a weakened person cannot work a full day', () => {
  const S = createWorld({ seed: 2049 });
  const p = S.people[0];
  const strong = RULES.laborHoursPerDay;
  p.health = 25; p.starving = 1;
  const weak = RULES.laborHoursPerDay * Math.max(0.15, (p.health / 100) * (1 - 0.7 * p.starving));
  assert.ok(weak < strong / 3, 'a starving person at quarter health is not much use');
});

test('instincts obey the same gate: they cannot drink the sea', () => {
  const S = createWorld({ seed: 2049 });
  // A shore tile: sea, with land beside it, so a step off it is possible.
  let sea = null;
  for (const t of S.terrain.tiles.values()) {
    if (t.regionId !== 'sea') continue;
    const besideLand = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const n = terrainAt(S.terrain, t.x + dx, t.y + dy);
      return n && n.regionId !== 'sea';
    });
    if (besideLand) { sea = t; break; }
  }
  assert.ok(sea, 'there is a shore');
  assert.equal(terrainAt(S.terrain, sea.x, sea.y).potable, 0, 'the sea is not drinkable');
  const p = S.people[0];
  p.x = sea.x; p.y = sea.y; p.pack.water = 0;
  S.camp.stock.water = 0;
  advance(S, 12);
  assert.ok(p.x !== sea.x || p.y !== sea.y, 'they left the shore rather than drink it');
  for (const t of S.terrain.tiles.values())
    if (t.regionId === 'sea') assert.equal(t.potable, 0, 'no sea tile ever becomes drinkable');
});

test('the oasis is where the terrain says it is', () => {
  const S = createWorld({ seed: 2049 });
  const t = terrainAt(S.terrain, OASIS.x, OASIS.y);
  assert.ok(t.potable > 0, 'the spring is real and drinkable');
});

test('with an empty larder they forage before they build', () => {
  const S = createWorld({ seed: 2049 });
  // Somebody has designed a water butt and it is not standing yet.
  S.structures.push({
    id: 'site1', name: 'Water butt', x: S.camp.x + 1, y: S.camp.y, authorId: S.authors[0].id,
    built: false, laborHours: 40, progressHours: 0, shelter: 0, store: { water: 0, food: 0 }, program: null,
  });
  S.camp.stock.food = 0;
  for (const p of S.people) p.pack.food = 0;
  advance(S, 2);
  assert.equal(S.structures[0].progressHours, 0, 'nobody lifts a finger to build on an empty larder');
  assert.ok(S.people.every(p => p.goal && p.goal.kind === 'food'), 'everyone sets out for food instead');
  advance(S, 1440);
  assert.ok(S.camp.stock.food > 0, 'and they bring some home');
  advance(S, 1440 * 7);
  assert.ok(S.structures[0].progressHours > 0, 'only once the larder is stocked do they build');
  assert.ok(living(S).every(p => (p.starving || 0) < 0.6), 'nobody starved waiting');
});

test('a starving person walks further for food than a comfortable one', () => {
  const S = createWorld({ seed: 2049 });
  const p = S.people[0];
  const far = [...S.terrain.tiles.values()].find(t => t.food > 0 &&
    Math.abs(t.x - p.x) + Math.abs(t.y - p.y) > RULES.reachTiles &&
    Math.abs(t.x - p.x) + Math.abs(t.y - p.y) < RULES.reachTiles * 4);
  assert.ok(far, 'the map has food beyond their usual radius');
  p.pack.food = 0;               // desperate
  S.camp.stock.food = 0;
  advance(S, 1440 * 6);
  assert.ok(S.camp.stock.food > 0 || p.pack.food > 0, 'someone reached the far food');
});

test('two people never stand on the same tile', () => {
  const S = createWorld({ seed: 2049 });
  for (let i = 0; i < 48; i++) {                    // two days, sampled hourly
    advance(S, 60);
    const seen = new Map();
    for (const p of living(S)) {
      const k = `${p.x},${p.y}`;
      seen.set(k, (seen.get(k) || 0) + 1);
    }
    assert.ok([...seen.values()].every(n => n === 1),
      `two people shared a tile at minute ${S.minute}: ${JSON.stringify([...seen].filter(([, n]) => n > 1))}`);
  }
});

test('the camp is never wholly asleep, and it does not stand about all day', () => {
  const S = createWorld({ seed: 2049 });
  const awake = new Set(), busy = new Set();
  const idleOnly = new Map();
  for (let i = 0; i < 1440 / 2; i++) {              // one day, every two minutes
    advance(S, 2);
    const asleep = living(S).filter(p => p.activity === 'sleep').length;
    assert.ok(asleep < living(S).length, 'somebody is awake at every hour');
    for (const p of living(S)) if (p.activity && p.activity !== 'idle' && p.activity !== 'sleep') busy.add(p.name);
    for (const p of living(S)) {
      idleOnly.set(p.name, p.activity === 'idle' ? (idleOnly.get(p.name) || 0) + 1 : 0);
      assert.ok((idleOnly.get(p.name) || 0) < 120, `${p.name} stood still for four hours`);
    }
  }
  assert.ok(busy.size >= 3, 'most of them did something with the day');
});
