// Development server. Serves the shell and the live world.
// One real second is one simulation minute. Authors are optional here: with no
// key, no model is ever called and the world simply runs and kills people.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWorld } from './kernel/world.mjs';
import { createService, memoryStore } from './kernel/store.mjs';
import { livePayload, cellCard } from './kernel/payload.mjs';
import { createCaller } from './kernel/provider.mjs';
import { structureEnv } from './kernel/capability.mjs';
import { runProgram } from './kernel/sandbox.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC = join(here, 'public');
const PORT = Number(process.env.PORT || 3000);
const SEED = Number(process.env.FM_SEED || 2049);
// The level, read where environments live. `public/terrain.mjs` must never read one:
// every client import of it would die on `process is not defined`.
const SUBDIVISIONS = Math.max(1, Number(process.env.FM_SUBDIVISIONS || 14));

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
  store: memoryStore(),
  build: () => createWorld({ seed: SEED, subdivisions: SUBDIVISIONS }),
  caller,
  run: (code, s, S) => runProgram(code, structureEnv(S, s), SEED),
});

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/api/live' || url.pathname === '/api/tick') {
      const { state } = await service.tick();
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(livePayload(state)));
      // The authors get their turn after the visitor has their answer.
      service.maybeAuthorTurn().catch(() => {});
      return;
    }
    // One clicked hexagon. `ensure` rather than `tick`: reading the map must not spend
    // the world's time, and the browser asks per cell, never per poll.
    if (url.pathname === '/api/cell') {
      const state = await service.ensure();
      const card = cellCard(state, url.searchParams.get('id'));
      res.writeHead(card ? 200 : 404, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(card ? { cell: card } : { error: 'no such cell', id: url.searchParams.get('id') }));
      return;
    }
    if (url.pathname === '/api/reset') {
      await service.reset();
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ ok: true }));
    }
    const rel = url.pathname === '/' ? '/index.html' : url.pathname;
    const path = join(PUBLIC, normalize(rel).replace(/^(\.\.[/\\])+/, ''));
    const body = await readFile(path);
    res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch (e) {
    if (e.code === 'ENOENT' || e.code === 'EISDIR') { res.writeHead(404); return res.end('not found'); }
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
});

server.listen(PORT, () => console.log(`Firstmorrow v2 on http://localhost:${PORT} — authors ${caller ? 'enabled' : 'disabled (no key)'}.`));
