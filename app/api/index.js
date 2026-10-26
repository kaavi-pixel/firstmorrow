// Vercel entry: every /api/* request is rewritten here (see vercel.json).
//
// The world lives in Upstash Redis. It advances on read using wall-clock elapsed
// time, so it keeps going whether or not anyone is watching, and Upstash QStash
// can also call /api/tick on a schedule. Authors take their turn in the
// background, after the visitor has their answer.
import { Redis } from '@upstash/redis';
import { waitUntil } from '@vercel/functions';
import { createService, redisStore, memoryStore } from '../kernel/store.mjs';
import { createWorld } from '../kernel/world.mjs';
import { livePayload } from '../kernel/payload.mjs';
import { createCaller } from '../kernel/provider.mjs';
import { structureEnv } from '../kernel/capability.mjs';
import { runProgram } from '../kernel/sandbox.mjs';

const SEED = Number(process.env.FM_SEED || 2049);

const redis = process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
  ? new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN, automaticDeserialization: false })
  : null;

const caller = process.env.PPLX_API_KEY
  ? createCaller({
    keys: {
      perplexity: process.env.PPLX_API_KEY,
      openai: process.env.OPENAI_API_KEY,
      xai: process.env.XAI_API_KEY,
    },
  })
  : null;

const service = createService({
  store: redis ? redisStore(redis) : memoryStore(),
  build: () => createWorld({ seed: SEED }),
  caller,
  run: (code, s, S) => runProgram(code, structureEnv(S, s), SEED),
});

export const config = { maxDuration: 150 };

export default async function handler(req, res) {
  const url = new URL(req.url, 'https://firstmorrow.world');
  const sub = url.searchParams.get('path');
  if (sub !== null) url.pathname = `/api/${sub}`;

  if (url.pathname === '/api/live' || url.pathname === '/api/tick' || url.pathname === '/api/health') {
    try {
      const { state, advanced, skipped } = await service.tick();
      // Answer first; let the authors work afterwards. A beat carries a turn for
      // every author, because the next beat may be an hour away. A reader who is
      // just watching the world gets the one turn the hourly interval allows.
      const beat = url.pathname === '/api/tick';
      const turns = Math.max(1, Math.min(8, Number(url.searchParams.get('turns') || (beat ? 3 : 1))));
      waitUntil(service.maybeAuthorTurn({ max: turns }).catch(() => {}));
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.setHeader('cache-control', 'no-store');
      res.end(JSON.stringify({
        ...livePayload(state),
        server: {
          storage: service.kind,
          authors: caller ? 'enabled' : 'disabled',
          advancedMinutes: advanced ?? 0,
          skipped: skipped ?? null,
        },
      }));
      return;
    } catch (e) {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: e.message }));
      return;
    }
  }

  res.statusCode = 404;
  res.end('not found');
}
