// Runs inhabitant-written code inside a QuickJS WebAssembly sandbox.
//
// The sandbox has no network, filesystem, timers, or host objects. Every call
// gets a fresh runtime with a memory limit, a stack limit and a hard deadline.
// Math.random is seeded so a replay of the same tick agrees with the original.
//
// This is deliberately the only place inhabitant-authored code is executed.
import { getQuickJS, shouldInterruptAfterDeadline } from 'quickjs-emscripten';

const QJS = await getQuickJS();

export const CAPS = Object.freeze({
  codeBytes: 8 * 1024,
  limitMs: 500,
  memoryBytes: 32 * 1024 * 1024,
  stackBytes: 512 * 1024,
  outputBytes: 18000,
});

export class ProgramError extends Error {}

// code  -> a function body (may use `return`). Receives a frozen `env`.
// Returns the parsed declaration object, or throws ProgramError.
export function runProgram(code, env, seed = 1) {
  if (typeof code !== 'string' || !code.trim()) throw new ProgramError('Empty program.');
  if (code.length > CAPS.codeBytes) throw new ProgramError(`Program exceeds ${CAPS.codeBytes} bytes.`);

  const rt = QJS.newRuntime();
  rt.setMemoryLimit(CAPS.memoryBytes);
  rt.setMaxStackSize(CAPS.stackBytes);
  rt.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + CAPS.limitMs));
  const vm = rt.newContext();
  try {
    const src = `"use strict";(function(){
const freeze=v=>{if(v&&typeof v==='object'){Object.freeze(v);for(const c of Object.values(v))freeze(c);}return v;};
let s=${(seed >>> 0) || 1};Math.random=function(){s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
const env=freeze(JSON.parse(${JSON.stringify(JSON.stringify(env))}));
const inhabitant=new Function('env','"use strict";\\n'+${JSON.stringify(code)});
const r=inhabitant(env);
if(r&&typeof r.then==='function')throw new Error('Async programs are not allowed.');
return JSON.stringify(r);})()`;
    const res = vm.evalCode(src);
    if (res.error) {
      const e = vm.dump(res.error); res.error.dispose();
      const msg = e && typeof e === 'object' ? (e.message || e.name || 'Program failed.') : String(e);
      throw new ProgramError(/interrupt/i.test(msg) ? `Program exceeded the ${CAPS.limitMs} ms limit.` : String(msg).slice(0, 200));
    }
    const out = vm.typeof(res.value) === 'string' ? vm.getString(res.value) : undefined;
    res.value.dispose();
    if (!out) throw new ProgramError('Program returned nothing.');
    if (out.length > CAPS.outputBytes) throw new ProgramError('Oversized program output.');
    const parsed = JSON.parse(out);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new ProgramError('Program must return an object.');
    return parsed;
  } finally { vm.dispose(); rt.dispose(); }
}
