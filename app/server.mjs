// Development server. Serves the shell and the live world.
// The world advances in real time: one real second is one simulation minute.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWorld } from './kernel/world.mjs';
import { createService, memoryStore } from './kernel/store.mjs';
import { livePayload } from './kernel/payload.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC = join(here, 'public');
const PORT = Number(process.env.PORT || 3000);

const service = createService({ store: memoryStore(), build: () => createWorld({ seed: Number(process.env.FM_SEED || 2049) }) });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/api/live') {
      const S = await service.tick();
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      return res.end(JSON.stringify(livePayload(S)));
    }
    if (url.pathname === '/api/reset') {
      await service.reset?.();
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

server.listen(PORT, () => console.log(`Firstmorrow v2 on http://localhost:${PORT} — bare world, real risk, no authored code yet.`));
