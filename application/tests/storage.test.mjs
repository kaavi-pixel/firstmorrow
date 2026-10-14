import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryKv, createWorldService, WORLD_KEYS as K } from '../lib/world.mjs';
import { redisKv, COMMIT_SCRIPT, RELEASE_SCRIPT } from '../lib/redis-kv.mjs';
import { freshState, applyProposal, failPlan } from '../lib/sim.mjs';

const payload = label => ({ core: label, live: label, statics: { b1: label }, days: { 0: label } });
test('expired worker cannot commit or release a successor lease', async () => {
  let now = 0;
  const kv = memoryKv(() => now);
  assert.equal(await kv.setnx(K.lock, 'old', 1), true);
  now = 1000;
  assert.equal(await kv.setnx(K.lock, 'new', 1), true);
  assert.equal(await kv.commit('old', payload('wrong')), false);
  assert.equal(await kv.release(K.lock, 'old'), false);
  assert.equal(await kv.get(K.lock), 'new');
  assert.equal(await kv.commit('new', payload('right')), true);
  assert.equal(await kv.get(K.core), 'right');
  assert.equal(await kv.get(K.live), 'right');
  assert.equal(await kv.hget(K.statics, 'b1'), 'right');
  assert.equal(await kv.hget(K.days, '0'), 'right');
});
test('lost lease produces no partial initial world or history', async () => {
  const kv = memoryKv();
  kv.commit = async () => false;
  const service = createWorldService({ kv, clock: () => 0, propose: null });
  await assert.rejects(service.tick(), /lock expired/);
  assert.equal(await kv.get(K.core), null);
  assert.equal(await kv.get(K.live), null);
  assert.equal(await kv.hlen(K.days), 0);
});
test('concurrent ticks advance one persisted world exactly once', async () => {
  const kv = memoryKv();
  const one = createWorldService({ kv, clock: () => 0, propose: null });
  const two = createWorldService({ kv, clock: () => 0, propose: null });
  const results = await Promise.all([one.tick(), two.tick()]);
  assert.equal(results.filter(r => r.busy).length, 1);
  assert.equal((await one.load()).world.history.length, 1);
});
test('Redis adapter passes commit and token release as atomic scripts', async () => {
  const calls = [];
  const kv = redisKv({ eval: async (...args) => { calls.push(args); return 1; } });
  assert.equal(await kv.commit('lease', payload('data')), true);
  assert.deepEqual(calls[0][1], [K.lock, K.core, K.live, K.statics, K.days, K.backup]);
  assert.equal(calls[0][0], COMMIT_SCRIPT);
  assert.deepEqual(JSON.parse(calls[0][2][3]), { b1: 'data' });
  assert.equal(await kv.release(K.lock, 'lease'), true);
  assert.equal(calls[1][0], RELEASE_SCRIPT);
  assert.deepEqual(calls[1][2], ['lease']);
});
test('isolated preview never starts or calls an AI plan', async () => {
  let time = 0, calls = 0;
  const service = createWorldService({ kv: memoryKv(), clock: () => time,
    propose: async () => { calls++; }, planningEnabled: false });
  await service.tick();
  time = 24 * 60 * 1000;
  await service.tick();
  assert.equal(calls, 0);
  assert.equal((await service.load()).plan, null);
});
test('FM-006 repeated or late proposal responses cannot apply twice', () => {
  const s=freshState(0);
  s.plan={id:'p-test',pending:true};
  const result={usage:{input:5,output:7},artifact:{name:'Test',say:'A test plan'},model:'fixture'};
  assert.equal(applyProposal(s,'p-test',result),true);
  const applied=JSON.stringify(s);
  assert.equal(applyProposal(s,'p-test',result),false);
  assert.equal(failPlan(s,'late error','p-test'),false);
  assert.equal(JSON.stringify(s),applied);
  s.plan={id:'p-next',pending:true};
  assert.equal(failPlan(s,'timed out','p-next'),true);
  assert.equal(applyProposal(s,'p-next',result),false);
});
test('FM-007 enabling planning clears a persisted pause', async () => {
  const kv=memoryKv();
  await createWorldService({kv,clock:()=>0,propose:null,planningEnabled:false}).tick();
  const enabled=createWorldService({kv,clock:()=>60000,propose:null,planningEnabled:true});
  await enabled.tick();
  const s=await enabled.load();
  assert.equal(s.planningPaused,undefined);
  assert.equal(s.plan?.pending,true);
});
