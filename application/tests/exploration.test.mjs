import test from 'node:test';
import assert from 'node:assert/strict';
import { freshWorld, settleDay, importWorld } from '../public/core.js';
import { migrateGeography, START } from '../public/geography.js';
import { startJourney, advanceJourneys, cancelJourney, observe, inhabitantView } from '../public/exploration.js';
import { conservationErrors } from '../public/physics.js';
import { freshState, advance, splitState, joinState } from '../lib/sim.mjs';
const world = () => migrateGeography(freshWorld(), { enabled: true });
function step(w, n) {
  for(let i=0;i<n;i++){
    w.minute++;
    if(w.minute>=1440){w.minute=0;settleDay(w,[]);}
    advanceJourneys(w);
  }
}
function balanced(w) {
  for(const [unit,error] of Object.entries(conservationErrors(w))) assert.ok(Math.abs(error)<1e-7,`${unit}: ${error}`);
}
test('V02 scouting coast and returning fits existing stock without resource creation', () => {
  const w=world(),before=structuredClone(w.resources);
  startJourney(w,'p0',{x:29,y:14},1);
  assert.equal(w.exploration.positions.p0.x,11);
  step(w,42);
  assert.deepEqual(w.exploration.positions.p0,{x:29,y:14});
  startJourney(w,'p0',START,2);
  step(w,42);
  assert.deepEqual(w.exploration.positions.p0,START);
  assert.deepEqual(w.exploration.packs.p0,{water:0,food:0,materials:0});
  assert.ok(w.resources.water<before.water);
  assert.equal(w.resources.materials,before.materials);
  assert.equal(w.exploration.journeys.p0.status,'completed');
  balanced(w);
});
test('V03 observations are individual snapshots and cannot mutate world state', () => {
  const w=world();observe(w,'p0');
  const v=inhabitantView(w,'p0');
  assert.equal(Object.keys(v.knowledge.tiles).length,25);
  assert.equal(Object.keys(inhabitantView(w,'p1').knowledge.tiles).length,0);
  assert.equal(v.knowledge.tiles['29,14'],undefined);
  assert.equal(v.geography,undefined);
  v.knowledge.tiles['11,11'].properties.soil=999;
  assert.notEqual(inhabitantView(w,'p0').knowledge.tiles['11,11'].properties.soil,999);
});
test('V04 journey advances gradually and repeated minute is idempotent', () => {
  const w=world();startJourney(w,'p0',{x:13,y:11},1);
  step(w,1);assert.deepEqual(w.exploration.positions.p0,START);
  step(w,1);assert.deepEqual(w.exploration.positions.p0,{x:12,y:11});
  const before=JSON.stringify(w);advanceJourneys(w);assert.equal(JSON.stringify(w),before);
  balanced(w);
});
test('invalid, overweight, water-crossing and replayed actions do not mutate state', () => {
  const w=world(),before=JSON.stringify(w);
  assert.throws(()=>startJourney(w,'p0',{x:13,y:11},1,{water:100,food:0,materials:0}),/capacity/);
  assert.equal(JSON.stringify(w),before);
  assert.throws(()=>startJourney(w,'p0',{x:36,y:14},1),/route/);
  assert.equal(JSON.stringify(w),before);
  startJourney(w,'p0',{x:13,y:11},1);step(w,4);
  const after=JSON.stringify(w);
  assert.throws(()=>startJourney(w,'p0',START,1),/Stale/);
  assert.equal(JSON.stringify(w),after);
});
test('V09 cancellation keeps position and carried inventory; return takes time', () => {
  const w=world();startJourney(w,'p0',{x:29,y:14},1);step(w,10);
  const pos=structuredClone(w.exploration.positions.p0),pack=structuredClone(w.exploration.packs.p0);
  assert.equal(cancelJourney(w,'p0'),true);
  step(w,4);
  assert.deepEqual(w.exploration.positions.p0,pos);
  assert.deepEqual(w.exploration.packs.p0,pack);
  assert.equal(cancelJourney(w,'p0'),false);
  startJourney(w,'p0',START,2);
  assert.notDeepEqual(w.exploration.positions.p0,START);
  step(w,10);assert.deepEqual(w.exploration.positions.p0,START);balanced(w);
});
test('away inhabitants consume their pack, not distant communal stores', () => {
  const w=world();startJourney(w,'p0',{x:13,y:11},1);step(w,4);
  const water=w.resources.water,food=w.resources.food;
  settleDay(w,[]);
  assert.equal(w.resources.water,water-4*15);
  assert.equal(w.resources.food,food-4*2100);
  assert.ok(w.exploration.packs.p0.water<1);
  balanced(w);
});
test('V09 mid-journey storage restart matches uninterrupted simulation across midnight', async () => {
  const a={...freshState(0),world:world(),planningPaused:true};
  a.world.minute=1438;startJourney(a.world,'p0',{x:14,y:11},1);
  await advance(a,3000,()=>({actions:{},needs:[]}));
  const {core,statics}=splitState(a);
  const b=joinState(core,Object.fromEntries(statics.map(s=>[s.id,s])));
  await advance(a,6000,()=>({actions:{},needs:[]}));
  await advance(b,6000,()=>({actions:{},needs:[]}));
  assert.deepEqual(a,b);balanced(a.world);
  assert.deepEqual(a.world.exploration.positions.p0,{x:14,y:11});
});
test('legacy import refuses to silently drop journeys and carried resources', () => {
  assert.throws(()=>importWorld(world()),/versioned server restore/);
});
