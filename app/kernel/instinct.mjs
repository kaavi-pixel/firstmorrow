// The people's own behaviour. Not authored, not code, not a model call.
//
// A person is not a mannequin waiting for instructions. Left alone they drink
// when they are dry, walk to water they can see, carry it home, eat when there
// is food, and get under a roof when a storm is coming. They cannot plan,
// build, invent or improve anything — that stays the author's job.
//
// An errand is a *goal* they carry out across many ticks, not a single decision.
// Somebody who sets off for water keeps going until they have it or they cannot:
// that is the difference between fetching water and wandering.
//
// Every number here is the same one the gate uses. An instinct obeys reality
// exactly as an authored program does, and gets no privileges.

import { terrainAt, walkable } from '../public/terrain.mjs';
import { RULES, waterNeedL, capacity } from './validate.mjs';
import { weatherOn } from './weather.mjs';

export const INSTINCT_MINUTES = 2;
export const KEEP_DAYS = 1.5;     // water they like to have on them, in days
export const CAMP_DAYS = 3;       // camp stock they try to keep, in days

const PEOPLE_AT = (S, x, y) => S.people.filter(p => p.alive && p.x === x && p.y === y).length;

/** The nearest tile with drinkable water still in it, within reach of where they stand. */
function nearestWater(S, p) {
  let best = null, bestD = Infinity;
  for (const s of S.terrain.springs || []) {
    const d = Math.abs(s.x - p.x) + Math.abs(s.y - p.y);
    if (d > RULES.reachTiles || d >= bestD) continue;
    const t = terrainAt(S.terrain, s.x, s.y);
    if (!t || !(t.potable > 0)) continue;
    bestD = d; best = s;
  }
  return best;
}

/** The nearest standing roof. */
function nearestShelter(S, p) {
  let best = null, bestD = Infinity;
  for (const s of S.structures) {
    if (!s.built || !s.shelter) continue;
    const d = Math.abs(s.x - p.x) + Math.abs(s.y - p.y);
    if (d < bestD) { bestD = d; best = { x: s.x, y: s.y }; }
  }
  return best;
}

const sheltered = (S, p) => S.structures.some(s => s.built && s.shelter &&
  Math.abs(s.x - p.x) <= 2 && Math.abs(s.y - p.y) <= 2);

const navKey = (x, y) => y * 128 + x;

/** A real route across the land, not a hopeful diagonal. Breadth-first, bounded. */
function findRoute(S, from, to, limit = 1500) {
  const start = navKey(from.x, from.y), goal = navKey(to.x, to.y);
  if (start === goal) return [];
  const prev = new Map([[start, null]]);
  const q = [start];
  let head = 0;
  while (head < q.length && head < limit) {
    const cur = q[head++];
    const cx = cur & 127, cy = (cur - cx) / 128;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy, k = navKey(nx, ny);
      if (prev.has(k)) continue;
      const t = terrainAt(S.terrain, nx, ny);
      if (!t || t.regionId === 'sea') continue;
      prev.set(k, cur);
      if (k === goal) {
        const path = [];
        for (let n = k; n !== null; n = prev.get(n)) path.push(n);
        return path.reverse().slice(1);      // the tiles to walk, excluding where they stand
      }
      q.push(k);
    }
  }
  return [];
}

/** One step along the way. The route is cached on the person and rebuilt when it breaks. */
function stepToward(S, p, target) {
  if (p.x === target.x && p.y === target.y) { p.nav = null; return false; }
  let nav = p.nav;
  if (!nav || nav.goal.x !== target.x || nav.goal.y !== target.y) {
    nav = { goal: { x: target.x, y: target.y }, steps: findRoute(S, p, target) };
    p.nav = nav;
  }
  while (nav.steps.length) {
    const k = nav.steps[0];
    const x = k & 127, y = (k - x) / 128;
    if (PEOPLE_AT(S, x, y) > 3) return false;            // crowded; wait a turn
    nav.steps.shift();
    p.x = x; p.y = y;
    p.pack.food = Math.max(0, p.pack.food - RULES.kcalPerTileWalk);
    p.activity = 'walk';
    return true;
  }
  // No route at all: step the way they want to go, and if that is blocked, any
  // way that is not water. Someone on a shore gets onto land either way.
  const dx = Math.sign(target.x - p.x), dy = Math.sign(target.y - p.y);
  const options = [[p.x + dx, p.y], [p.x, p.y + dy], [p.x + dx, p.y + dy],
    [p.x + 1, p.y], [p.x - 1, p.y], [p.x, p.y + 1], [p.x, p.y - 1]];
  for (const [x, y] of options) {
    if (!walkable(S.terrain, x, y) || terrainAt(S.terrain, x, y).regionId === 'sea') continue;
    p.x = x; p.y = y;
    p.pack.food = Math.max(0, p.pack.food - RULES.kcalPerTileWalk);
    p.activity = 'walk';
    return true;
  }
  return false;
}

const packMass = p => p.pack.water + p.pack.soil + p.pack.material + p.pack.food / RULES.foodKcalPerKg;

/** Fill up from whatever is underfoot. Only potable water, and only what is left. */
function drink(S, p) {
  const tile = terrainAt(S.terrain, p.x, p.y);
  if (!tile || !(tile.potable > 0)) return false;
  const room = Math.max(0, RULES.carryKg - packMass(p));
  const want = Math.min(tile.potable, room, 4 * RULES.waterDrinkLDay);
  if (want <= 0.01) return false;
  tile.potable -= want;
  p.pack.water += want;
  p.activity = 'drink';
  return true;
}

const outFetching = S => S.people.filter(q => q.alive && q.goal && q.goal.kind === 'water').length;

const unfinishedNear = (S, p) => {
  let best = null, bestD = Infinity;
  for (const s of S.structures) {
    if (s.built) continue;
    const d = Math.abs(s.x - p.x) + Math.abs(s.y - p.y);
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
};

/**
 * Work on a structure that is not finished yet. This is the only way anything the
 * authors design ever comes into being: they write it, the people build it by hand,
 * and it takes as long as the mass says it takes.
 */
function build(S, p, site, asleep) {
  const remaining = site.laborHours - site.progressHours;
  if (remaining <= 0) { site.built = true; return false; }
  const atSite = Math.abs(site.x - p.x) + Math.abs(site.y - p.y) <= 1;
  if (!atSite) {
    if (asleep) return false;
    p.activity = 'build';
    stepToward(S, p, { x: site.x, y: site.y });
    return true;
  }
  const hours = Math.min(INSTINCT_MINUTES / 60, Math.max(0, RULES.laborHoursPerDay - (p.labor?.used ?? 0)), remaining);
  if (hours <= 0) { p.activity = 'idle'; return true; }
  p.labor.used = (p.labor?.used ?? 0) + hours;
  site.progressHours += hours;
  p.activity = 'build';
  if (site.progressHours >= site.laborHours) {
    site.built = true;
    S.log.push({ t: S.minute, kind: 'built', text: `${site.name} is finished. ${site.laborHours} person-hours went into it.` });
  }
  return true;
}

/** One person's turn. Their own judgement, such as it is. */
function act(S, p, w, hour) {
  const need = waterNeedL(w.tempC);
  const atCamp = p.x === S.camp.x && p.y === S.camp.y;
  const keep = need * KEEP_DAYS;
  const tile = terrainAt(S.terrain, p.x, p.y);
  const asleep = hour < 6 || hour >= 21;
  p.activity = 'idle';

  // A storm coming, or already here: get under a roof. The errand waits.
  const storm = w.storm;
  if (storm && hour >= storm.hour - 2 && hour <= storm.hour + 4) {
    if (sheltered(S, p)) { p.activity = 'shelter'; p.resting = true; return; }
    const roof = nearestShelter(S, p);
    if (roof) { p.resting = false; if (!stepToward(S, p, roof)) p.activity = 'shelter'; return; }
    p.activity = 'cower';
    return;
  }

  // ------------------------------------------------------------ an errand, in progress
  if (p.goal && p.goal.kind === 'water') {
    const at = p.goal.at;
    if (p.x === at.x && p.y === at.y) {
      if (!drink(S, p)) { p.goal = { kind: 'home' }; return; }
      const here = terrainAt(S.terrain, p.x, p.y);
      if (p.pack.water >= keep || !here || !(here.potable > 0)) p.goal = { kind: 'home' };
      return;
    }
    p.activity = 'fetch';
    if (!stepToward(S, p, at)) p.goal = { kind: 'home' };
    return;
  }
  if (p.goal && p.goal.kind === 'home') {
    if (atCamp) p.goal = null;                        // arrived; fall through
    else {
      p.activity = 'carry';
      if (!stepToward(S, p, S.camp)) p.goal = null;
      return;
    }
  }

  // ----------------------------------------------------------------- away from camp
  if (!atCamp) {
    if (p.health < 25) { p.goal = { kind: 'home' }; p.activity = 'carry'; stepToward(S, p, S.camp); return; }
    if (p.pack.water < need * 0.6) {
      const water = nearestWater(S, p);
      p.goal = water ? { kind: 'water', at: water } : { kind: 'home' };
      p.activity = water ? 'fetch' : 'no-water';
      stepToward(S, p, water || S.camp);
      return;
    }
    if (p.pack.water > keep) { p.goal = { kind: 'home' }; p.activity = 'carry'; stepToward(S, p, S.camp); return; }
    if (p.pack.food < RULES.foodPerPersonDay * 0.3 && tile) {
      const store = S.structures.find(s => s.built && s.store && s.store.food > 0 &&
        Math.abs(s.x - p.x) + Math.abs(s.y - p.y) <= 1);
      if (store) {
        const got = Math.min(store.store.food, RULES.foodPerPersonDay, Math.max(0, RULES.carryKg * RULES.foodKcalPerKg - packMass(p)));
        if (got > 0) { store.store.food -= got; p.pack.food += got; p.activity = 'eat'; return; }
      }
    }
    p.resting = asleep;
    p.activity = asleep ? 'sleep' : 'walk';
    return;
  }

  // ---------------------------------------------------------------------- at camp
  // Put down what they are carrying.
  if (p.pack.water > keep) { S.camp.stock.water += p.pack.water - keep; p.pack.water = keep; }

  // Then decide whether the camp needs water fetched.
  const storeDays = S.camp.stock.water / (need * Math.max(1, S.people.filter(q => q.alive).length));
  if (storeDays < CAMP_DAYS && !asleep && outFetching(S) < 2) {
    const water = nearestWater(S, p);
    if (water) { p.goal = { kind: 'water', at: water }; p.activity = 'fetch'; stepToward(S, p, water); return; }
  }

  // There is a surplus, so fill the canteen before anything else goes wrong.
  if (S.camp.stock.water > need * 3) {
    const room = Math.max(0, RULES.carryKg - packMass(p));
    const top = Math.min(keep - p.pack.water, room, S.camp.stock.water - need * 2);
    if (top > 0.1) { S.camp.stock.water -= top; p.pack.water += top; }
  }

  if (p.pack.food < RULES.foodPerPersonDay * 0.8 && S.camp.stock.food > 0) {
    const want = Math.min(2 * RULES.foodPerPersonDay, S.camp.stock.food, Math.max(0, RULES.carryKg * RULES.foodKcalPerKg - packMass(p)));
    if (want > 0) { S.camp.stock.food -= want; p.pack.food += want; p.activity = 'eat'; return; }
  }

  // Nothing urgent. Somebody designed something and it is not standing yet.
  const site = unfinishedNear(S, p);
  if (site && build(S, p, site, asleep)) return;

  p.resting = asleep;
  p.activity = asleep ? 'sleep' : 'idle';
}

/** Everyone's turn. Called on a fixed interval from `advance`. */
export function runInstincts(S) {
  const w = weatherOn(S.weather, Math.floor(S.minute / 1440));
  const hour = (S.minute % 1440) / 60;
  for (const p of S.people) {
    if (!p.alive) continue;
    if (p.health < 1.5 && capacity(p) <= 0.16) { p.activity = 'dying'; continue; }
    try { act(S, p, w, hour); } catch { p.activity = 'idle'; }
  }
}
