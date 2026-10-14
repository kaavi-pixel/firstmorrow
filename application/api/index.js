// Vercel entry: every /api/* request is rewritten here (see vercel.json).
// The world lives in Upstash Redis; Upstash QStash calls /api/tick every 4 minutes.
import { Redis } from '@upstash/redis';
import { Client, Receiver } from '@upstash/qstash';
import { waitUntil } from '@vercel/functions';
import { createApi } from '../lib/api.mjs';
import { createWorldService } from '../lib/world.mjs';
import { createProposer } from '../lib/propose.mjs';
import { redisKv } from '../lib/redis-kv.mjs';

const redis = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN, automaticDeserialization: false });
const kv = redisKv(redis);
const service = createWorldService({
  kv, propose: createProposer(process.env.PPLX_API_KEY),
  decide: createProposer(process.env.PPLX_API_KEY, fetch, 'explore'),
  explorationEnabled: process.env.FM_EXPLORATION === '1',
  maintenance: process.env.FM_MAINTENANCE === '1',
  geographyEnabled: process.env.FM_GEOGRAPHY === '1'
});
const receiver = new Receiver({ currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY || '', nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY || '' });
const SITE = 'https://firstmorrow.world';
const TICK_URL = `${SITE}/api/tick`;

async function authorizeTick(req, body) {
  const signature = req.headers['upstash-signature'];
  if (typeof signature !== 'string') return false;
  try { return await receiver.verify({ signature, body, url: TICK_URL }); } catch { return false; }
}
// Create the 4-minute timer once. Idempotent: the fixed schedule ID makes this an update.
async function ensureSchedule() {
  if (await redis.get('fm:sched') === TICK_URL) return;
  if (!process.env.QSTASH_TOKEN) return;
  const client = new Client({ token: process.env.QSTASH_TOKEN, baseUrl: process.env.QSTASH_URL });
  await client.schedules.create({ destination: TICK_URL, cron: '*/4 * * * *', scheduleId: 'firstmorrow-tick', retries: 0, method: 'POST' });
  await redis.set('fm:sched', TICK_URL);
}
const api = createApi({ service, authorizeTick, background: p => waitUntil(Promise.all([p, ensureSchedule()]).catch(e => console.error(e))) });
let scheduled = false;

export const config = { maxDuration: 300 };
export default async function handler(req, res) {
  const url = new URL(req.url, SITE);
  const sub = url.searchParams.get('path');
  if (sub !== null) url.pathname = `/api/${sub}`;
  if (!scheduled) { scheduled = true; waitUntil(ensureSchedule().catch(e => { scheduled = false; console.error(e); })); }
  return api(req, res, url);
}
