// Storage. One authoritative record per world.
//
// In development this is memory. In production the same shape is backed by
// Redis with a token-checked atomic commit, so a lease that expires can never
// let two writers interleave (the FM-001 lesson from v1, kept as a rule).

export function memoryStore() {
  let record = null;
  return {
    async load() { return record; },
    async save(state) { record = state; return { ok: true, bytes: JSON.stringify(state).length }; },
    async reset() { record = null; },
    kind: 'memory',
  };
}

// Wall-clock pacing: one real second is one simulation minute. A world left
// alone catches up when it is next read, bounded so an idle year costs nothing.
export const MAX_CATCHUP_MINUTES = 600;

export function createService({ store, build, run = null, now = Date.now, catchup = MAX_CATCHUP_MINUTES }) {
  let state = null;
  let lastReal = null;

  async function ensure() {
    if (!state) {
      const saved = await store.load();
      state = saved || build();
      lastReal = now();
      if (!saved) await store.save(state);
    }
    return state;
  }

  async function tick() {
    const S = await ensure();
    const t = now();
    const elapsed = Math.max(0, Math.floor((t - lastReal) / 1000));
    lastReal = t;
    const minutes = Math.min(elapsed, catchup);
    if (minutes > 0) {
      const { advance } = await import('./world.mjs');
      advance(S, minutes, { onProgram: null });
      await store.save(S);
    }
    return S;
  }

  return { ensure, tick, state: () => state, setState: s => { state = s; }, run };
}
