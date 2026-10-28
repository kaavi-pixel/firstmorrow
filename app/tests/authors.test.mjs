// The author loop, end to end.
//
// The models are stubbed, because a test may not depend on a vendor. What is
// real here is everything the loop does with their answer: the budget, the
// parse, the gate, the refusal, the people building it by hand, and the code
// running once a day afterwards.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, advance, living, dayIndex, MINUTES_PER_DAY } from '../kernel/world.mjs';
import { authorTurn, runAuthorTurn, nextAuthor, budget, parseAuthorReply, CALLS_PER_REAL_DAY } from '../kernel/authors.mjs';
import { authorView, structureEnv } from '../kernel/capability.mjs';
import { createService, memoryStore } from '../kernel/store.mjs';
import { terrainAt } from '../public/terrain.mjs';
import { runProgram } from '../kernel/sandbox.mjs';

const NOW = Date.UTC(2026, 9, 26, 9, 0, 0);

/** A stand-in for a model: it answers with exactly this. */
const says = payload => async () => ({ text: typeof payload === 'string' ? payload : JSON.stringify(payload) });

/** A walkable cell within survey range of camp, with something in the ground.
 *  The survey is a hex ball of cells now, so it carries `at` and `steps`. */
function spotNear(S, authorId = S.authors[0].id) {
  const v = authorView(S, authorId);
  const t = v.observed.find(t =>
    t.region !== 'sea' && t.material > 0 &&
    t.at !== S.camp.at &&
    t.steps <= 16 &&
    !S.structures.some(s => s.at === t.at));
  assert.ok(t, 'the survey should offer somewhere to build');
  return t;
}

const runner = (code, s, S) => runProgram(code, structureEnv(S, s), 1);

// ---------------------------------------------------------------- the reply

test('the reply is dug out of whatever the model wrapped it in', () => {
  const body = { think: 'water first', tell: 'digging', build: { name: 'Well', description: 'A well, so the camp has water within reach of the tents.', at: 3, mass: 12, form: 'hut', program: 'return {labor: 1};' } };
  for (const wrapped of [
    JSON.stringify(body),
    '```json\n' + JSON.stringify(body) + '\n```',
    'Here is my design:\n' + JSON.stringify(body) + '\nLet me know.',
  ]) {
    const r = parseAuthorReply(wrapped);
    assert.equal(r.build.name, 'Well');
    assert.equal(r.think, 'water first');
    assert.equal(r.tell, 'digging');
  }
});

test('an unusable reply is refused rather than guessed at', () => {
  assert.throws(() => parseAuthorReply(''), /Empty reply/);
  assert.throws(() => parseAuthorReply('I have no idea.'), /no JSON object/);
  assert.throws(() => parseAuthorReply('{oops'), /no JSON object|valid JSON/);
  assert.throws(() => parseAuthorReply('[1,2,3]'), /no JSON object|not an object/);
  assert.throws(() => parseAuthorReply('{"build":"a hut"}'), /must be an object or null/);
  assert.throws(() => parseAuthorReply(JSON.stringify({ build: { at: 1, mass: 5, form: 'hut', sprite: ['short'] } })), /16×16|16/);
});

test('an author may say nothing is worth building yet', () => {
  const r = parseAuthorReply(JSON.stringify({ think: 'we have four days of water', tell: 'holding', build: null }));
  assert.equal(r.build, null);
});

// ---------------------------------------------------------------- the budget

test('the day has a hard call budget and it is shared out', () => {
  const S = createWorld();
  const picks = [];
  for (let i = 0; i < CALLS_PER_REAL_DAY; i++) {
    const p = nextAuthor(S, NOW);
    assert.equal(p.status, 'go', `turn ${i} should be allowed`);
    picks.push(p.author.id);
  }
  assert.equal(nextAuthor(S, NOW).status, 'budget', 'and then the day is spent');
  assert.equal(budget(S, NOW).used, CALLS_PER_REAL_DAY);
  assert.equal(new Set(picks).size, S.authors.length, 'every author got a turn');

  const counts = picks.reduce((m, id) => ({ ...m, [id]: (m[id] || 0) + 1 }), {});
  assert.ok(Math.max(...Object.values(counts)) - Math.min(...Object.values(counts)) <= 1,
    `turns should be even, got ${JSON.stringify(counts)}`);

  const tomorrow = nextAuthor(S, NOW + 24 * 3600 * 1000);
  assert.equal(tomorrow.status, 'go', 'a new real day resets the budget');
});

// ---------------------------------------------------------------- the turn

test('an author proposes, the gate accepts, and the structure is theirs', async () => {
  const S = createWorld();
  const spot = spotNear(S);
  const materialBefore = S.camp.stock.material;

  const r = await authorTurn(S, {
    call: says({
      think: 'they need a roof before the first storm',
      tell: 'Engineer, I am starting a lean-to.',
      build: { name: 'Lean-to', description: 'A lean-to, so three people have a roof before the first storm.', at: spot.at, mass: 9, form: 'hut', shelter: 3, program: 'return { labor: 1, draw: { material: 1 } };' },
    }),
    now: NOW,
  });

  assert.equal(r.status, 'planned', JSON.stringify(r));
  const who = S.authors.find(a => a.calls > 0);
  assert.equal(who.calls, 1);
  assert.equal(who.thought, 'they need a roof before the first storm');
  assert.ok(S.council.some(m => m.from === who.id), 'the others heard about it');

  const site = S.structures.at(-1);
  assert.equal(site.name, 'Lean-to');
  assert.equal(site.authorId, who.id, 'a structure belongs to the author who designed it');
  assert.equal(site.built, false, 'nothing is finished the moment it is designed');
  assert.equal(site.laborHours, +(9 * 0.9).toFixed(1), 'the kernel computes the labour from the mass');
  assert.equal(S.camp.stock.material, materialBefore - 9, 'and the material is hauled to the site');
});

test('a design that breaks reality is refused, and the author is told why', async () => {
  const S = createWorld();
  const spot = spotNear(S);
  const bad = { build: { name: 'Longhouse', description: 'A longhouse that shelters more people than its mass can hold.', at: spot.at, mass: 9, form: 'hut', shelter: 5 } };

  const first = await authorTurn(S, { call: says(bad), now: NOW });
  assert.equal(first.status, 'refused');
  assert.equal(S.structures.length, 0, 'nothing is applied on rejection');
  const who = S.authors.find(a => a.calls > 0);
  assert.match(who.lastRejection, /shelter for 5 needs at least 15/i);

  // The refusal is carried into that author's next turn, so they can correct it.
  let seen = null;
  const recording = async args => { seen = args; return { text: JSON.stringify({ think: 'smaller then', tell: 'reducing it', build: null }) }; };
  await runAuthorTurn(S, who, { call: recording });
  assert.match(seen.input.your_last_design_was_refused_because, /shelter for 5 needs at least 15/i);
  assert.equal(who.lastRejection, null, 'and cleared once they answer with something they can build');
});

test('a model that cannot be reached spends the day and does not take the world with it', async () => {
  const S = createWorld();
  const down = async () => { throw new Error('upstream 503'); };
  const r = await authorTurn(S, { call: down, now: NOW });
  assert.equal(r.status, 'error');
  const who = S.authors.find(a => a.lastError);
  assert.match(who.lastError, /503/);
  assert.equal(budget(S, NOW).used, 1, 'the call is spent either way');
  assert.ok(S.log.some(l => l.kind === 'reject' && /503/.test(l.text)));
});

test('an unusable answer is a wasted day, not a crash', async () => {
  const S = createWorld();
  const r = await authorTurn(S, { call: says('I would rather not.'), now: NOW });
  assert.equal(r.status, 'unusable');
  assert.equal(S.structures.length, 0);
});

// ---------------------------------------------------------------- the loop

test('what an author designs is built by hand, and then runs once a day', async () => {
  const S = createWorld();
  const spot = spotNear(S);
  // The camp's own chores work the ground beside it, so a cell that is to still
  // have something in it after four days of building has to be given something to
  // lose: on the planet the camp's neighbourhood is the first thing stripped.
  S.terrain.tiles.get(spot.at).material = 600;
  const standing = () => terrainAt(S.terrain, spot.at).material;

  await authorTurn(S, {
    call: says({ think: 'a hole in the ground', tell: 'digging here', build: {
      name: 'Dig', description: 'A shallow dig, to pull material out of the ground underfoot.', at: spot.at, mass: 6, form: 'hut',
      program: 'return { labor: 1, draw: { material: 1 } };' } }),
    now: NOW,
  });
  const site = S.structures.at(-1);
  assert.equal(site.built, false);

  for (let day = 0; day < 4 && !site.built; day++) advance(S, MINUTES_PER_DAY, { run: runner });
  assert.equal(site.built, true, 'the people built it, by hand, from its mass');
  assert.ok(S.log.some(l => l.kind === 'built' && l.text.includes('Dig')), 'and the world said so');

  const afterBuild = standing();
  advance(S, MINUTES_PER_DAY, { run: runner });
  assert.ok(standing() < afterBuild, `its own code ran: material ${afterBuild} -> ${standing()}`);
  assert.ok(!site.failures, 'and it did not fail');
});

test('the loop is bounded: with no author turn, nobody builds anything', () => {
  const S = createWorld();
  advance(S, 4 * MINUTES_PER_DAY, { run: runner });
  assert.equal(S.structures.length, 0, 'with no author turn, nothing is designed');
  assert.ok(!S.log.some(l => l.kind === 'plan' || l.kind === 'built'), 'and no plan is ever drawn');
  assert.ok(living(S).length > 0, 'the people live on what they can forage, for now');
});

// ---------------------------------------------------------------- the heartbeat

test('a beat advances the world and the authors take their turn', async () => {
  let clock = Date.UTC(2026, 9, 26, 9, 0, 0);
  const store = memoryStore();
  let calls = 0;
  const service = createService({
    store,
    build: () => createWorld(),
    caller: async () => { calls += 1; return { text: JSON.stringify({ think: 'no water works yet', tell: 'nothing to add', build: null }) }; },
    run: runner,
    now: () => clock,
  });

  assert.equal((await service.tick()).advanced, 0, 'the first beat starts the clock');
  // One real second is one simulation minute: an hour unvisited is two and a
  // half days in the world, and the catch-up is bounded to a single one.
  clock += 60 * 60 * 1000;
  assert.equal((await service.tick()).advanced, 1440, 'an hour alone is one day in the world, and no more');
  assert.equal(calls, 0, 'and no model has been called yet');

  const turn = await service.maybeAuthorTurn();
  assert.equal(turn.status, 'talked');
  assert.equal(calls, 1);

  assert.equal((await service.maybeAuthorTurn()).status, 'waiting', 'the interval holds the next one back');

  const saved = await store.load();
  assert.equal(saved.authors.reduce((n, a) => n + (a.calls || 0), 0), 1, 'the turn was written to the world');
  assert.equal(saved.authors.find(a => a.thought)?.thought, 'no water works yet');
  assert.equal(dayIndex(saved), 1, 'and the time it happened in was committed with it');
});

test('with no key there are no authors, and the world is left to the people', async () => {
  const service = createService({ store: memoryStore(), build: () => createWorld(), caller: null, run: runner });
  assert.equal((await service.maybeAuthorTurn()).status, 'off');
  assert.equal((await service.tick()).state.authors.length, 3, 'the three are still part of the world');
});

test('a heartbeat that keeps beating spends the day and waits for tomorrow', async () => {
  const clock = Date.UTC(2026, 9, 26, 9, 0, 0);
  let calls = 0;
  const service = createService({
    store: memoryStore(),
    build: () => createWorld(),
    caller: async () => { calls += 1; return { text: JSON.stringify({ tell: 'holding', build: null }) }; },
    run: runner,
    now: () => clock,
    authorIntervalMs: 0,
  });

  const seen = [];
  for (let i = 0; i < CALLS_PER_REAL_DAY + 2; i++) seen.push((await service.maybeAuthorTurn()).status);
  assert.equal(calls, CALLS_PER_REAL_DAY, 'the day is spent exactly once');
  assert.deepEqual(seen.slice(-2), ['budget', 'budget'], 'and then it stops calling');
});

test('one beat carries a turn for every author', async () => {
  const clock = Date.UTC(2026, 9, 26, 9, 0, 0);
  let calls = 0;
  const service = createService({
    store: memoryStore(),
    build: () => createWorld(),
    caller: async () => { calls += 1; return { text: JSON.stringify({ tell: 'holding', build: null }) }; },
    run: runner,
    now: () => clock,
    authorIntervalMs: 0,
  });

  const beat = await service.maybeAuthorTurn({ max: 3 });
  assert.equal(calls, 3, 'three authors, three calls');
  assert.equal(beat.turns.length, 3);
  assert.equal(new Set(beat.turns.map(t => t.author)).size, 3, 'and all three of them spoke');
  assert.equal(beat.status, 'talked');
});
