// The sandbox: hard caps, no host, no escape.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runProgram, ProgramError, CAPS } from '../kernel/sandbox.mjs';

test('a program cannot run away', () => {
  assert.throws(() => runProgram('while(true){}', {}, 1), ProgramError);
});

test('a program has no host to reach for', () => {
  const out = runProgram('return {p:typeof process,r:typeof require,f:typeof fetch,w:typeof window};', {}, 1);
  assert.deepEqual(out, { p: 'undefined', r: 'undefined', f: 'undefined', w: 'undefined' });
});

test('the world it sees is frozen', () => {
  assert.throws(() => runProgram('env.self.health=999;return {};', { self: { health: 1 } }, 1), ProgramError);
});

test('no async, no oversized source, no oversized output', () => {
  assert.throws(() => runProgram('return Promise.resolve({});', {}, 1), ProgramError);
  assert.throws(() => runProgram('return {say:"x".repeat(99999)};', {}, 1), ProgramError);
  assert.throws(() => runProgram('x'.repeat(CAPS.codeBytes + 1), {}, 1), ProgramError);
});

test('the same seed gives the same answer', () => {
  const code = 'return {say: String(Math.random())};';
  assert.equal(runProgram(code, {}, 7).say, runProgram(code, {}, 7).say);
  assert.notEqual(runProgram(code, {}, 7).say, runProgram(code, {}, 8).say);
});
