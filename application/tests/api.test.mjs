import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../lib/api.mjs';

test('FM-008 live response uses fresh server time without changing persisted state',async t=>{
  let now=100000;
  t.mock.method(Date,'now',()=>now);
  const stored=JSON.stringify({simAt:1000,serverNow:1000,world:{day:0,minute:360}});
  let ticks=0;
  const api=createApi({service:{live:async()=>stored,tick:async()=>{ticks++;}},authorizeTick:async()=>false});
  const request=async()=>{
    let status,headers,body;
    await api({method:'GET'},{writeHead:(s,h)=>{status=s;headers=h;},end:b=>{body=JSON.parse(b);}},
      new URL('https://firstmorrow.world/api/live'));
    return {status,headers,body};
  };
  const a=await request();now+=20000;const b=await request();
  assert.equal(a.status,200);assert.equal(a.headers['Cache-Control'],'no-store');
  assert.equal(a.body.serverNow,100000);assert.equal(b.body.serverNow,120000);
  assert.equal(b.body.simAt,1000);assert.deepEqual(a.body.world,b.body.world);
  assert.equal(JSON.parse(stored).serverNow,1000);assert.equal(ticks,0);
  const predictedA=a.body.world.minute+(a.body.serverNow-a.body.simAt)/1000;
  const predictedB=b.body.world.minute+(b.body.serverNow-b.body.simAt)/1000;
  assert.equal(predictedB-predictedA,20);
});
