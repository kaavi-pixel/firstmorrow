// A heartbeat for the world.
//
// In production the same beat comes from a cron hitting /api/tick: the world
// advances to now, and the authors take their turn. This runs the identical
// service on an in-memory world, so the loop can be watched on a laptop.
//
//   npm run loop                 one beat every 5 seconds, until stopped
//   npm run loop -- --once       a single beat, for a check
//   npm run loop -- --every 30   a beat every 30 seconds
//
// Without a key in the environment (or in .env.local, where the Vercel CLI
// leaves it) the world still lives and the people still work: there is simply
// nobody thinking. That is stated on the first line rather than faked.

import { readFileSync } from 'node:fs';
import { createService, memoryStore } from './kernel/store.mjs';
import { createWorld } from './kernel/world.mjs';
import { livePayload } from './kernel/payload.mjs';
import { createCaller } from './kernel/provider.mjs';
import { structureEnv } from './kernel/capability.mjs';
import { runProgram } from './kernel/sandbox.mjs';

try {
  for (const line of readFileSync(new URL('./.env.local', import.meta.url), 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* no .env.local is fine */ }

const flag = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
};
const EVERY_MS = Number(flag('every', 5)) * 1000;
const ONCE = process.argv.includes('--once');
const SEED = Number(process.env.FM_SEED || 2049);
// The level, read where environments live. `public/terrain.mjs` must never read one:
// every client import of it would die on `process is not defined`.
const SUBDIVISIONS = Math.max(1, Number(process.env.FM_SUBDIVISIONS || 14));

const keys = {
  perplexity: process.env.PPLX_API_KEY,
  openai: process.env.OPENAI_API_KEY,
  xai: process.env.XAI_API_KEY,
};
const caller = keys.perplexity || keys.openai || keys.xai ? createCaller({ keys }) : null;

const service = createService({
  store: memoryStore(),
  build: () => createWorld({ seed: SEED, subdivisions: SUBDIVISIONS }),
  caller,
  run: (code, s, S) => runProgram(code, structureEnv(S, s), SEED),
  authorIntervalMs: 0,          // watchable: one turn per beat, up to the daily budget
});

console.log(caller
  ? `authors: enabled (${SEED})`
  : 'authors: disabled, no key in env or .env.local. The world runs, nobody thinks.');

let seen = 0;
async function beat() {
  const { state, advanced } = await service.tick();
  const turn = await service.maybeAuthorTurn({ max: 3 });

  const fresh = state.log.slice(seen);
  seen = state.log.length;
  for (const line of fresh) console.log(`  [${line.kind}] ${line.text}`);

  if (turn.status !== 'waiting' && turn.status !== 'off') {
    console.log(`  turn: ${turn.status}${turn.author ? ` (${turn.author})` : ''} ${turn.detail ? `- ${turn.detail}` : ''}`);
  }

  const view = livePayload(state);
  const s = view.summary;
  const built = view.buildings.filter(b => b.built).length;
  const half = view.buildings.length - built;
  console.log(
    `day ${view.day} ${view.clock} | +${advanced}m | alive ${s.alive} food ${Math.round(s.reserveFoodDays * 10) / 10}d ` +
    `water ${Math.round(s.reserveWaterDays * 10) / 10}d health ${s.meanHealth} | ` +
    `${view.buildings.length} structures (${built} finished, ${half} half-built)`,
  );
}

await beat();
if (!ONCE) {
  for (;;) {
    await new Promise(r => setTimeout(r, EVERY_MS));
    try { await beat(); } catch (e) { console.error(`  beat failed: ${e.message}`); }
  }
}
