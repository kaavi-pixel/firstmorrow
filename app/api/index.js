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
import {
  sessionEmail, canSpeed, speedFor, signSession, readCookies, newState, googleAuthUrl, emailFromCode, oauthCookies,
} from '../kernel/auth.mjs';

const SEED = Number(process.env.FM_SEED || 2049);

// Sign-in is configured by environment, and off until it is. No client or secret
// in the environment and the routes answer honestly rather than pretending.
const AUTH_SECRET = process.env.FM_SESSION_SECRET || null;
const GOOGLE = process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
  ? { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET }
  : null;

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

  const proto = req.headers['x-forwarded-proto'] || 'http';
  const secure = proto === 'https' ? '; Secure' : '';

  // ---------------------------------------------------- sign-in with Google
  if (url.pathname === '/api/auth/begin') {
    if (!AUTH_SECRET || !GOOGLE) {
      res.statusCode = 503;
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify({ error: 'Sign-in is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and FM_SESSION_SECRET.' }));
    }
    const state = newState();
    const redirectUri = `${proto}://${req.headers.host}/api/auth/callback`;
    res.statusCode = 302;
    res.setHeader('location', googleAuthUrl({ clientId: GOOGLE.clientId, redirectUri, state }));
    res.setHeader('set-cookie', `${oauthCookies().state}=${state}; Max-Age=600; Path=/; HttpOnly; SameSite=Lax${secure}`);
    return res.end();
  }
  if (url.pathname === '/api/auth/callback') {
    if (!AUTH_SECRET || !GOOGLE) { res.statusCode = 503; return res.end('Sign-in is not configured.'); }
    const cookies = readCookies(req.headers.cookie);
    const code = url.searchParams.get('code'), state = url.searchParams.get('state');
    if (!code || !state || state !== cookies[oauthCookies().state]) { res.statusCode = 400; return res.end('The sign-in attempt did not match. Try again.'); }
    try {
      const redirectUri = `${proto}://${req.headers.host}/api/auth/callback`;
      const email = await emailFromCode({ code, clientId: GOOGLE.clientId, clientSecret: GOOGLE.clientSecret, redirectUri });
      const token = signSession(email, AUTH_SECRET);
      res.statusCode = 302;
      res.setHeader('location', '/');
      res.setHeader('set-cookie', `${oauthCookies().session}=${encodeURIComponent(token)}; Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax${secure}`);
      return res.end();
    } catch (e) {
      res.statusCode = 302;
      res.setHeader('location', '/');
      return res.end();
    }
  }
  if (url.pathname === '/api/auth/session') {
    const email = AUTH_SECRET ? sessionEmail(req.headers.cookie, AUTH_SECRET) : null;
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.setHeader('cache-control', 'no-store');
    return res.end(JSON.stringify({ configured: !!(AUTH_SECRET && GOOGLE), signedIn: !!email, email, canSpeed: canSpeed(email) }));
  }
  if (url.pathname === '/api/auth/signout') {
    res.statusCode = 302;
    res.setHeader('location', '/');
    res.setHeader('set-cookie', `${oauthCookies().session}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure}`);
    return res.end();
  }

  // A guarded reset. Production data is not something a passing reader should be
  // able to wipe: it is a POST, and it takes the token from the environment. With
  // no token configured the route refuses everything rather than opening up.
  if (url.pathname === '/api/reset') {
    const want = process.env.FM_RESET_TOKEN;
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('allow', 'POST');
      res.end('reset takes a POST');
      return;
    }
    if (!want || req.headers['x-fm-reset'] !== want) {
      res.statusCode = 403;
      res.end('no');
      return;
    }
    await service.reset();
    const { state } = await service.tick();       // rebuild it from the seed
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.setHeader('cache-control', 'no-store');
    res.end(JSON.stringify({ ok: true, reset: true, ...livePayload(state) }));
    return;
  }

  if (url.pathname === '/api/live' || url.pathname === '/api/tick' || url.pathname === '/api/health') {
    try {
      // Who is asking, and how fast the world may run for them. The multiplier
      // is decided here, from a signed cookie, never from the request alone.
      const email = AUTH_SECRET ? sessionEmail(req.headers.cookie, AUTH_SECRET) : null;
      const speed = speedFor(email, url.searchParams.get('speed'));
      const { state, advanced, skipped } = await service.tick({ speed });
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
        viewer: { email, canSpeed: canSpeed(email), speed },
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
