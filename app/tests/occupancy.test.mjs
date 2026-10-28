// One human to a cell — and people who are not standing about.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, advance, living } from '../kernel/world.mjs';
import { cellsWithin, neighbours, walkable } from '../public/terrain.mjs';

const key = p => p.at;

test('five people arrive on five cells, not one', () => {
  const S = createWorld({ seed: 2049 });
  const cells = new Set(living(S).map(key));
  assert.equal(cells.size, 5, 'every arrival has a cell of their own');
});

test('no two people ever stand on the same cell', () => {
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
  assert.equal(worst, 0, 'nobody ever shares a cell, on any tick');
});

test('a person in the way is walked around, not walked through', () => {
  const S = createWorld({ seed: 2049 });
  // Somebody parked on the way out of camp, with a neighbour behind them: the
  // block is four steps from home with the blocker three, on the same path.
  const out = cellsWithin(S.terrain, S.camp.at, 4);
  const p = living(S)[0];
  p.at = [...out.keys()].find(at => out.get(at) === 4);
  const blocker = living(S)[1];
  blocker.at = neighbours(S.terrain, p.at).find(at => out.get(at) === 3) ?? p.at;
  const other = living(S)[2];
  if (!out.has(other.at)) other.at = neighbours(S.terrain, S.camp.at).find(at => walkable(S.terrain, at));
  for (let i = 0; i < 240; i++) {
    advance(S, 2);
    const seen = new Set();
    for (const q of living(S)) { assert.ok(!seen.has(key(q)), 'no cell is ever shared'); seen.add(key(q)); }
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
