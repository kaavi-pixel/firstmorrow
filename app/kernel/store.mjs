// Storage and the world service.
//
// One authoritative record per world. Locally that is memory; in production it is
// Upstash Redis behind a token-checked atomic commit, so a lease that expires can
// never let two writers interleave. That is the FM-001 lesson from v1, kept as a
// rule rather than relearned.
//
// The v2 keys are deliberately NOT the v1 keys. Deploying this must not touch the
// first attempt's world, its history, or its pre-exploration backup.

import { randomUUID } from 'node:crypto';
import { createTerrain, addWildFood } from '../public/terrain.mjs';

export const KEYS = Object.freeze({
  world: 'fm2:world',
  lock: 'fm2:lock',
  sched: 'fm2:sched',
});

// JSON has no Map. The terrain is a Map, so without this every request after the
// first one crashed on `terrain.tiles.values is not a function`. Tag Maps on the
// way out and rebuild them on the way in.
const MAP_TAG = '__fm_map';
export const encodeState = S => JSON.stringify(S, (_k, v) => (v instanceof Map ? { [MAP_TAG]: [...v] } : v));
export const decodeState = raw => JSON.parse(raw, (_k, v) => {
  if (v && typeof v === 'object' && Array.isArray(v[MAP_TAG])) return new Map(v[MAP_TAG]);
  return v;
});

// A record written before the Map fix has an empty object where the tiles should
// be. Keep the people, structures and clock; rebuild the land from its seed.
export function repairState(S) {
  if (!S) return S;
  if (!S.terrain || !(S.terrain.tiles instanceof Map) || S.terrain.tiles.size === 0) {
    S.terrain = createTerrain(S.seed ?? 2049);
  }
  // A world saved before wild food existed gets it once, keeping everything it
  // has already used up.
  addWildFood(S.terrain);
  return S;
}

// Redis runs each script atomically. Both the commit and the release compare the
// lease token, so an expired worker cannot overwrite newer work.
export const COMMIT_SCRIPT = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
local kind = redis.call('TYPE', KEYS[2]).ok
if kind ~= 'none' and kind ~= 'string' then
  return redis.error_reply('World record has an unexpected type')
end
redis.call('SET', KEYS[2], ARGV[2])
return 1
`;
export const RELEASE_SCRIPT = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
return redis.call('DEL', KEYS[1])
`;

const LOCK_TTL_S = 30;

/** In-memory store: the same interface, one indivisible mutation, no network. */
export function memoryStore() {
  const m = new Map();
  return {
    kind: 'memory',
    async acquire(token) { if (m.has(KEYS.lock)) return false; m.set(KEYS.lock, token); return true; },
    async release(token) { if (m.get(KEYS.lock) !== token) return false; m.delete(KEYS.lock); return true; },
    async load() { const raw = m.get(KEYS.world); return raw ? decodeState(raw) : null; },
    async commit(token, state) {
      if (m.get(KEYS.lock) !== token) return false;
      m.set(KEYS.world, encodeState(state));
      return true;
    },
    async reset() { m.clear(); },
  };
}

/** Upstash Redis over REST, with the lock and commit as single Redis operations. */
export function redisStore(redis) {
  return {
    kind: 'redis',
    async acquire(token) { return (await redis.set(KEYS.lock, token, { nx: true, ex: LOCK_TTL_S })) === 'OK'; },
    async release(token) { return Number(await redis.eval(RELEASE_SCRIPT, [KEYS.lock], [token])) === 1; },
    async load() {
      const raw = await redis.get(KEYS.world);
      if (!raw) return null;
      return decodeState(typeof raw === 'string' ? raw : JSON.stringify(raw));
    },
    async commit(token, state) {
      const ok = Number(await redis.eval(COMMIT_SCRIPT, [KEYS.lock, KEYS.world], [token, encodeState(state)])) === 1;
      return ok;
    },
    async reset() { await redis.del(KEYS.world); },
  };
}

// Wall-clock pacing: one real second is one simulation minute. A world left alone
// catches up when it is next read, bounded so an idle year costs nothing.
export const MAX_CATCHUP_MINUTES = 1440;

export function createService({
  store, build, caller = null, run = null,
  now = Date.now, catchup = MAX_CATCHUP_MINUTES,
  authorIntervalMs = Number(process.env.FM_AUTHOR_INTERVAL_MS || 60 * 60 * 1000),
}) {
  let cache = null;

  async function read() {
    if (cache) return cache;
    cache = repairState((await store.load()) || build());
    return cache;
  }

  /** Advance the world to now and commit it. Safe to call from anywhere, often. */
  async function tick() {
    const token = randomUUID();
    let held = false;
    try {
      if (typeof store.acquire === 'function') {
        held = await store.acquire(token);
        if (!held) return { state: await read(), skipped: 'busy' };
      }
      const S = await read();
      const t = now();
      const elapsed = Math.max(0, Math.floor((t - (S.wallClock ?? t)) / 1000));
      const minutes = Math.min(elapsed, catchup);
      S.wallClock = t;
      if (minutes > 0) {
        const { advance } = await import('./world.mjs');
        advance(S, minutes, { run });
      }
      if (typeof store.commit === 'function') {
        const ok = await store.commit(token, S);
        if (!ok) return { state: S, skipped: 'lock-lost' };
      }
      return { state: S, advanced: minutes };
    } finally {
      if (held) { try { await store.release(token); } catch { /* the lease expires on its own */ } }
    }
  }

  /**
   * Author turns, if the interval and the daily budget allow them.
   *
   * One beat, one turn, is only enough when someone is watching the world once a
   * minute. A cron may come once an hour, or once a day, and the world will have
   * moved a long way in between, so a beat takes up to `max` turns: one per
   * author in the round, stopping the moment the day's budget is spent.
   */
  async function maybeAuthorTurn({ max = 1 } = {}) {
    if (!caller) return { status: 'off' };
    const S = await read();
    const t = now();
    if (t - (S.lastTurnAt || 0) < authorIntervalMs) return { status: 'waiting' };
    S.lastTurnAt = t;
    const { authorTurn } = await import('./authors.mjs');
    const turns = [];
    for (let i = 0; i < Math.max(1, max); i++) {
      const turn = await authorTurn(S, { call: caller, now: t });
      turns.push(turn);
      // Nothing left to spend, or nothing left to reach: the rest of the round waits.
      if (turn.status === 'budget' || turn.status === 'error' || turn.status === 'off') break;
    }
    await tick();                       // commit the turns and any time that passed
    return turns.length === 1 ? turns[0] : { ...turns[turns.length - 1], turns };
  }

  return {
    ensure: read, tick, maybeAuthorTurn,
    state: () => cache,
    setState: s => { cache = s; },
    reset: async () => { cache = null; await store.reset?.(); },
    kind: store.kind,
  };
}
