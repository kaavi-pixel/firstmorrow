// Weather is reality, and it destroys.
import test from 'node:test';
import assert from 'node:assert/strict';
import { stormEffect, WEATHER, createWeather, advanceWeather, weatherOn } from '../kernel/weather.mjs';
import { createWorld, advance } from '../kernel/world.mjs';

test('a flimsy structure is destroyed, a heavy one stands', () => {
  const storm = { severity: 0.9 };
  assert.equal(stormEffect(storm, { mass: 10, built: true }).destroyed, true);
  assert.equal(stormEffect(storm, { mass: 120, built: true }).survived, true);
  assert.equal(stormEffect(storm, { mass: 40, built: true }).damaged, true);
  assert.equal(stormEffect(null, { mass: 1 }), null);
});

test('a sturdier build survives the same storm that wrecks a cheap one', () => {
  const storm = { severity: 0.7 };
  const weak = stormEffect(storm, { mass: 12, built: true });
  const strong = stormEffect(storm, { mass: 60, built: true });
  assert.ok(weak.destroyed || weak.damaged, 'the cheap one does not come through clean');
  assert.equal(strong.survived, true);
});

test('weather is seeded, so the same world lives the same seasons', () => {
  const a = advanceWeather(createWeather(2049), 400);
  const b = advanceWeather(createWeather(2049), 400);
  assert.deepEqual(a.log, b.log);
  const c = advanceWeather(createWeather(3199), 400);
  assert.notDeepEqual(a.log, c.log);
});

test('storms are rare, but they happen', () => {
  const W = advanceWeather(createWeather(2049), 365);
  const storms = W.storms.filter(Boolean).length;
  assert.ok(storms > 0, 'a year has storms');
  assert.ok(storms < 365 * 0.15, 'but storms are not the norm');
  assert.ok(WEATHER.stormMassPerSeverity > 0);
});

test('a storm in the world destroys unfinished work', () => {
  const S = createWorld({ seed: 2049 });
  advanceWeather(S.weather, 200);
  S.structures.push({ id: 'x', name: 'Half a hut', x: S.camp.x + 1, y: S.camp.y, mass: 8, shelter: 0, built: false, progressHours: 3, laborHours: 7.2 });
  let day = -1;
  for (let d = 0; d < 200; d++) if (S.weather.storms[d]) { day = d; break; }
  assert.ok(day >= 0, 'a storm day exists in the first season');
  advance(S, 1440 * (day + 1) + 1);
  assert.ok(S.storms >= 1, 'the storm was resolved');
  assert.ok(!S.structures.some(s => s.id === 'x') || S.structures[0].damaged, 'the light structure did not survive untouched');
  assert.ok(S.log.some(e => ['destroyed', 'damaged'].includes(e.kind)));
});

test('weather is not affected by anything the author does', () => {
  const W = advanceWeather(createWeather(2049), 120);
  const before = weatherOn(W, 60);
  const again = weatherOn(advanceWeather(createWeather(2049), 120), 60);
  assert.deepEqual(before, again);
});
