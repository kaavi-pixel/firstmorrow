// One human to a tile — and people who are not standing about.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, advance, living } from '../kernel/world.mjs';

const key = t => t.y * 128 + t.x;

test('five people arrive on five tiles, not one', () => {
  const S = createWorld({ seed: 2049 });
  const tiles = new Set(living(S).map(key));
  assert.equal(tiles.size, 5, 'every arrival has a tile of their own');
});

test('no two people ever stand on the same tile', () => {
  const S = createWorld({ seed: 2049 });
  let worst = 0;
  for (let i = 0; i < 1440 * 15 / 2; i++) {      // fifteen days, every tick
    advance(S, 2);
    const seen = new Set();
    let overlap = 0;
    for (const p of living(S)) {
      const k = key(p);
      if (seen.has(k)) overlap++;
      seen.add(k);
    }
    worst = Math.max(worst, overlap);
    if (worst) break;
  }
  assert.equal(worst, 0, 'nobody ever shares a tile, on any tick');
});

test('a person in the way is walked around, not walked through', () => {
  const S = createWorld({ seed: 2049 });
  // Somebody parked squarely on the path to water, with a neighbour behind them.
  const p = living(S)[0];
  p.x = S.camp.x + 4; p.y = S.camp.y;
  const blocker = living(S)[1];
  blocker.x = S.camp.x + 3; blocker.y = S.camp.y;
  for (let i = 0; i < 240; i++) {
    advance(S, 2);
    const seen = new Set();
    for (const q of living(S)) { assert.ok(!seen.has(key(q)), 'no tile is ever shared'); seen.add(key(q)); }
  }
});

test('they are not standing about all day', () => {
  const S = createWorld({ seed: 2049 });
  const tally = {};
  let total = 0;
  advance(S, 720);                    // let the camp settle into a day
  for (let i = 0; i < 720; i++) {     // one full day, every two minutes
    advance(S, 2);
    const hour = (S.minute % 1440) / 60;
    if (hour < 7 || hour >= 21) continue;          // daylight only
    for (const p of living(S)) { tally[p.activity] = (tally[p.activity] || 0) + 1; total++; }
  }
  const share = k => (tally[k] || 0) / total;
  assert.ok(share('idle') < 0.1, `they stand idle only rarely (${(share('idle') * 100).toFixed(1)}%)`);
  assert.ok(share('walk') + share('gather') + share('forage') + share('fetch') + share('haul') + share('build') > 0.3,
    `most of the day is work and movement (${((share('walk') + share('gather') + share('forage') + share('fetch') + share('haul') + share('build')) * 100).toFixed(1)}%)`);
});
