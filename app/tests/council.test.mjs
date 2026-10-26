// Several models, one world, one channel. They cooperate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, AUTHORS, advance } from '../kernel/world.mjs';
import { authorView, rulesBrief } from '../kernel/capability.mjs';
import { applyDeclarations, RULES } from '../kernel/validate.mjs';
import { PROVIDERS } from '../kernel/provider.mjs';

test('there is more than one author, and they are different models', () => {
  const S = createWorld();
  assert.ok(S.authors.length >= 3, `${S.authors.length} authors`);
  assert.equal(new Set(S.authors.map(a => a.model)).size, S.authors.length, 'each is a distinct model');
  // Production carries one provider key (Perplexity), so the council is three
  // models behind that key rather than three vendors. What matters is that they
  // are genuinely different models, each with its own role, sharing one channel.
  assert.ok(S.authors.every(a => PROVIDERS[a.provider]), 'every author uses a supported provider');
  assert.ok(AUTHORS.every(a => a.role), 'each has a role to work on');
});

test('an author can read what the others have written and said', () => {
  const S = createWorld();
  const [a0, a1] = S.authors;
  applyDeclarations(S, a0, { tell: 'I am digging for water at the spring. Engineer, can you brace the shaft?' });
  S.structures.push({ id: 's1', name: 'Brace', x: S.camp.x + 1, y: S.camp.y, mass: 20, shelter: 0, built: true, progressHours: 18, laborHours: 18, authorId: a1.id, program: 'return {labor:1};' });

  const view = authorView(S, a1.id);
  assert.equal(view.allies.length, S.authors.length - 1, 'the other authors are named as allies');
  assert.ok(view.council.some(m => m.from === a0.name), 'and their messages are visible');
  assert.ok(view.standing.some(s => s.authorId === a1.id && s.program), 'so is their code');
  assert.ok(!view.allies.some(a => a.id === a1.id), 'an author is not its own ally');
});

test('the channel is a channel, not an archive', () => {
  const S = createWorld();
  const a = S.authors[0];
  for (let i = 0; i < 200; i++) applyDeclarations(S, a, { tell: `message ${i}` });
  assert.ok(S.council.length <= 120, `the channel is bounded (${S.council.length})`);
  assert.ok(S.council[S.council.length - 1].text.endsWith('199'), 'and keeps the recent end');
});

test('a long message is cut, not accepted whole', () => {
  const S = createWorld();
  const a = S.authors[0];
  applyDeclarations(S, a, { tell: 'x'.repeat(5000) });
  assert.equal(S.council[0].text.length, RULES.tellMax);
});

test('the boundary is handed to every author, and it names the real limits', () => {
  const S = createWorld();
  const view = authorView(S, S.authors[0].id);
  assert.ok(view.boundary.includes('REALITY'));
  assert.ok(view.boundary.includes('no rescue'), 'the boundary says what it is');
  assert.ok(view.boundary.includes('die'), 'and that people can die');
  assert.equal(rulesBrief(), view.boundary);
});

test('authors do not die, age, or eat', () => {
  const S = createWorld();
  advance(S, 1440 * 90);
  assert.equal(S.authors.length, 3, 'all three are still here');
  assert.ok(S.authors.every(a => a.alive), 'none of them died with the people');
  assert.equal(S.people.filter(p => p.alive).length, 0, 'while every person did');
});
