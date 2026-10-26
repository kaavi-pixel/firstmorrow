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
export const CAMP_DAYS = 3;       // camp water they try to keep, in days
export const FOOD_DAYS = 2;       // camp food they try to keep, in days

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

/** The nearest tile with anything worth eating on it. A person will walk for food,
 *  and when they are starving they will walk much further than they like to. */
function nearestForage(S, p, radius = RULES.reachTiles) {
  let best = null, bestD = Infinity;
  for (const s of S.terrain.forage || []) {
    const d = Math.abs(s.x - p.x) + Math.abs(s.y - p.y);
    if (d > radius || d >= bestD) continue;
    const t = terrainAt(S.terrain, s.x, s.y);
    if (!t || !(t.food > 0)) continue;
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
  // Rebuild when the goal changed, or when the cached route has run out without
  // arriving — a stale route must never leave them standing still.
  if (!nav || nav.goal.x !== target.x || nav.goal.y !== target.y || !nav.steps.length) {
    nav = { goal: { x: target.x, y: target.y }, steps: findRoute(S, p, target) };
    p.nav = nav;
  }
  while (nav.steps.length) {
    const k = nav.steps[0];
    const x = k & 127, y = (k - x) / 128;
    // Crowded; wait a turn, keeping the route. The camp tile is never too crowded —
    // everyone has to be able to get home, or they jam at the doorway and starve.
    const isCamp = x === S.camp.x && y === S.camp.y;
    if (!isCamp && PEOPLE_AT(S, x, y) > 4) return false;
    nav.steps.shift();
    p.x = x; p.y = y;
    p.pack.food = Math.max(0, p.pack.food - RULES.kcalPerTileWalk);
    p.activity = 'walk';
    return true;
  }
  // No route at all: take one step that is not water and not where they already
  // stand. Moving "onto" your own tile is how a person walks in place forever.
  const dx = Math.sign(target.x - p.x), dy = Math.sign(target.y - p.y);
  const options = [[p.x + dx, p.y + dy], [p.x + dx, p.y], [p.x, p.y + dy],
    [p.x + 1, p.y], [p.x - 1, p.y], [p.x, p.y + 1], [p.x, p.y - 1]];
  for (const [x, y] of options) {
    if (x === p.x && y === p.y) continue;
    const t = terrainAt(S.terrain, x, y);
    if (!t || !walkable(S.terrain, x, y) || t.regionId === 'sea') continue;
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

/** Gather what is edible underfoot, the same way they drink. */
function gather(S, p) {
  const tile = terrainAt(S.terrain, p.x, p.y);
  if (!tile || !(tile.food > 0)) return false;
  const room = Math.max(0, RULES.carryKg - packMass(p));
  const want = Math.min(tile.food, room * RULES.foodKcalPerKg, 2 * RULES.foodPerPersonDay);
  if (want <= 1) return false;
  tile.food -= want;
  p.pack.food += want;
  p.activity = 'forage';
  return true;
}

const outFetching = S => S.people.filter(q => q.alive && q.goal && q.goal.kind === 'water').length;
const outForaging = S => S.people.filter(q => q.alive && q.goal && q.goal.kind === 'food').length;

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
    // Walking there is walking; only standing at the site is building.
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
    // A blocked step is not a failed errand. Only give up after a real run of
    // attempts, or a crowd at a doorway becomes a death sentence.
    if (!stepToward(S, p, at)) { p.stuck = (p.stuck || 0) + 1; if (p.stuck > 8) { p.goal = { kind: 'home' }; p.stuck = 0; } }
    else p.stuck = 0;
    return;
  }
  if (p.goal && p.goal.kind === 'food') {
    const at = p.goal.at;
    if (p.x === at.x && p.y === at.y) {
      if (!gather(S, p)) { p.goal = { kind: 'home' }; return; }
      const here = terrainAt(S.terrain, p.x, p.y);
      if (p.pack.food >= 2 * RULES.foodPerPersonDay || !here || !(here.food > 0)) p.goal = { kind: 'home' };
      return;
    }
    p.activity = 'forage';
    if (!stepToward(S, p, at)) { p.stuck = (p.stuck || 0) + 1; if (p.stuck > 8) { p.goal = { kind: 'home' }; p.stuck = 0; } }
    else p.stuck = 0;
    return;
  }
  if (p.goal && p.goal.kind === 'home') {
    if (atCamp) p.goal = null;                        // arrived; fall through
    else {
      p.activity = 'carry';
      if (!stepToward(S, p, S.camp)) { p.stuck = (p.stuck || 0) + 1; if (p.stuck > 12) { p.goal = null; p.stuck = 0; } }
      else p.stuck = 0;
      return;
    }
  }

  // ----------------------------------------------------------------- away from camp
  if (!atCamp) {
    if (p.health < 25) { p.goal = { kind: 'home' }; p.activity = 'carry'; stepToward(S, p, S.camp); return; }
    // Thirst first: three days without water and they are dead.
    if (p.pack.water < need * 0.6) {
      const water = nearestWater(S, p);
      p.goal = water ? { kind: 'water', at: water } : { kind: 'home' };
      p.activity = water ? 'fetch' : 'no-water';
      stepToward(S, p, water || S.camp);
      return;
    }
    // Water they are already carrying goes home before anything else. Fetching a
    // load and then wandering off to forage would leave the camp dry.
    if (p.pack.water > keep) {
      p.goal = { kind: 'home' }; p.activity = 'carry'; stepToward(S, p, S.camp); return;
    }
    // Then hunger. They will walk for food before they will stand about, and a
    // starving person walks further than a comfortable one.
    if (p.pack.food < RULES.foodPerPersonDay * 0.8) {
      if (tile && tile.food > 0 && gather(S, p)) return;
      const desperate = p.pack.food < RULES.foodPerPersonDay * 0.3;
      const food = nearestForage(S, p, desperate ? RULES.reachTiles * 6 : RULES.reachTiles);
      if (food) { p.goal = { kind: 'food', at: food }; p.activity = 'forage'; stepToward(S, p, food); return; }
      const store = S.structures.find(s => s.built && s.store && s.store.food > 0 &&
        Math.abs(s.x - p.x) + Math.abs(s.y - p.y) <= 1);
      if (store) {
        const got = Math.min(store.store.food, 2 * RULES.foodPerPersonDay, Math.max(0, RULES.carryKg * RULES.foodKcalPerKg - packMass(p)));
        if (got > 0) { store.store.food -= got; p.pack.food += got; p.activity = 'eat'; return; }
      }
    }
    // Carrying a load of food home.
    if (p.pack.food > 2 * RULES.foodPerPersonDay) {
      p.goal = { kind: 'home' }; p.activity = 'carry'; stepToward(S, p, S.camp); return;
    }
    // A structure the authors designed, still unfinished, is work they can walk
    // to. Water and food first, then the site: a person away from camp who has
    // both is not idle, they are on their way to build.
    const buildingSite = unfinishedNear(S, p);
    if (buildingSite && build(S, p, buildingSite, asleep)) return;
    // Nothing to do out here. Somewhere else is better than here, and home is
    // where the water is.
    p.activity = asleep ? 'sleep' : 'carry';
    stepToward(S, p, S.camp);
    return;
  }

  // ---------------------------------------------------------------------- at camp
  // Put down what they are carrying. Water goes in the butt, food in the larder,
  // and they keep about one day of food on them so they can walk out and eat.
  if (p.pack.water > keep) { S.camp.stock.water += p.pack.water - keep; p.pack.water = keep; }
  const foodKeep = RULES.foodPerPersonDay;
  if (p.pack.food > foodKeep * 1.05) {
    S.camp.stock.food += p.pack.food - foodKeep;
    p.pack.food = foodKeep;
  }

  const alive = Math.max(1, S.people.filter(q => q.alive).length);

  // Water is the emergency: a person is dead in three days without it. When the
  // butt is nearly dry, nobody stays behind.
  const waterDays = S.camp.stock.water / (need * alive);
  const waterCrew = waterDays < 1 ? 5 : 2;
  if (waterDays < CAMP_DAYS && (!asleep || waterDays < 1) && outFetching(S) < waterCrew) {
    const water = nearestWater(S, p);
    if (water) { p.goal = { kind: 'water', at: water }; p.activity = 'fetch'; stepToward(S, p, water); return; }
  }

  // Then food: they keep the larder stocked before they lift a finger to build.
  // An empty larder is everyone's problem; a low one is a few people's.
  const foodDays = S.camp.stock.food / (RULES.foodPerPersonDay * alive);
  const foodCrew = foodDays < 1 ? 5 : 3;
  if (foodDays < FOOD_DAYS && (!asleep || foodDays < 1) && outForaging(S) < foodCrew) {
    const food = nearestForage(S, p);
    if (food) { p.goal = { kind: 'food', at: food }; p.activity = 'forage'; stepToward(S, p, food); return; }
  }

  // There is a surplus, so fill the canteen before anything else goes wrong.
  if (S.camp.stock.water > need * 3) {
    const room = Math.max(0, RULES.carryKg - packMass(p));
    const top = Math.min(keep - p.pack.water, room, S.camp.stock.water - need * 2);
    if (top > 0.1) { S.camp.stock.water -= top; p.pack.water += top; }
  }

  // Top the pack up to a day's food, and never more — taking two days and putting
  // one back is a loop that keeps them standing at the larder all day.
  if (p.pack.food < foodKeep * 0.6 && S.camp.stock.food > 0) {
    const want = Math.min(foodKeep - p.pack.food, S.camp.stock.food, Math.max(0, RULES.carryKg * RULES.foodKcalPerKg - packMass(p)));
    if (want > 0) { S.camp.stock.food -= want; p.pack.food += want; p.activity = 'eat'; return; }
  }

  // Only now, with water and food in hand, does anyone build.
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
