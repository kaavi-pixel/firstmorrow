// Sign-in and the one privilege it carries: the speed control.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  signSession, verifySession, sessionEmail, readCookies, canSpeed, speedFor,
  googleAuthUrl, emailFromCode,
} from '../kernel/auth.mjs';
import { createWorld } from '../kernel/world.mjs';
import { createService, memoryStore } from '../kernel/store.mjs';

const SECRET = 'test-secret-that-is-long-enough';

test('a session round-trips through a cookie', () => {
  const token = signSession('kavi@bhushan.pro', SECRET);
  const header = `other=1; fm_session=${encodeURIComponent(token)}; after=2`;
  assert.equal(sessionEmail(header, SECRET), 'kavi@bhushan.pro');
});

test('a tampered session is refused', () => {
  const token = signSession('kavi@bhushan.pro', SECRET);
  assert.equal(verifySession(token.slice(0, -2) + 'xx', SECRET), null, 'the MAC has to match');
  assert.equal(verifySession(token, 'a-different-secret'), null, 'and it has to be ours');
  assert.equal(verifySession('nonsense', SECRET), null);
  assert.equal(verifySession('', SECRET), null);
});

test('an expired session is refused', () => {
  const now = Date.now();
  const token = signSession('kavi@bhushan.pro', SECRET, now - 31 * 86400000, 30);
  assert.equal(verifySession(token, SECRET, now), null, 'a month later it is gone');
});

test('cookies parse without surprises', () => {
  const c = readCookies('a=1; fm_session=abc%20def; b=2');
  assert.equal(c.a, '1');
  assert.equal(c.fm_session, 'abc def');
  assert.deepEqual(readCookies(''), {});
});

test('the speed privilege belongs to one address', () => {
  process.env.FM_SPEED_ACCOUNT = 'kavi@bhushan.pro';
  assert.equal(canSpeed('kavi@bhushan.pro'), true);
  assert.equal(canSpeed('KAVI@bhushan.pro'), true, 'case is not a security boundary');
  assert.equal(canSpeed('someone@gmail.com'), false);
  assert.equal(canSpeed(null), false);

  // Only that account can ask for a multiplier, and the clamp is the server's.
  assert.equal(speedFor('kavi@bhushan.pro', '30'), 30);
  assert.equal(speedFor('kavi@bhushan.pro', '500'), 60, 'clamped, not trusted');
  assert.equal(speedFor('kavi@bhushan.pro', 'nonsense'), 1);
  assert.equal(speedFor('someone@gmail.com', '30'), 1, 'everyone else watches at the real pace');
  assert.equal(speedFor(null, '30'), 1);
  delete process.env.FM_SPEED_ACCOUNT;
});

test('the consent URL says exactly what Google expects', () => {
  const url = new URL(googleAuthUrl({ clientId: 'cid', redirectUri: 'https://firstmorrow.world/api/auth/callback', state: 'st' }));
  assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(url.searchParams.get('client_id'), 'cid');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://firstmorrow.world/api/auth/callback');
  assert.equal(url.searchParams.get('state'), 'st');
  assert.equal(url.searchParams.get('scope'), 'openid email');
});

test('a code becomes an email, and an unverified one becomes nothing', async () => {
  const idToken = `x.${Buffer.from(JSON.stringify({ email: 'kavi@bhushan.pro', email_verified: true })).toString('base64url')}.y`;
  const ok = async () => ({ ok: true, json: async () => ({ id_token: idToken }) });
  assert.equal(await emailFromCode({ code: 'c', clientId: 'cid', clientSecret: 'cs', redirectUri: 'r', fetchImpl: ok }), 'kavi@bhushan.pro');

  const unverified = `x.${Buffer.from(JSON.stringify({ email: 'kavi@bhushan.pro', email_verified: false })).toString('base64url')}.y`;
  const bad = async () => ({ ok: true, json: async () => ({ id_token: unverified }) });
  await assert.rejects(emailFromCode({ code: 'c', clientId: 'cid', clientSecret: 'cs', redirectUri: 'r', fetchImpl: bad }), /verified/);

  const refused = async () => ({ ok: false, status: 400, json: async () => ({}) });
  await assert.rejects(emailFromCode({ code: 'c', clientId: 'cid', clientSecret: 'cs', redirectUri: 'r', fetchImpl: refused }), /refused/);
});

test('a privileged tick advances the world faster, and the cap still holds', async () => {
  let t = 1_000_000_000_000;
  const service = createService({ store: memoryStore(), build: () => createWorld({ seed: 2049 }), now: () => t });
  await service.tick();                                  // stamps the clock
  t += 10_000;
  assert.equal((await service.tick()).advanced, 10, 'ten real seconds are ten minutes at 1x');
  t += 10_000;
  assert.equal((await service.tick({ speed: 5 })).advanced, 50, 'and fifty at 5x');
  t += 60_000;
  assert.equal((await service.tick()).advanced, 60, 'back to the real pace for everyone else');
  t += 100_000_000;
  const capped = await service.tick({ speed: 60 });
  assert.equal(capped.advanced, 1440, 'one read can still only claim a day');
});
