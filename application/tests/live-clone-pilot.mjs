// Offline pilot only. Input is a read-only capture of /api/live and
// /api/buildings: {live, statics}. Never connects to Redis or a model.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { freshState, advance, splitState, joinState } from '../lib/sim.mjs';
import { migrateGeography } from '../public/geography.js';
import { requestDecision, finishDecision } from '../lib/decisions.mjs';
import { conservationErrors } from '../public/physics.js';
import { runBehavior } from '../lib/runner.mjs';
const capture=JSON.parse(await readFile(process.argv[2],'utf8'));
let s=freshState(0);
s.world={...structuredClone(capture.live.world),buildings:capture.live.world.buildings.map(b=>
  ({...capture.statics.find(v=>v.id===b.id),...b}))};
const original=structuredClone(s.world);
s.world=migrateGeography(s.world,{enabled:true});s.planningPaused=true;
for(const key of ['resources','balances','buildings','day','minute','history'])
  assert.deepEqual(s.world[key],original[key],`${key} changed during migration`);
let now=0,scouts=0,stays=0,rejections=0;
for(let minute=0;minute<2880;minute++){
  now+=1000;
  await advance(s,now,runBehavior);
  if(minute%60===0){
    const r=requestDecision(s,now);
    if(r){
      const target=r.input.scoutDestinations[0];
      const decision=target&&minute%120===0
        ?{action:'scout',destination:{x:target.x,y:target.y},reason:'Controlled pilot: inspect a personally observed frontier.'}
        :{action:'stay',reason:'Controlled pilot: remain at camp.'};
      finishDecision(s,r.id,{decision});
      const outcome=s.decisions.last[r.input.person.id].outcome;
      if(outcome==='departed')scouts++;else if(outcome==='stayed')stays++;else rejections++;
    }
  }
  if(minute%17===0){
    const {core,statics}=splitState(s);
    s=joinState(core,Object.fromEntries(statics.map(v=>[v.id,v])));
  }
  for(const [unit,error]of Object.entries(conservationErrors(s.world)))
    assert.ok(Math.abs(error)<1e-6,`${unit}: ${error}`);
}
assert.ok(scouts>0,'pilot needs a complete scouting opportunity');
assert.ok(stays>0);
assert.ok(original.buildings.every(b=>s.world.buildings.some(v=>v.id===b.id&&v.x===b.x&&v.y===b.y)));
assert.equal(Object.values(s.world.exploration.journeys).some(j=>j.status==='active'),false);
console.log(JSON.stringify({simulatedMinutes:2880,restarts:170,scouts,stays,rejections,
  fromDay:original.day,toDay:s.world.day,buildingIds:s.world.buildings.map(b=>b.id),
  balances:conservationErrors(s.world)},null,2));
