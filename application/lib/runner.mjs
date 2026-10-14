// Runs AI-written structure behavior on the server inside a QuickJS WebAssembly sandbox.
// The sandbox has no network, filesystem, timers or host objects; each call gets a fresh
// runtime with memory, stack and time limits, and Math.random is seeded so replays agree.
import { getQuickJS, shouldInterruptAfterDeadline } from 'quickjs-emscripten';

const QJS = await getQuickJS();
const LIMIT_MS = 500, MEMORY = 32 * 1024 * 1024, STACK = 512 * 1024, MAX_OUT = 18000;

export function runBehavior(code, world, building, seed = 1) {
  if (typeof code !== 'string' || code.length > 8000) throw new Error('Invalid behavior code.');
  const rt = QJS.newRuntime();
  rt.setMemoryLimit(MEMORY);
  rt.setMaxStackSize(STACK);
  rt.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + LIMIT_MS));
  const vm = rt.newContext();
  try {
    const src = `"use strict";(function(){
const freeze=v=>{if(v&&typeof v==='object'){Object.freeze(v);for(const c of Object.values(v))freeze(c);}return v;};
let s=${(seed >>> 0) || 1};Math.random=function(){s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
const world=freeze(JSON.parse(${JSON.stringify(JSON.stringify(world))}));
const building=freeze(JSON.parse(${JSON.stringify(JSON.stringify(building))}));
const run=new Function('world','building','"use strict";\\n'+${JSON.stringify(code)});
const r=run(world,building);
if(r&&typeof r.then==='function')throw new Error('Async behaviors are not allowed.');
return JSON.stringify(r);})()`;
    const res = vm.evalCode(src);
    if (res.error) {
      const e = vm.dump(res.error); res.error.dispose();
      const msg = e && typeof e === 'object' ? (e.message || e.name || 'Behavior failed.') : String(e);
      throw new Error(/interrupted/i.test(msg) ? `Behavior exceeded the ${LIMIT_MS}ms execution limit.` : String(msg).slice(0, 200));
    }
    const out = vm.typeof(res.value) === 'string' ? vm.getString(res.value) : undefined; res.value.dispose();
    if (!out || out.length > MAX_OUT) throw new Error('Invalid or oversized behavior output.');
    return JSON.parse(out);
  } finally { vm.dispose(); rt.dispose(); }
}
