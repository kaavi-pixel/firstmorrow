import test from 'node:test';
import assert from 'node:assert/strict';
import { freshWorld, siteProblem, workMinute } from '../public/core.js';
import { migrateGeography } from '../public/geography.js';
import { walkingObstacles, pointKey } from '../public/navigation.js';
import { walkingRoute, startJourney, campOf, atCamp } from '../public/exploration.js';
import { conservationErrors } from '../public/physics.js';
import { freshState, advance, splitState, joinState } from '../lib/sim.mjs';
import { decisionInput, requestDecision, finishDecision, validateDecision, DECISIONS } from '../lib/decisions.mjs';
import { createWorldService, memoryKv, WORLD_KEYS as K } from '../lib/world.mjs';
import { callProvider } from '../validation.mjs';

const state=()=>{
  const s={...freshState(0),world:migrateGeography(freshWorld(),{enabled:true}),planningPaused:true};
  s.world.minute=480;return s;
};
const balanced=w=>Object.values(conservationErrors(w)).forEach(n=>assert.ok(Math.abs(n)<1e-7));
const scout=r=>({decision:{action:'scout',destination:r.input.scoutDestinations[0],reason:'I want to learn about nearby ground.'}});
// The provider must return only the coordinate, not route metadata.
const result=r=>{const a=scout(r);const {x,y}=a.decision.destination;a.decision.destination={x,y};return a;};

test('FM-002 safe anchor preserves legacy building coordinates and resource stocks',()=>{
  const w=freshWorld();w.buildings.push({id:'legacy',x:11,y:11});
  const before=structuredClone(w),m=migrateGeography(w,{enabled:true});
  assert.deepEqual(w,before);assert.deepEqual(m.buildings,before.buildings);
  assert.deepEqual(m.resources,before.resources);assert.notDeepEqual(campOf(m),{x:11,y:11});
  assert.ok(atCamp(m.exploration.positions.p0,m));
  assert.equal(walkingObstacles(m).has(pointKey(campOf(m))),false);
});
test('FM-002 route avoids structures and landmarks while allowing access gaps',()=>{
  const {world:w}=state();w.buildings.push({id:'b',x:12,y:11});
  const route=walkingRoute(w,{x:11,y:11},{x:14,y:11});
  assert.ok(route.length>4);
  assert.ok(route.every(p=>!walkingObstacles(w).has(pointKey(p))));
  assert.equal(walkingRoute(w,campOf(w),{x:4,y:8}),null);
});
test('FM-002 construction cannot occupy the camp or an active round-trip route',()=>{
  const {world:w}=state();
  assert.match(siteProblem(w,11,11),/clear/);
  startJourney(w,'p0',{x:14,y:11},1,undefined,{roundTrip:true});
  assert.match(siteProblem(w,12,11),/clear/);
});
test('FM-002 a new obstacle is rerouted around before any illegal step',async()=>{
  const s=state();startJourney(s.world,'p0',{x:14,y:11},1);
  s.world.buildings.push({id:'obstacle',x:12,y:11});
  await advance(s,2000,()=>({}));
  assert.notDeepEqual(s.world.exploration.positions.p0,{x:12,y:11});
  assert.ok(s.world.history.some(h=>h.text.includes('new route')));
  balanced(s.world);
});
test('FM-002 completely blocked routes stop without consuming or teleporting',async()=>{
  const s=state();startJourney(s.world,'p0',{x:14,y:11},1);
  for(const [x,y]of [[12,11],[10,11],[11,10],[11,12]])s.world.buildings.push({x,y});
  const pack=structuredClone(s.world.exploration.packs.p0);
  await advance(s,2000,()=>({}));
  assert.equal(s.world.exploration.journeys.p0.status,'blocked');
  assert.deepEqual(s.world.exploration.positions.p0,campOf(s.world));
  assert.deepEqual(s.world.exploration.packs.p0,pack);
});
test('V03 actual decision context isolates personal knowledge and omits global maps',()=>{
  const s=state();
  s.world.exploration.knowledge.p1.tiles['29,29']={secret:'another inhabitant'};
  const input=decisionInput(s,'p0'),serialized=JSON.stringify(input);
  for(const value of ['another inhabitant','south-island','western-ridge','materialReserveKg','mainlandLookouts'])
    assert.equal(serialized.includes(value),false,value);
  assert.equal(input.person.id,'p0');assert.equal(input.world,undefined);
  assert.ok(input.scoutDestinations.length>0);
  input.person.needs.water=0;assert.notEqual(s.world.inhabitants[0].needs.water,0);
});
test('V05 staying is an accepted autonomous outcome with a persisted reason',()=>{
  const s=state(),r=requestDecision(s,0),before=structuredClone(s.world.resources);
  finishDecision(s,r.id,{decision:{action:'stay',reason:'I prefer helping with shelter today.'}});
  assert.deepEqual(s.world.resources,before);
  assert.equal(s.world.exploration.journeys.p0,undefined);
  assert.equal(s.world.exploration.decisions.p0.outcome,'stayed');
});
test('V05 scouting is gradual, returns without another model call, and survives restart',async()=>{
  const a=state(),r=requestDecision(a,0),before=structuredClone(a.world.resources);
  finishDecision(a,r.id,result(r));
  await advance(a,2000,()=>({}));
  assert.equal(a.world.exploration.journeys.p0.status,'active');
  const {core,statics}=splitState(a),b=joinState(core,Object.fromEntries(statics.map(x=>[x.id,x])));
  await advance(a,180000,()=>({}));await advance(b,180000,()=>({}));
  assert.deepEqual(a,b);
  assert.equal(a.world.exploration.journeys.p0.status,'completed');
  assert.ok(atCamp(a.world.exploration.positions.p0,a.world));
  assert.equal(a.world.exploration.packs.p0.water,0);
  assert.ok(a.world.resources.water<before.water);
  assert.ok(Object.keys(a.world.exploration.knowledge.p0.tiles).length>25);
  assert.ok(a.world.history.some(h=>h.text.includes('heads home')));
  balanced(a.world);
});
test('unknown destinations, invalid contracts and extra provider fields are rejected',()=>{
  for(const bad of [{action:'teleport',reason:'no'},{action:'stay',reason:'ok',code:'bad'},
    {action:'scout',reason:'ok',destination:{x:1.5,y:2}}, {action:'stay',reason:''}])
    assert.throws(()=>validateDecision(bad));
  const s=state(),r=requestDecision(s,0),before=structuredClone(s.world.resources);
  finishDecision(s,r.id,{decision:{action:'scout',destination:{x:29,y:14},reason:'Cheat.'}});
  assert.deepEqual(s.world.resources,before);
  assert.equal(s.decisions.last.p0.outcome,'rejected');
});
test('replayed and stale decision responses never consume resources twice',()=>{
  const s=state(),r=requestDecision(s,0);
  finishDecision(s,r.id,result(r));const before=JSON.stringify(s);
  assert.equal(finishDecision(s,r.id,result(r)),false);assert.equal(JSON.stringify(s),before);
  const a=state(),q=requestDecision(a,0);a.world.minute+=DECISIONS.staleMinutes+1;
  finishDecision(a,q.id,result(q));assert.equal(a.decisions.last.p0.outcome,'rejected');
  assert.equal(a.world.exploration.journeys.p0,undefined);
});
test('camp reserve and daily model limits fail safely',()=>{
  const s=state(),r=requestDecision(s,0);s.world.resources.water=20;
  finishDecision(s,r.id,result(r));assert.equal(s.decisions.last.p0.outcome,'rejected');
  assert.equal(s.world.resources.water,20);
  s.decisions.cap.count=DECISIONS.dailyCalls;
  assert.equal(requestDecision(s,0),null);
});
test('timeouts recover without leaving a pending model request or forced expedition',()=>{
  const s=state(),r=requestDecision(s,0);
  const next=requestDecision(s,DECISIONS.timeoutMs+1);
  assert.notEqual(next?.id,r.id);assert.equal(s.decisions.last.p0.outcome,'rejected');
  assert.equal(finishDecision(s,r.id,result(r)),false);
});
test('provider exploration call uses private prompt and parses only typed decisions',async()=>{
  let body;
  const fetcher=async(_url,options)=>{body=JSON.parse(options.body);return {ok:true,text:async()=>JSON.stringify({
    output_text:'{"action":"stay","reason":"I need to rest."}',usage:{input_tokens:12,output_tokens:8}})};};
  const input=decisionInput(state(),'p0');
  const output=await callProvider({provider:'perplexity',key:'test-fixture-key',model:'fixture',
    purpose:'explore',input},fetcher);
  assert.equal(output.decision.action,'stay');assert.equal(output.artifact,undefined);
  assert.match(body.input[0].content,/not the settlement architect/);
  assert.deepEqual(JSON.parse(body.input[1].content),input);
  assert.equal(body.max_output_tokens,2048);
});
test('world service persists private model requests outside its lease and applies once',async()=>{
  const kv=memoryKv();let calls=0,input,now=0;
  const service=createWorldService({kv,clock:()=>now,geographyEnabled:true,explorationEnabled:true,
    propose:null,decide:async v=>{
      calls++;input=v;assert.equal(await kv.get(K.lock),null);
      return {decision:{action:'stay',reason:'I will remain at camp.'}};
    }});
  await service.tick();now=60000;await service.tick();await service.tick();
  assert.equal(calls,2);assert.equal(input.person.id,'p1');
  const reopened=createWorldService({kv,clock:()=>0,propose:null});
  assert.equal((await reopened.load()).decisions.last.p0.outcome,'stayed');
  assert.equal(JSON.parse(await service.live()).world.exploration.decisions.p0.outcome,'stayed');
});
test('disabled exploration and maintenance do not call the decision provider',async()=>{
  for(const config of [{explorationEnabled:false},{explorationEnabled:true,planningEnabled:false},
    {explorationEnabled:true,maintenance:true}]){
    let calls=0;
    const service=createWorldService({kv:memoryKv(),clock:()=>0,geographyEnabled:true,
      propose:null,decide:async()=>{calls++;},...config});
    await service.tick();assert.equal(calls,0);
  }
});
test('relocated camp still supplies shelter, rations and construction labor',()=>{
  const s=state();s.world.exploration.camp={x:10,y:11};
  for(const p of s.world.inhabitants)s.world.exploration.positions[p.id]={x:10,y:11};
  s.world.minute=480;s.world.buildings=[{id:'work',built:false,progressHours:0,laborHours:12}];
  workMinute(s.world);assert.ok(s.world.buildings[0].progressHours>0);
});
