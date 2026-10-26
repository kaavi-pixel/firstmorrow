// Persistence: a world saved to storage must come back as the same world.
// The bug this exists to catch: terrain.tiles is a Map, JSON turns it into {},
// and the next request dies on `terrain.tiles.values is not a function`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../kernel/world.mjs';
import { createService, memoryStore, encodeState, decodeState, repairState } from '../kernel/store.mjs';

const START_KEY = 21 * 128 + 13;
const OASIS_KEY = 19 * 128 + 16;

test('a saved world comes back with its terrain as a real Map', async () => {
  const S = createWorld({ seed: 2049 });
  const tile = S.terrain.tiles.get(OASIS_KEY);
  assert.ok(tile && tile.potable > 0, 'the spring is there to begin with');
  tile.potable = 3.5;                       // a mark only a faithful round-trip keeps

  const store = memoryStore();
  const token = 'tok';
  assert.equal(await store.acquire(token), true);
  assert.equal(await store.commit(token, S), true);
  assert.equal(await store.release(token), true);

  const back = await store.load();
  assert.ok(back.terrain.tiles instanceof Map, 'the tiles are a Map again');
  assert.equal(back.terrain.tiles.size, S.terrain.tiles.size, 'every tile survived');
  assert.equal(back.terrain.tiles.get(OASIS_KEY).potable, 3.5, 'the spring keeps its level');
  assert.equal(back.people.length, 5, 'the people are still there');
});

test('encode/decode survive a Map and leave plain objects alone', () => {
  const round = decodeState(encodeState({ a: 1, m: new Map([[1, { x: 2 }]]) }));
  assert.ok(round.m instanceof Map);
  assert.deepEqual(round.m.get(1), { x: 2 });
  assert.equal(round.a, 1);
  const plain = decodeState(encodeState({ a: { b: 2 } }));
  assert.deepEqual(plain.a, { b: 2 });
});

test('a record saved before the Map fix is repaired on load', async () => {
  const S = createWorld({ seed: 2049 });
  S.minute = 300;
  S.people[0].health = 55;
  // The corrupt shape Redis actually holds: tiles as an empty plain object.
  const corrupt = JSON.parse(encodeState(S));
  corrupt.terrain.tiles = {};
  const store = memoryStore();
  await store.acquire('t');
  await store.commit('t', corrupt);         // encodeState leaves the plain {} alone
  await store.release('t');

  const service = createService({ store, build: () => createWorld({ seed: 2049 }) });
  const { state } = await service.tick();
  assert.ok(state.terrain.tiles instanceof Map, 'the land was rebuilt');
  assert.ok(state.terrain.tiles.size > 1000, 'the whole continent, not a stub');
  assert.equal(state.minute, 300, 'the clock was kept');
  assert.equal(state.people[0].health, 55, 'so were the people');
});

test('repairState leaves a healthy world untouched', () => {
  const S = createWorld({ seed: 2049 });
  const same = S.terrain;
  repairState(S);
  assert.equal(S.terrain, same, 'nothing was rebuilt');
});
