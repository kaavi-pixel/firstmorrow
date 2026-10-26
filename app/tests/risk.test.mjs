// Reality bites. This is the test that v1 would have failed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, advance, living, summarise, shelterAt } from '../kernel/world.mjs';

test('bare land with no authored code is lethal', () => {
  const S = createWorld({ seed: 2049 });
  assert.equal(living(S).length, 5, 'five people arrive');
  assert.equal(S.structures.length, 0, 'the land is bare');

  advance(S, 1440 * 14);

  assert.ok(S.deaths > 0, 'people must die when nothing produces food or water');
  assert.ok(S.log.some(e => e.kind === 'death'), 'a death is recorded');
  assert.ok(summarise(S).reserveFoodDays < 1, 'the food store ran out');
});

test('starvation is gradual, not instant — they get a runway', () => {
  const S = createWorld({ seed: 2049, reserveDays: 4 });
  advance(S, 1440 * 3);
  assert.equal(S.deaths, 0, 'three days in, everyone is still alive');
  assert.ok(S.camp.stock.food > 0, 'and there is still food in store');

  advance(S, 1440 * 2);
  assert.equal(S.deaths, 0, 'two days past the stores running out, nobody has died yet');
  assert.ok(living(S).some(p => p.health < 100), 'but they are weakening');
  assert.ok(living(S).some(p => p.starving > 0), 'and they are hungry');
});

test('the dead stay dead', () => {
  const S = createWorld({ seed: 2049 });
  advance(S, 1440 * 20);
  const gone = S.people.filter(p => !p.alive);
  assert.ok(gone.length > 0);
  const before = S.deaths;
  advance(S, 1440 * 5);
  assert.equal(S.people.filter(p => !p.alive).length, before >= S.deaths ? S.deaths : before, 'no resurrection');
  assert.ok(advance && shelterAt, 'helpers exported');
});
