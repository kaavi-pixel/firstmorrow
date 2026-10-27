// Sign-in: a Google account, a signed cookie, and nothing else.
//
// There is no user table, no profile, no password. A visitor is either anonymous
// or an email address that Google vouched for. The only privilege in this world
// is the speed control, and it belongs to one address, held in the environment.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const SESSION_COOKIE = 'fm_session';
const OAUTH_STATE_COOKIE = 'fm_oauth_state';

export const SPEED_ACCOUNT = () => (process.env.FM_SPEED_ACCOUNT || 'kavi@bhushan.pro').toLowerCase();

const b64url = buf => Buffer.from(buf).toString('base64url');

/** Parse a cookie header into a flat object. */
export function readCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/** The one privilege: the speed control belongs to one address. */
export function canSpeed(email) {
  return !!email && String(email).toLowerCase() === SPEED_ACCOUNT();
}

/**
 * A speed multiplier for this request, or 1. Only the privileged account may ask
 * for one, and the clamp is ours, not the client's.
 */
export function speedFor(email, requested) {
  if (!canSpeed(email)) return 1;
  const n = Number(requested);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(60, Math.round(n)));
}

/** Sign a session token: payload and HMAC over it, joined with a dot. */
export function signSession(email, secret, now = Date.now(), days = 30) {
  if (!secret) throw new Error('No session secret is configured.');
  const payload = b64url(JSON.stringify({ email, exp: now + days * 86400000 }));
  const mac = b64url(createHmac('sha256', secret).update(payload).digest());
  return `${payload}.${mac}`;
}

/** Verify a session token. Returns the email, or null for anything suspect. */
export function verifySession(token, secret, now = Date.now()) {
  if (!secret || typeof token !== 'string') return null;
  const i = token.indexOf('.');
  if (i <= 0) return null;
  const payload = token.slice(0, i), mac = token.slice(i + 1);
  const want = createHmac('sha256', secret).update(payload).digest();
  let got;
  try { got = Buffer.from(mac, 'base64url'); } catch { return null; }
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!data.email || typeof data.email !== 'string' || !Number.isFinite(data.exp)) return null;
    if (data.exp < now) return null;
    return data.email;
  } catch { return null; }
}

/** The email a request is signed in as, or null. */
export function sessionEmail(cookieHeader, secret) {
  const token = readCookies(cookieHeader)[SESSION_COOKIE];
  return token ? verifySession(token, secret) : null;
}

/** Fresh state for the OAuth dance, and the cookie that carries it. */
export function newState() { return randomBytes(16).toString('hex'); }

export function oauthCookies() { return { session: SESSION_COOKIE, state: OAUTH_STATE_COOKIE }; }

/**
 * The consent URL to send a visitor to. Google verifies the redirect URI against
 * what was registered for the client, so it has to be exact.
 */
export function googleAuthUrl({ clientId, redirectUri, state }) {
  const q = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email',
    state,
    prompt: 'select_account',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

/**
 * Exchange an authorization code for the account it belongs to. The token comes
 * from Google's own endpoint over TLS, so the id_token inside it needs no
 * second verification: this is the code flow's whole point.
 */
export async function emailFromCode({ code, clientId, clientSecret, redirectUri, fetchImpl = fetch }) {
  const res = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: clientId, client_secret: clientSecret,
      redirect_uri: redirectUri, grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) throw new Error(`Google refused the sign-in (${res.status}).`);
  const data = await res.json();
  if (!data.id_token) throw new Error('Google did not return an identity.');
  const part = String(data.id_token).split('.')[1];
  const claims = JSON.parse(Buffer.from(part, 'base64url').toString());
  if (!claims.email || claims.email_verified !== true) throw new Error('That account has no verified email.');
  return String(claims.email);
}
