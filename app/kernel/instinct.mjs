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
export const KEEP_DAYS = 2;       // water they like to have on them, in days
export const CAMP_DAYS = 6;       // camp water they try to keep, in days
export const FOOD_DAYS = 5;       // camp food they try to keep, in days
export const MORE_DAYS = 5;       // how far past those targets a surplus is still worth working
export const MATERIAL_KEEP = 500; // kg of building material they like in the yard
export const SOIL_KEEP = 150;     // kg of soil, for whatever turns soil into food

// One human to a tile. Not a courtesy — a rule. Two people cannot stand in the
// same place, so a step onto an occupied tile is not a step, and "home" means
// the camp tile or one of the eight around it (a doorway is not a room).
const occupantAt = (S, x, y, self) => S.people.some(q => q !== self && q.alive && q.x === x && q.y === y);
const nearCamp = (S, p) => Math.abs(p.x - S.camp.x) <= 1 && Math.abs(p.y - S.camp.y) <= 1;

/** The nearest tile within arm's reach that satisfies `pick`, underfoot first. */
function reachable(S, p, pick) {
  const here = terrainAt(S.terrain, p.x, p.y);
  if (here && pick(here)) return here;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const t = terrainAt(S.terrain, p.x + dx, p.y + dy);
    if (t && pick(t)) return t;
  }
  return null;
}

/**
 * The nearest tile with something the camp needs, within reach, that nobody else
 * has already claimed. Three people walking to the same stone is one person
 * working and two people queuing, and the queue is what looks like idleness.
 */
function nearestSubstance(S, p, key, radius = RULES.reachTiles) {
  const claimed = new Set(S.people
    .filter(q => q.alive && q !== p && q.goal && q.goal.at)
    .map(q => q.goal.at.y * 128 + q.goal.at.x));
  let best = null, bestD = Infinity;
  for (const t of S.terrain.tiles.values()) {
    if (t.regionId === 'sea' || !(t[key] > 0)) continue;
    const d = Math.abs(t.x - p.x) + Math.abs(t.y - p.y);
    if (d === 0 || d > radius || d >= bestD) continue;
    if (claimed.has(t.y * 128 + t.x)) continue;
    bestD = d; best = { x: t.x, y: t.y };
  }
  return best;
}

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
const CARDINALS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const dist = (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by);

/** A real route across the land, not a hopeful diagonal. Breadth-first, bounded.
 *  A tile somebody is standing on is a wall, so nobody plans a march through a
 *  neighbour; the one exception is the tile they are heading for, where they
 *  will queue. */
function findRoute(S, from, to, self, limit = 1500) {
  const start = navKey(from.x, from.y), goal = navKey(to.x, to.y);
  if (start === goal) return [];
  const prev = new Map([[start, null]]);
  const q = [start];
  let head = 0;
  while (head < q.length && head < limit) {
    const cur = q[head++];
    const cx = cur & 127, cy = (cur - cx) / 128;
    for (const [dx, dy] of CARDINALS) {
      const nx = cx + dx, ny = cy + dy, k = navKey(nx, ny);
      if (prev.has(k)) continue;
      const t = terrainAt(S.terrain, nx, ny);
      if (!t || t.regionId === 'sea') continue;
      if (k !== goal && occupantAt(S, nx, ny, self)) continue;
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

/** One step onto a tile that is free. Sea and other people both say no. */
function walkStep(S, p, x, y) {
  if (x === p.x && y === p.y) return false;
  const t = terrainAt(S.terrain, x, y);
  if (!t || !walkable(S.terrain, x, y) || t.regionId === 'sea') return false;
  if (occupantAt(S, x, y, p)) return false;
  p.prev = { x: p.x, y: p.y };
  p.x = x; p.y = y;
  p.pack.food = Math.max(0, p.pack.food - RULES.kcalPerTileWalk);
  p.activity = 'walk';
  return true;
}

/**
 * A step toward the goal that goes around whoever is standing in the way.
 * Nearest first, and never straight back to where they just stood unless that is
 * the only way on: two people squeezing past each other must not end up
 * shuttling between the same two tiles for the rest of the day.
 */
function freeStepToward(S, p, target) {
  const dx = Math.sign(target.x - p.x), dy = Math.sign(target.y - p.y);
  const options = [];
  if (dx && dy) options.push([p.x + dx, p.y + dy]);
  if (dx) options.push([p.x + dx, p.y]);
  if (dy) options.push([p.x, p.y + dy]);
  options.push([p.x + 1, p.y], [p.x - 1, p.y], [p.x, p.y + 1], [p.x, p.y - 1]);
  const dist = ([x, y]) => Math.abs(x - target.x) + Math.abs(y - target.y);
  const back = p.prev;
  const ordered = options
    .filter(([x, y]) => !(back && x === back.x && y === back.y))
    .sort((a, b) => dist(a) - dist(b));
  for (const [x, y] of ordered) if (walkStep(S, p, x, y)) return true;
  if (back && walkStep(S, p, back.x, back.y)) return true;
  return false;
}

/** One step along the way. The route is cached on the person and rebuilt when it breaks. */
function stepToward(S, p, target) {
  if (p.x === target.x && p.y === target.y) { p.nav = null; return false; }
  let nav = p.nav;
  // Rebuild when the goal changed, or when the cached route has run out without
  // arriving — a stale route must never leave them standing still.
  if (!nav || nav.goal.x !== target.x || nav.goal.y !== target.y || !nav.steps.length) {
    nav = { goal: { x: target.x, y: target.y }, steps: findRoute(S, p, target, p) };
    p.nav = nav;
  }
  while (nav.steps.length) {
    const k = nav.steps[0];
    const x = k & 127, y = (k - x) / 128;
    // Somebody is standing there. Waiting at a doorway is how a camp starves, so
    // they step aside and rebuild the route from wherever they end up.
    if (occupantAt(S, x, y, p)) { p.nav = null; return freeStepToward(S, p, target); }
    nav.steps.shift();
    p.prev = { x: p.x, y: p.y };
    p.x = x; p.y = y;
    p.pack.food = Math.max(0, p.pack.food - RULES.kcalPerTileWalk);
    p.activity = 'walk';
    return true;
  }
  // No route at all: one honest step toward the goal. Moving "onto" your own
  // tile is how a person walks in place forever.
  return freeStepToward(S, p, target);
}

const packMass = p => p.pack.water + p.pack.soil + p.pack.material + p.pack.food / RULES.foodKcalPerKg;

/** Fill up from whatever is underfoot. Only potable water, and only what is left. */
function drink(S, p) {
  const tile = reachable(S, p, t => t.potable > 0);
  if (!tile) return false;
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
  const tile = reachable(S, p, t => t.food > 0);
  if (!tile) return false;
  const room = Math.max(0, RULES.carryKg - packMass(p));
  const want = Math.min(tile.food, room * RULES.foodKcalPerKg, 2 * RULES.foodPerPersonDay);
  if (want <= 1) return false;
  tile.food -= want;
  p.pack.food += want;
  p.activity = 'forage';
  return true;
}

/** Haul home what the ground is made of. Nobody assigned this chore; a camp that
 *  sits idle is a camp that cannot be built up when it matters. */
function gatherSubstance(S, p, key, maxKg = 6) {
  const tile = reachable(S, p, t => (t[key] || 0) > 0);
  if (!tile) return false;
  const room = Math.max(0, RULES.carryKg - packMass(p));
  const want = Math.min(tile[key], room, maxKg);
  if (want <= 0.5) return false;
  tile[key] -= want;
  p.pack[key] = (p.pack[key] || 0) + want;
  p.activity = 'gather';
  return true;
}

/**
 * Not everyone keeps the same hours. Each person's night is seven hours, starting
 * somewhere between 21:00 and midnight, so the camp is never wholly asleep: there
 * is always somebody awake to fetch, build, or notice a storm turning.
 */
function sleepWindow(S, p) {
  const i = Math.max(0, S.people.indexOf(p));
  // Starts ninety minutes apart from 21:00, six hours each, so the night is
  // covered end to end and the camp is never all asleep at once.
  const start = (21 * 60 + (i % 5) * 90) % 1440;
  const end = (start + 360) % 1440;
  const m = S.minute % 1440;
  return end > start ? (m >= start && m < end) : (m >= start || m < end);
}

const outFetching = S => S.people.filter(q => q.alive && q.goal && q.goal.kind === 'water').length;
const outForaging = S => S.people.filter(q => q.alive && q.goal && q.goal.kind === 'food').length;
const outHauling = (S, key) => S.people.filter(q => q.alive && q.goal && q.goal.kind === key).length;

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
  // At camp means on the camp tile or beside it: only one person can stand on a
  // tile, so the doorway has to count as being home.
  const home = nearCamp(S, p);
  const keep = need * KEEP_DAYS;
  const tile = terrainAt(S.terrain, p.x, p.y);
  const asleep = sleepWindow(S, p);
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

  // No errand is worth dying on. Anyone away from camp who is running dry drops
  // what they were doing and goes to water, whatever they had set out to fetch.
  if (!home && p.pack.water < need * 0.6 && !(p.goal && p.goal.kind === 'water')) {
    // The nearest spring, or the camp butt if there is no spring in reach: either
    // one is water, and the errand can wait for a living person.
    const water = nearestWater(S, p) || (S.camp.stock.water > 0 ? S.camp : null);
    if (water) { p.goal = { kind: 'water', at: water }; p.activity = 'fetch'; stepToward(S, p, water); return; }
  }

  // ------------------------------------------------------------ an errand, in progress
  if (p.goal && p.goal.kind === 'water') {
    const at = p.goal.at;
    // Drinking distance: the bank of the spring counts, because the water tile
    // itself may be taken and a pool does not fit one pair of feet.
    const there = Math.abs(p.x - at.x) <= 1 && Math.abs(p.y - at.y) <= 1;
    if (there) {
      const took = drink(S, p);
      const more = reachable(S, p, t => t.potable > 0);
      if (!took || p.pack.water >= keep || !more) p.goal = { kind: 'home' };
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
    const there = Math.abs(p.x - at.x) <= 1 && Math.abs(p.y - at.y) <= 1;
    if (there) {
      const took = gather(S, p);
      const more = reachable(S, p, t => t.food > 0);
      if (!took || p.pack.food >= 2 * RULES.foodPerPersonDay || !more) p.goal = { kind: 'home' };
      return;
    }
    p.activity = 'forage';
    if (!stepToward(S, p, at)) { p.stuck = (p.stuck || 0) + 1; if (p.stuck > 8) { p.goal = { kind: 'home' }; p.stuck = 0; } }
    else p.stuck = 0;
    return;
  }
  // Chores: material and soil, taken from the ground and carried back. The camp
  // never has to stand still because nobody thought to give them a job.
  if (p.goal && (p.goal.kind === 'material' || p.goal.kind === 'soil')) {
    const key = p.goal.kind, at = p.goal.at;
    const there = Math.abs(p.x - at.x) <= 1 && Math.abs(p.y - at.y) <= 1;
    if (there) {
      p.activity = 'gather';
      gatherSubstance(S, p, key);
      const more = reachable(S, p, t => (t[key] || 0) > 0);
      if (!more || p.pack[key] >= 6 || RULES.carryKg - packMass(p) < 1) p.goal = { kind: 'home' };
      return;
    }
    p.activity = 'haul';
    if (!stepToward(S, p, at)) { p.stuck = (p.stuck || 0) + 1; if (p.stuck > 8) { p.goal = { kind: 'home' }; p.stuck = 0; } }
    else p.stuck = 0;
    return;
  }
  if (p.goal && p.goal.kind === 'home') {
    if (home) p.goal = null;                          // arrived; fall through
    else {
      p.activity = 'carry';
      if (!stepToward(S, p, S.camp)) { p.stuck = (p.stuck || 0) + 1; if (p.stuck > 12) { p.goal = null; p.stuck = 0; } }
      else p.stuck = 0;
      return;
    }
  }

  // ----------------------------------------------------------------- away from camp
  if (!home) {
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
      const food = nearestForage(S, p, desperate ? RULES.reachTiles * 6 : 14);
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
  // And the material and soil they hauled back goes on the pile.
  if (p.pack.material > 0.5) { S.camp.stock.material += p.pack.material; p.pack.material = 0; }
  if (p.pack.soil > 0.5) { S.camp.stock.soil += p.pack.soil; p.pack.soil = 0; }

  const alive = Math.max(1, S.people.filter(q => q.alive).length);

  // Water is the emergency: a person is dead in three days without it. When the
  // butt is nearly dry, nobody stays behind.
  const waterDays = S.camp.stock.water / (need * alive);
  // An empty larder outranks a shallow butt: nobody fetches water while the food
  // store is bare, because the walk costs calories the camp does not have.
  const foodDays = S.camp.stock.food / (RULES.foodPerPersonDay * alive);
  // A camp that drinks its one spring dry has traded a full butt for a dry grave,
  // so the crew widens as the butt empties rather than all five setting off.
  const waterCrew = waterDays < 1 ? 5 : waterDays < 2 ? 3 : 2;
  if (waterDays < CAMP_DAYS && (!asleep || waterDays < 1) && outFetching(S) < waterCrew
    && (foodDays >= FOOD_DAYS || waterDays < 1)) {
    const water = nearestWater(S, p);
    if (water) { p.goal = { kind: 'water', at: water }; p.activity = 'fetch'; stepToward(S, p, water); return; }
  }

  // Then food: they keep the larder stocked before they lift a finger to build.
  // An empty larder is everyone's problem; a low one is a few people's.
  const foodCrew = foodDays < 1 ? 5 : foodDays < 2 ? 4 : 3;
  if (foodDays < FOOD_DAYS && (!asleep || foodDays < 1) && outForaging(S) < foodCrew) {
    // Nearer fields first: a twelve-tile walk for food burns what the food was
    // meant to replace.
    const food = nearestForage(S, p, 14);
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

  // Nothing pressing, and it is not the middle of their night: go and get what
  // the camp is short of. A camp with no material cannot be built up later, and
  // standing about is not rest — it is just a slow way to lose the day.
  if (!asleep && p.pack.food > RULES.foodPerPersonDay * 0.5) {
    for (const [key, target] of [['material', MATERIAL_KEEP], ['soil', SOIL_KEEP]]) {
      if (S.camp.stock[key] >= target) continue;
      if (outHauling(S, key) >= 3) break;         // three at it is enough for one camp
      // Near camp, and only with food in the pack: a chore is not worth a long
      // walk on an empty stomach.
      const at = nearestSubstance(S, p, key, 12);
      if (at) { p.goal = { kind: key, at }; p.activity = 'haul'; stepToward(S, p, at); return; }
    }
  }

  // Comfortable is not finished. While the reserve is only just comfortable one
  // of them keeps working the surplus: a couple of extra days in the butt is the
  // difference between a lean week and four graves.
  if (!asleep && foodDays >= FOOD_DAYS && waterDays < CAMP_DAYS + MORE_DAYS && outFetching(S) < 1) {
    const water = nearestWater(S, p);
    if (water) { p.goal = { kind: 'water', at: water }; p.activity = 'fetch'; stepToward(S, p, water); return; }
  }
  if (!asleep && foodDays < FOOD_DAYS + MORE_DAYS && outForaging(S) < 1) {
    const food = nearestForage(S, p, 14);
    if (food) { p.goal = { kind: 'food', at: food }; p.activity = 'forage'; stepToward(S, p, food); return; }
  }

  // Nothing pressing. Standing alone in the middle of a camp is not living, so
  // they go and find somebody: the nearest awake person, and a word with them.
  // A conversation is not a post, though — half an hour with the same person and
  // they move on to another, so the camp circulates instead of freezing into a
  // ring of figures.
  if (!asleep) {
    const others = S.people.filter(q => q.alive && q !== p);
    const near = q => Math.abs(q.x - p.x) + Math.abs(q.y - p.y);
    const beside = others.find(q => near(q) <= 2);
    if (p.chatWith !== (beside ? beside.id : null)) { p.chatWith = beside ? beside.id : null; p.chatSince = S.minute; }
    const longEnough = S.minute - (p.chatSince ?? S.minute) > 30;
    if (beside && !longEnough) { p.activity = 'talk'; return; }
    const someone = others
      .filter(q => !sleepWindow(S, q) && q.id !== (beside ? beside.id : null))
      .sort((a, b) => near(a) - near(b))[0];
    if (someone && stepToward(S, p, { x: someone.x, y: someone.y })) { p.activity = 'walk'; return; }
    p.chatWith = null;
    p.activity = 'talk';
    return;
  }

  p.resting = true;
  p.activity = 'sleep';
}

/** Everyone's turn. Called on a fixed interval from `advance`. */
export function runInstincts(S) {
  const w = weatherOn(S.weather, Math.floor(S.minute / 1440));
  const hour = (S.minute % 1440) / 60;
  for (const p of S.people) {
    if (!p.alive) continue;
    if (p.health < 1.5 && capacity(p) <= 0.16) {
      // Too weak to work, not too weak to try to get home. A dying person who
      // freezes four tiles out dies of thirst with a full butt behind them,
      // which is an artefact, not a fact. Crawling is not labour.
      p.activity = 'dying';
      if (!nearCamp(S, p)) { stepToward(S, p, S.camp); p.activity = 'dying'; }
      continue;
    }
    try { act(S, p, w, hour); } catch { p.activity = 'idle'; }
  }
}
