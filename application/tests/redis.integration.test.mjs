import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { COMMIT_SCRIPT, RELEASE_SCRIPT, redisKv } from '../lib/redis-kv.mjs';
import { WORLD_KEYS as K, createWorldService } from '../lib/world.mjs';
import { validateMigrationBackup } from '../lib/recovery.mjs';
import { splitState } from '../lib/sim.mjs';

const executable = spawnSync('redis-server',['--version']).status === 0;
const exec = promisify(execFile);
test('real Redis persistence gate', { skip: !executable, timeout: 20000 }, async t => {
  const dir=await mkdtemp(path.join(tmpdir(),'firstmorrow-redis-'));
  const socket=path.join(dir,'redis.sock');
  const server=spawn('redis-server',['--port','0','--unixsocket',socket,'--save','','--appendonly','no','--dir',dir],{stdio:'ignore'});
  const raw=async (...args)=>(await exec('redis-cli',['-s',socket,'--raw',...args.map(String)])).stdout.trim();
  const json=async (...args)=>{
    const out=(await exec('redis-cli',['-s',socket,'--json',...args.map(String)])).stdout;
    if(out.startsWith('error:'))throw new Error(out.slice(6));
    return JSON.parse(out);
  };
  try {
    let ready=false;
    for(let n=0;n<100;n++){try{if(await raw('PING')==='PONG'){ready=true;break;}}catch{}await delay(20);}
    assert.equal(ready,true,'isolated Redis did not start');
    const commit=(token,core='core-new',live='live-new',statics='{"b1":"static-new"}',days='{"0":"day-new"}')=>
      raw('EVAL',COMMIT_SCRIPT,5,K.lock,K.core,K.live,K.statics,K.days,token,core,live,statics,days);

    await t.test('valid commit writes all records and releases only its own lease',async()=>{
      await raw('SET',K.lock,'mine','EX',10);
      assert.equal(await commit('mine'),'1');
      assert.equal(await raw('GET',K.core),'core-new');
      assert.equal(await raw('GET',K.live),'live-new');
      assert.equal(await raw('HGET',K.statics,'b1'),'static-new');
      assert.equal(await raw('HGET',K.days,'0'),'day-new');
      assert.equal(await raw('EVAL',RELEASE_SCRIPT,1,K.lock,'other'),'0');
      assert.equal(await raw('EVAL',RELEASE_SCRIPT,1,K.lock,'mine'),'1');
    });
    await t.test('expired worker cannot write after a successor takes the lease',async()=>{
      await raw('SET',K.lock,'old','PX',1);await delay(20);
      await raw('SET',K.lock,'successor','EX',10);
      assert.equal(await commit('old','wrong'),'0');
      assert.equal(await raw('GET',K.core),'core-new');
      assert.equal(await raw('EVAL',RELEASE_SCRIPT,1,K.lock,'old'),'0');
      assert.equal(await raw('GET',K.lock),'successor');
    });
    await t.test('wrong hash type rejects before any write',async()=>{
      await raw('DEL',K.days);
      await raw('SET',K.days,'wrong-type');
      const reply=await commit('successor','must-not-write','must-not-write','{"b2":"must-not-write"}');
      assert.match(reply,/unexpected type/);
      assert.equal(await raw('GET',K.core),'core-new');
      assert.equal(await raw('HGET',K.statics,'b2'),'');
      assert.equal(await raw('GET',K.days),'wrong-type');
    });
    await t.test('malformed serialized input rejects before any write',async()=>{
      assert.match(await commit('successor','must-not-write','must-not-write','{broken'),/ERR/);
      assert.equal(await raw('GET',K.core),'core-new');
    });
    await t.test('world service initializes and reloads through actual Redis scripts',async()=>{
      // This database belongs to the child process above; never a remote store.
      await raw('FLUSHDB');
      const redis={
        get:k=>json('GET',k),set:(k,v,o)=>json('SET',k,v,...(o?['NX','EX',o.ex]:[])),
        del:k=>json('DEL',k),hget:(k,f)=>json('HGET',k,f),hgetall:k=>json('HGETALL',k),
        hset:(k,o)=>json('HSET',k,...Object.entries(o).flat()),
        eval:(s,ks,args)=>json('EVAL',s,ks.length,...ks,...args)
      };
      let now=0;
      const service=createWorldService({kv:redisKv(redis),clock:()=>now,propose:null});
      await service.tick();
      const before=await service.load();
      assert.equal(before.world.geography,undefined);
      now=1000;await service.tick();
      const reopened=createWorldService({kv:redisKv(redis),clock:()=>now,propose:null});
      assert.equal((await reopened.load()).world.minute,before.world.minute+1);
      assert.equal(JSON.parse(await reopened.live()).world.minute,before.world.minute+1);
    });
    await t.test('migration backup is atomic, restorable and never overwritten',async()=>{
      await raw('FLUSHDB');
      const redis={
        get:k=>json('GET',k),set:(k,v,o)=>json('SET',k,v,...(o?['NX','EX',o.ex]:[])),
        del:k=>json('DEL',k),hget:(k,f)=>json('HGET',k,f),hgetall:k=>json('HGETALL',k),
        hset:(k,o)=>json('HSET',k,...Object.entries(o).flat()),
        eval:(s,ks,args)=>json('EVAL',s,ks.length,...ks,...args)
      };
      const kv=redisKv(redis);
      const legacy=createWorldService({kv,clock:()=>0,propose:null,planningEnabled:false});
      await legacy.tick();
      // Advance across midnight so the backup includes a real historical day.
      const later=createWorldService({kv,clock:()=>1440000,propose:null,planningEnabled:false});
      await later.tick();
      const before=await later.load();
      const migrated=createWorldService({kv,clock:()=>1440000,propose:null,planningEnabled:false,geographyEnabled:true});
      await migrated.tick();
      const bytes=await raw('GET',K.backup),backup=validateMigrationBackup(bytes);
      assert.deepEqual(backup.state,before);
      assert.equal(Object.keys(backup.days).length,1);
      assert.equal(backup.sha256.length,64);
      const after=await migrated.load();
      assert.ok(after.world.extensionMigration.backupCaptured);
      assert.deepEqual(after.world.resources,before.world.resources);
      assert.deepEqual(after.world.buildings,before.world.buildings);
      assert.equal(after.simAt,before.simAt);
      await migrated.tick();assert.equal(await raw('GET',K.backup),bytes);
      // Restore only this isolated child Redis database, then reopen via service.
      await raw('FLUSHDB');
      await raw('SET',K.core,backup.core);await raw('SET',K.live,backup.live);
      for(const [key,values]of [[K.statics,backup.statics],[K.days,backup.days]])
        if(Object.keys(values).length)await raw('HSET',key,...Object.entries(values).flat());
      const restored=createWorldService({kv,clock:()=>1440000,propose:null,planningEnabled:false});
      assert.deepEqual(await restored.load(),before);
      assert.equal(await restored.day(0),backup.days['0']);
      // An occupied backup key is a fail-closed condition, not an overwrite.
      await raw('SET',K.backup,bytes);
      await assert.rejects(migrated.tick(),/backup already exists/);
      assert.deepEqual(JSON.parse(await raw('GET',K.core)),splitState(before).core);
    });
  } finally {
    if(server.exitCode===null){const closed=once(server,'exit');server.kill('SIGTERM');await closed;}
    await rm(dir,{recursive:true,force:true});
  }
});
