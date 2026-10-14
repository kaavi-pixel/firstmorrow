// HTTP API shared by both hosts: server.mjs (local) and api/index.js (Vercel).
// Visitors only read. The world is advanced by the timer (POST /api/tick) or, if the timer
// is late, in the background by a visitor's read.
export function send(res, status, payload, extra = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra });
  res.end(typeof payload === 'string' ? payload : JSON.stringify(payload));
}
const forever = { 'Cache-Control': 'public, max-age=3600, s-maxage=31536000, immutable' };
const shortly = { 'Cache-Control': 'public, max-age=5, s-maxage=15, stale-while-revalidate=30' };
const STALE_MS = 150000;

// service: createWorldService(); authorizeTick(req, rawBody) -> boolean; background(promise) keeps work alive after responding.
export function createApi({ service, authorizeTick, background = p => p.catch(() => {}) }) {
  let lastKick = 0;
  return async function handle(req, res, url) {
    const path = url.pathname;
    try {
      if (path === '/api/health' && req.method === 'GET') return send(res, 200, { ok: true });
      if (path === '/api/live' && req.method === 'GET') {
        const raw = await service.live();
        const now = Date.now();
        const simAt = raw ? JSON.parse(raw).simAt : 0;
        if ((!raw || now - simAt > STALE_MS) && now - lastKick > 60000) { lastKick = now; background(service.tick()); }
        if (!raw) return send(res, 503, { error: 'The world is starting. Try again in a few seconds.' }, { 'Retry-After': '5' });
        return send(res, 200, raw, shortly);
      }
      if (path === '/api/buildings' && req.method === 'GET') {
        const want = Number(url.searchParams.get('n'));
        const list = await service.buildings();
        return send(res, 200, { buildings: list }, Number.isInteger(want) && want >= 0 && list.length >= want ? forever : {});
      }
      if (path === '/api/day' && req.method === 'GET') {
        const d = Number(url.searchParams.get('d'));
        if (!Number.isInteger(d) || d < 0 || d > 1e7) return send(res, 400, { error: 'Invalid day.' });
        const raw = await service.day(d);
        if (!raw) return send(res, 404, { error: 'That day has not happened yet.' });
        return send(res, 200, raw, forever);
      }
      if (path === '/api/tick') {
        if (req.method !== 'POST') return send(res, 405, { error: 'POST required.' });
        const chunks = []; let size = 0;
        for await (const c of req) { size += c.length; if (size > 10000) return send(res, 413, { error: 'Too large.' }); chunks.push(c); }
        if (!(await authorizeTick(req, Buffer.concat(chunks).toString('utf8')))) return send(res, 401, { error: 'Unauthorized.' });
        return send(res, 200, await service.tick());
      }
      return send(res, 404, { error: 'Not found.' });
    } catch (e) {
      console.error(e);
      return send(res, 500, { error: 'Server error.' });
    }
  };
}
