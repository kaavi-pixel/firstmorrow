// Local host: static files plus the API, with the world in memory and an internal timer.
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createApi, send } from './lib/api.mjs';
import { createWorldService, memoryKv } from './lib/world.mjs';
import { createProposer } from './lib/propose.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, 'public');
const service = createWorldService({
  kv: memoryKv(), propose: process.env.FM_PREVIEW === '1' ? null : createProposer(process.env.PPLX_API_KEY),
  decide: process.env.FM_PREVIEW === '1' ? null : createProposer(process.env.PPLX_API_KEY, fetch, 'explore'),
  explorationEnabled: process.env.FM_EXPLORATION === '1',
  geographyEnabled: process.env.FM_GEOGRAPHY === '1', planningEnabled: process.env.FM_PREVIEW !== '1'
});
const preview = process.env.FM_PREVIEW === '1';
const apiService = preview ? { ...service, live: async () => {
  const raw = await service.live();
  return raw ? JSON.stringify({ ...JSON.parse(raw), preview: true }) : raw;
} } : service;
const api = createApi({ service: apiService, authorizeTick: async () => false });
const TICK_MS = Number(process.env.TICK_MS || 15000);
const loop = () => service.tick().catch(e => console.error(e)).finally(() => setTimeout(loop, TICK_MS));
loop();

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const port = Number(process.env.PORT || 3000);
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) return api(req, res, url);
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Method not allowed.' });
  try {
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    const full = path.resolve(root, relative);
    if (!full.startsWith(root + path.sep)) return send(res, 403, { error: 'Forbidden.' });
    const bytes = await readFile(full);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? '' : bytes);
  } catch { send(res, 404, { error: 'Not found.' }); }
}).listen(port, '0.0.0.0', () => console.log(`Firstmorrow listening on ${port}`));
