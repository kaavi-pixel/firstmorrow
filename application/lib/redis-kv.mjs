import { WORLD_KEYS as K } from './world.mjs';

// Redis executes each script atomically. Both the state commit and release
// compare the lease token, so an expired worker cannot overwrite newer work.
export const COMMIT_SCRIPT = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
local statics = cjson.decode(ARGV[4])
local days = cjson.decode(ARGV[5])
-- Lua scripts are isolated but do not roll back runtime errors. Validate key
-- types before the first write, so a corrupt hash cannot cause a partial save.
for _, index in ipairs({4, 5}) do
  local kind = redis.call('TYPE', KEYS[index]).ok
  if kind ~= 'none' and kind ~= 'hash' then
    return redis.error_reply('World storage hash has an unexpected type')
  end
end
for id, value in pairs(statics) do redis.call('HSET', KEYS[4], id, value) end
for id, value in pairs(days) do redis.call('HSET', KEYS[5], id, value) end
redis.call('SET', KEYS[2], ARGV[2])
redis.call('SET', KEYS[3], ARGV[3])
return 1
`;
export const RELEASE_SCRIPT = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
return redis.call('DEL', KEYS[1])
`;
export function redisKv(redis) {
  return {
    get: k => redis.get(k),
    set: (k, v) => redis.set(k, v),
    setnx: async (k, v, ttl) => (await redis.set(k, v, { nx: true, ex: ttl })) === 'OK',
    del: k => redis.del(k),
    hset: (k, o) => redis.hset(k, o),
    hget: (k, f) => redis.hget(k, f),
    hgetall: k => redis.hgetall(k),
    release: async (k, token) => Number(await redis.eval(RELEASE_SCRIPT, [k], [token])) === 1,
    commit: async (token, values) => Number(await redis.eval(COMMIT_SCRIPT,
      [K.lock, K.core, K.live, K.statics, K.days],
      [token, values.core, values.live, JSON.stringify(values.statics), JSON.stringify(values.days)])) === 1
  };
}
