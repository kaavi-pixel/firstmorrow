// Loads, advances and stores the one shared world. Storage is a small key-value interface
// so the same code runs on Upstash Redis (Vercel) and in memory (local and tests).
import { randomUUID } from 'node:crypto';
import { freshState, advance, needsProposal, markRequested, proposalInput, applyProposal, failPlan,
  splitState, joinState, livePayload } from './sim.mjs';
import { runBehavior } from './runner.mjs';
import { migrateGeography } from '../public/geography.js';
import { observe } from '../public/exploration.js';

export const WORLD_KEYS = Object.freeze({ core: 'fm:core', live: 'fm:live', statics: 'fm:b', days: 'fm:days', lock: 'fm:lock' });
const K = WORLD_KEYS;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const asObject = v => Array.isArray(v) ? Object.fromEntries(v.reduce((a, x, i) => (i % 2 ? a[a.length - 1].push(x) : a.push([x]), a), [])) : (v || {});

export function memoryKv(clock = Date.now) {
  const m = new Map(), h = new Map(), exp = new Map();
  const alive = k => { if (exp.has(k) && exp.get(k) <= clock()) { m.delete(k); exp.delete(k); } return m.has(k); };
  return {
    async get(k) { return alive(k) ? m.get(k) : null; },
    async set(k, v) { m.set(k, v); exp.delete(k); },
    async setnx(k, v, ttl) { if (alive(k)) return false; m.set(k, v); exp.set(k, clock() + ttl * 1000); return true; },
    async del(k) { m.delete(k); exp.delete(k); },
    async hset(k, o) { const t = h.get(k) || new Map(); for (const [f, v] of Object.entries(o)) t.set(f, v); h.set(k, t); },
    async hget(k, f) { return h.get(k)?.get(f) ?? null; },
    async hgetall(k) { return Object.fromEntries(h.get(k) || []); },
    async hlen(k) { return h.get(k)?.size || 0; },
    async release(k, token) {
      if (!alive(k) || m.get(k) !== token) return false;
      m.delete(k); exp.delete(k); return true;
    },
    async commit(token, { core, live, statics, days }) {
      if (!alive(K.lock) || m.get(K.lock) !== token) return false;
      // No await: the in-memory adapter applies one indivisible mutation.
      for (const [key, values] of [[K.statics, statics], [K.days, days]]) {
        const target = h.get(key) || new Map();
        for (const [id, value] of Object.entries(values)) target.set(id, value);
        h.set(key, target);
      }
      m.set(K.core, core); m.set(K.live, live); return true;
    }
  };
}

export function createWorldService({ kv, propose, run = runBehavior, clock = Date.now, budgetMs = 20000, geographyEnabled = false, planningEnabled = true }) {
  if (typeof kv.commit !== 'function' || typeof kv.release !== 'function')
    throw new Error('World storage requires atomic commit and lock release.');
  let cache = { count: -1, byId: {} };
  async function load() {
    const raw = await kv.get(K.core); if (!raw) return null;
    const core = JSON.parse(raw);
    if (cache.count !== core.staticCount || core.world.buildings.some(b => !cache.byId[b.id])) {
      const all = asObject(await kv.hgetall(K.statics));
      cache = { count: core.staticCount, byId: Object.fromEntries(Object.entries(all).map(([k, v]) => [k, typeof v === 'string' ? JSON.parse(v) : v])) };
    }
    const state = joinState(core, cache.byId);
    state.world = migrateGeography(state.world, { enabled: geographyEnabled });
    return state;
  }
  async function save(S, snapshots, now, token) {
    const { core, statics } = splitState(S);
    const fresh = statics.filter(s => !cache.byId[s.id]);
    const committed = await kv.commit(token, {
      statics: Object.fromEntries(fresh.map(s => [s.id, JSON.stringify(s)])),
      days: Object.fromEntries(snapshots.map(d => [String(d.day), JSON.stringify(d)])),
      core: JSON.stringify(core), live: JSON.stringify(livePayload(S, now))
    });
    if (!committed) throw new Error('Simulation lock expired; no world changes were committed.');
    for (const s of fresh) cache.byId[s.id] = s;
    cache.count = statics.length;
  }
  async function withLock(fn) {
    const token = randomUUID();
    if (!(await kv.setnx(K.lock, token, 90))) return { busy: true };
    try { return await fn(token); }
    finally { try { await kv.release(K.lock, token); } catch {} }
  }
  // Advance to now, store, and if the AI is due to think, ask it outside the lock.
  async function tick() {
    let request = null;
    const out = await withLock(async token => {
      const now = clock();
      let S = await load();
      if (!S) { S = freshState(now); S.world.history.push({ day: 0, minute: S.world.minute, text: 'Five people arrive on bare land' }); }
      if (!planningEnabled) S.planningPaused = true;
      else delete S.planningPaused;
      S.world = migrateGeography(S.world, { enabled: geographyEnabled });
      if (S.world.exploration) for (const p of S.world.inhabitants) observe(S.world, p.id);
      const snaps = await advance(S, now, run, budgetMs);
      if (propose && needsProposal(S, now)) { markRequested(S, now); request = { planId: S.plan.id, input: proposalInput(S) }; }
      await save(S, snaps, now, token);
      return { day: S.world.day + 1, minute: S.world.minute, behindMs: now - S.simAt, days: snaps.length, proposing: !!request };
    });
    if (out.busy || !request) return out;
    let result = null, error = null;
    try { result = await propose(request.input); } catch (e) { error = String(e?.message || 'Proposal failed.'); }
    for (let i = 0; i < 40; i++) {
      const r = await withLock(async token => {
        const now = clock(), S = await load(), snaps = await advance(S, now, run, budgetMs);
        const applied = error ? failPlan(S, error, request.planId) : applyProposal(S, request.planId, result);
        await save(S, snaps, now, token); return { applied };
      });
      if (!r.busy) { out.applied = r.applied; out.error = error || undefined; break; }
      await sleep(1500);
    }
    return out;
  }
  return {
    tick, load,
    async live() { return kv.get(K.live); },
    async day(d) { return kv.hget(K.days, String(d)); },
    async buildings() { return Object.values(asObject(await kv.hgetall(K.statics))).map(v => typeof v === 'string' ? JSON.parse(v) : v); }
  };
}
