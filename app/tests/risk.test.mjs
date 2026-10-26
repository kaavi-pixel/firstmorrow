// Reality bites — and the people look after themselves while it does.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, advance, living, summarise } from '../kernel/world.mjs';
import { RULES } from '../kernel/validate.mjs';

const dry = S => {
  for (const t of S.terrain.tiles.values()) { t.potable = 0; t.water = 0; }
  S.camp.stock.water = 0;
  for (const p of S.people) p.pack.water = 0;
};

test('the people are not passive: with water in reach they keep themselves alive', () => {
  const S = createWorld({ seed: 2049 });
  advance(S, 1440 * 20);
  assert.equal(S.deaths, 0, 'twenty days in, the spring has kept them going');
  assert.ok(S.camp.stock.water > 20, 'and they have been hauling it home');
  assert.ok(living(S).every(p => (p.thirst || 0) < 0.2), 'nobody is dangerously dry');
});

test('bare land with no authored code is still lethal — hunger and the weather take them', () => {
  const S = createWorld({ seed: 2049 });
  assert.equal(S.structures.length, 0, 'the land is bare');
  advance(S, 1440 * 400);
  assert.equal(S.deaths, 5, 'nobody survives on nothing');
  assert.ok(S.graveyard.every(g => g.cause === 'hunger' || g.cause.includes('exposure')),
    'the wild food runs out and the weather has no roof to stop it');
  assert.ok(!S.graveyard.some(g => g.cause === 'thirst'), 'not thirst — the spring held');
  assert.ok(summarise(S).reserveFoodDays < 0.1, 'and the larder is bare');
});

test('starvation follows the real timeline: fed for months, then the land is bare', () => {
  const S = createWorld({ seed: 2049 });
  advance(S, 1440 * 30);
  assert.equal(S.deaths, 0, 'at thirty days they are all still alive');
  assert.ok(living(S).every(p => (p.starving || 0) < 0.2), 'and the wild food is feeding them');
  assert.ok(summarise(S).meanHealth > 95, 'nobody is wasting away yet');
  advance(S, 1440 * 30);
  assert.equal(S.deaths, 0, 'sixty days in the land still has food on it');
  advance(S, 1440 * 60);
  assert.equal(S.deaths, 5, 'by a hundred and twenty days the wild food is gone and so are they');
  const days = S.graveyard.map(g => Math.floor(g.at / 1440));
  assert.ok(Math.min(...days) > 60, `the first death came at day ${Math.min(...days)}`);
  assert.ok(Math.max(...days) < 150, `the last death came at day ${Math.max(...days)}`);
});

test('the wild land feeds them, and the wild land runs out', () => {
  const total = S => { let t = 0; for (const x of S.terrain.tiles.values()) t += x.food || 0; return t; };
  const S = createWorld({ seed: 2049 });
  const before = total(S);
  assert.ok(before > 0, 'there is something edible on the land to begin with');
  advance(S, 1440 * 30);
  assert.equal(S.deaths, 0, 'and it keeps them alive');
  assert.ok(total(S) < before * 0.9, `they have eaten it down (${Math.round(total(S))} of ${Math.round(before)} kcal left)`);
  assert.ok(S.camp.stock.food > 0, 'and carried some of it home');
});

test('water alone kills in about three days when there is none', () => {
  const S = createWorld({ seed: 2049 });
  dry(S);
  advance(S, 1440 * 2);
  assert.equal(S.deaths, 0, 'two days without water is survivable');
  advance(S, 1440 * 2);
  assert.ok(S.deaths > 0, 'four days without water is not');
  assert.ok(S.graveyard.some(g => g.cause === 'thirst'), 'thirst is what killed them');
  const when = Math.floor(S.graveyard[0].at / 1440);
  assert.ok(when <= 4, `the first death came ${when} days in`);
  assert.equal(RULES.daysToDieWithoutWater, 3, 'and that is the number the world is built on');
});

test('the young and the old go first', () => {
  const S = createWorld({ seed: 2049 });
  dry(S);
  S.people.push({
    ...S.people[0], id: 'baby', name: 'Baby', age: 2, bornAt: S.minute, health: 100,
    pack: { water: 0, food: 0, material: 0, soil: 0 }, labor: { day: 0, used: 0 }, thirst: 0, starving: 0,
  });
  advance(S, 1440 * 3);
  assert.ok(S.graveyard.length > 0, 'someone died');
  assert.equal(S.graveyard[0].name, 'Baby', 'the two-year-old died before anyone else');
});

test('the dead stay dead', () => {
  const S = createWorld({ seed: 2049 });
  advance(S, 1440 * 200);
  assert.equal(S.people.filter(p => !p.alive).length, 5);
  advance(S, 1440 * 40);
  assert.equal(S.people.filter(p => !p.alive).length, 5, 'no resurrection');
  assert.equal(S.births, 0, 'and no children born to the dead');
});
