// Ambient conversation: people and agents speak in context, and the observer can read it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, advance } from '../kernel/world.mjs';
import { livePayload } from '../kernel/payload.mjs';

test('people and agents have readable exchanges, not just isolated utterances', () => {
  const S = createWorld({ seed: 2049 });
  advance(S, 60);
  assert.ok(S.conversations.length >= 6, 'an exchange has several turns');
  assert.equal(S.conversations[0].kind, 'people');
  assert.ok(S.conversations.some(m => m.kind === 'agents'), 'the agents talk too');
  for (const m of S.conversations) {
    assert.ok(m.speaker, 'a message names its speaker');
    assert.ok(m.target, 'and who it is addressed to');
    assert.ok(m.text.length > 20, 'there is something to read');
    assert.ok(Number.isInteger(m.t));
  }
  const payload = livePayload(S);
  assert.ok(payload.conversations.length >= 6, 'the browser receives the exchange');
  assert.ok(Object.keys(payload.speech).length > 0, 'the latest speaker also gets a map bubble');
});

test('people talk about the emergency they are actually in', () => {
  const S = createWorld({ seed: 2049 });
  S.camp.stock.water = 0;
  S.camp.stock.food = 0;
  for (const p of S.people) { p.pack.water = 0; p.pack.food = 0; }
  // Keep the emergency in force for the whole exchange: this is about what they
  // say while help is unavailable, not whether they can solve it in 30 minutes.
  for (const t of S.terrain.tiles.values()) { t.potable = 0; t.food = 0; }
  advance(S, 30);
  const words = S.conversations.map(m => m.text).join(' ').toLowerCase();
  assert.match(words, /water|thirst|spring/, 'a dry camp is what they discuss');
});

test('an approaching storm enters the conversation', () => {
  const S = createWorld({ seed: 2049 });
  S.weather.storms[0] = { day: 0, hour: 12, severity: 0.8 };
  advance(S, 30);
  const words = S.conversations.map(m => m.text).join(' ').toLowerCase();
  assert.match(words, /storm|roof|shelter/, 'they notice the weather before it hits');
});

test('replies address the person being spoken to, not the speaker themselves', () => {
  const S = createWorld({ seed: 2049 });
  advance(S, 60);
  const replies = S.conversations.filter((m, i) => i % 3 === 1);
  assert.ok(replies.length >= 2, 'there are replies in the exchanges');
  for (const m of replies) {
    assert.ok(!m.text.endsWith(`, ${m.speaker}.`), `${m.speaker} addressed themselves: ${m.text}`);
    assert.ok(!m.text.endsWith(`, ${m.speaker}!`), `${m.speaker} addressed themselves: ${m.text}`);
  }
});

test('an older world starts talking now, not with a backdated conversation', () => {
  const S = createWorld({ seed: 2049 });
  S.minute = 1000;
  advance(S, 2);
  assert.equal(S.conversations.length, 0, 'no exchanges are invented for time before the feature existed');
  advance(S, 30);
  assert.ok(S.conversations.length > 0, 'the next scheduled exchange still happens');
});

test('speech stays concise and reads naturally when addressing someone', () => {
  const S = createWorld({ seed: 2049 });
  advance(S, 600);
  assert.ok(S.conversations.length > 0);
  for (const m of S.conversations) {
    assert.ok(m.text.length <= 240, `line is too long: ${m.text}`);
    const prefix = `${m.target}, `;
    const rest = m.text.startsWith(prefix) ? m.text.slice(prefix.length) : '';
    const properNoun = /^I(?:\s|$|['’])/.test(rest) || S.structures.some(s => rest.startsWith(s.name));
    assert.ok(!/^[A-Z]/.test(rest) || properNoun, `awkward vocative: ${m.text}`);
  }
});

test('addressing someone preserves a capitalised structure name', () => {
  const S = createWorld({ seed: 2049 });
  S.structures.push({
    id: 'storm-hut', name: 'Storm Hut', built: true, x: 14, y: 20,
    mass: 50, progressHours: 10, laborHours: 10,
    authorId: 'architect', description: 'A sturdy roof beside the camp.',
  });
  S.conversationClock = { nextAt: 30, turn: 1 };
  advance(S, 30);
  const opener = S.conversations.find(m => m.kind === 'agents');
  assert.ok(opener, 'the agents held their exchange');
  assert.ok(opener.text.startsWith(`${opener.target}, Storm Hut`), opener.text);
});

test('dead people do not join in, and history stays bounded', () => {
  const S = createWorld({ seed: 2049 });
  for (const p of S.people) { p.alive = false; p.health = 0; }
  advance(S, 60);
  assert.ok(S.conversations.every(m => m.kind === 'agents'), 'only the immortal agents are left to talk');
  for (let i = 0; i < 20; i++) advance(S, 60);
  assert.ok(S.conversations.length <= 120, 'the record does not grow forever');
});
