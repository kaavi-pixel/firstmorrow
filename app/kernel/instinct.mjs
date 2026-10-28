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
//
// On the planet, a place is a cell id and "beside" means "shares an edge": six
// neighbours, five at the twelve pentagons. A step is still 8 m of ground and
// still two minutes, so a person still walks 240 m/h — what changed is the shape
// of the world they walk it on. Every square in this file became a hex ball:
// "here or beside me" is seven cells, "within two" is nineteen, and the route is
// a breadth-first walk over the real graph rather than a march along x and y.

import { terrainAt, walkable, beside, neighbours, cellsWithin, cellDistance, campCells, sameLand } from '../public/terrain.mjs';
import { RULES, waterNeedL, capacity } from './validate.mjs';
import { weatherOn } from './weather.mjs';

export const INSTINCT_MINUTES = 2;
export const KEEP_DAYS = 2;       // water they like to have on them, in days
export const CAMP_DAYS = 6;       // camp water they try to keep, in days
export const FOOD_DAYS = 5;       // camp food they try to keep, in days
export const MORE_DAYS = 5;       // how far past those targets a surplus is still worth working
export const MATERIAL_KEEP = 500; // kg of building material they like in the yard
export const SOIL_KEEP = 150;     // kg of soil, for whatever turns soil into food

// One human to a cell. Not a courtesy — a rule. Two people cannot stand in the
// same place, so a step onto an occupied cell is not a step, and "home" means
// the camp cell or one of the six beside it (a doorway is not a room).
const occupantAt = (S, at, self) => S.people.some(q => q !== self && q.alive && q.at === at);
const nearCamp = (S, p) => campCells(S.terrain).has(p.at);
const tileAt = (S, at) => terrainAt(S.terrain, at);

/** The nearest cell within arm's reach that satisfies `pick`, underfoot first. */
function reachable(S, p, pick) {
  const under = tileAt(S, p.at);
  if (under && pick(under)) return under;
  for (const at of neighbours(S.terrain, p.at)) {
    const t = tileAt(S, at);
    if (t && pick(t)) return t;
  }
  return null;
}

/**
 * The nearest cell with something the camp needs, within reach, that nobody else
 * has already claimed. Three people walking to the same stone is one person
 * working and two people queuing, and the queue is what looks like idleness.
 *
 * The search is a hex ball walked outward from where they stand, nearest ring
 * first, so it stops at the first thing inside the radius instead of scanning the
 * whole world and sorting it. `cellsWithin` yields nearest-first, which is the
 * order this wants and the reason it no longer iterates every tile there is.
 */
function nearestSubstance(S, p, key, radius = RULES.reachTiles) {
  const claimed = new Set(S.people
    .filter(q => q.alive && q !== p && q.goal && Number.isInteger(q.goal.at))
    .map(q => q.goal.at));
  const found = nearestWithin(S, p, radius, t => t.regionId !== 'sea' && t[key] > 0 && !claimed.has(t.id));
  return found ? found.at : null;
}

/** The nearest cell with drinkable water still in it, within reach. */
function nearestWater(S, p, radius = RULES.reachTiles) {
  return nearestWithin(S, p, radius, t => t.potable > 0);
}

/** The nearest standing structure with water in it. What an author's process
 *  makes is the one thing a person can drink that nobody gathered, so somebody
 *  has to be able to find it and put their mouth to it. */
function nearestWaterStore(S, p, radius = RULES.reachTiles) {
  const byCell = new Map(S.structures.map(s => [s.at, s]));
  const found = nearestWithin(S, p, radius, t => {
    const s = byCell.get(t.id);
    return !!(s && s.built && s.store && s.store.water > 0);
  });
  return found ? { ...found, s: byCell.get(found.at) } : null;
}

/** Fill up from a structure's store instead of from the ground underfoot. */
function tapStore(S, p, s, want) {
  const room = Math.max(0, RULES.carryKg - packMass(p));
  const got = Math.min(s.store.water, room, want);
  if (got <= 0.01) return false;
  s.store.water -= got;
  p.pack.water += got;
  p.activity = 'drink';
  return true;
}

/** The nearest cell with anything worth eating on it. A person will walk for food,
 *  and when they are starving they will walk much further than they like to. */
function nearestForage(S, p, radius = RULES.reachTiles) {
  const found = nearestWithin(S, p, radius, t => t.food > 0);
  return found ? found.at : null;
}

/** The nearest standing roof, as a cell. Only asked for in a storm, so a search
 *  per structure is affordable here and exact rather than bounded. */
function nearestShelter(S, p) {
  let best = null, bestD = Infinity;
  for (const s of S.structures) {
    if (!s.built || !s.shelter) continue;
    const d = cellDistance(S.terrain, s.at, p.at);
    if (d < bestD) { bestD = d; best = s.at; }
  }
  return best;
}

const sheltered = (S, p) => {
  const near = cellsWithin(S.terrain, p.at, 2);
  return S.structures.some(s => s.built && s.shelter && near.has(s.at));
};

/**
 * A real route across the land, not a hopeful diagonal. Breadth-first over the
 * cell graph, bounded by the world rather than by a literal: the old limit of
 * 1500 nodes was fine on a 1,920 tile rectangle and quietly too small on a
 * planet of 10,242 cells, where the far side simply returned no route and the
 * walker fell back to one blind step at a time — a person walking at random for
 * the rest of the day. The budget is now `2 × cells`, so it cannot be outgrown by
 * a level change.
 *
 * A cell somebody is standing on is a wall, so nobody plans a march through a
 * neighbour; the one exception is the cell they are heading for, where they will
 * queue.
 */
function findRoute(S, from, to, self) {
  if (from === to) return [];
  const limit = 2 * S.terrain.tiles.size;
  const prev = new Map([[from, null]]);
  const q = [from];
  let head = 0;
  while (head < q.length && head < limit) {
    const cur = q[head++];
    for (const nx of neighbours(S.terrain, cur)) {
      if (prev.has(nx)) continue;
      const t = tileAt(S, nx);
      if (!t || t.regionId === 'sea') continue;
      if (nx !== to && occupantAt(S, nx, self)) continue;
      prev.set(nx, cur);
      if (nx === to) {
        const path = [];
        for (let n = nx; n !== null; n = prev.get(n)) path.push(n);
        return path.reverse().slice(1);      // the cells to walk, excluding where they stand
      }
      q.push(nx);
    }
  }
  return [];
}

/** One step onto a cell that is free. Sea and other people both say no. */
function walkStep(S, p, at) {
  if (at === p.at) return false;
  if (!walkable(S.terrain, at)) return false;
  if (occupantAt(S, at, p)) return false;
  p.prev = p.at;
  p.at = at;
  p.pack.food = Math.max(0, p.pack.food - RULES.kcalPerTileWalk);
  p.activity = 'walk';
  return true;
}

/**
 * How many steps from every cell to one cell, walked once and kept on the world.
 * The old `freeStepToward` compared x and y component by component, which has no
 * meaning on a graph; what is wanted is "which of the cells I can step onto is
 * nearest the goal", and that is a distance field from the goal.
 *
 * The field is a property of the goal and the land, not of the person, so it is
 * cached on the terrain and shared: five people queueing at the same spring walk
 * one field between them. Measured, this was the single biggest cost in the port
 * — the goals that matter are few and static, and recomputing a 1,120 cell walk
 * for each of them, for each of five people, several times a minute, is most of a
 * simulated day.
 */
const FIELDS = new WeakMap();
function fieldToward(S, goal) {
  let fields = FIELDS.get(S.terrain);
  if (!fields) { fields = new Map(); FIELDS.set(S.terrain, fields); }
  let dist = fields.get(goal);
  if (!dist) {
    dist = new Map([[goal, 0]]);
    const q = [goal];
    let head = 0;
    while (head < q.length) {
      const cur = q[head++];
      const d = dist.get(cur) + 1;
      for (const nx of neighbours(S.terrain, cur)) {
        if (dist.has(nx) || !walkable(S.terrain, nx)) continue;
        dist.set(nx, d);
        q.push(nx);
      }
    }
    if (fields.size >= 64) fields.clear();      // the goals that matter are few and stay put
    fields.set(goal, dist);
  }
  return dist;
}

/**
 * A step toward the goal that goes around whoever is standing in the way.
 * Nearest first, and never straight back to where they just stood unless that is
 * the only way on: two people squeezing past each other must not end up
 * shuttling between the same two cells for the rest of the day.
 */
function freeStepToward(S, p, goal) {
  if (p.at === goal) return false;
  const dist = fieldToward(S, goal);
  const here = dist.get(p.at);
  // No path at all: the goal is not on ground this person can walk to. That
  // happens on a planet — the nearest cell with food or water may be two steps
  // away across a strait on an islet nobody can reach. Shuffling between the two
  // cells either side of the water is not a walk, so say so and let the caller
  // give the errand up (`stuck` clears it after eight tries).
  if (here === undefined) return false;
  const back = p.prev;
  const options = neighbours(S.terrain, p.at)
    .filter(at => at !== back)
    .sort((a, b) => (dist.get(a) ?? Infinity) - (dist.get(b) ?? Infinity));
  const closer = options.filter(at => (dist.get(at) ?? Infinity) < here);
  for (const at of (closer.length ? closer : options)) if (walkStep(S, p, at)) return true;
  if (back !== undefined && walkStep(S, p, back)) return true;
  return false;
}

/** One step along the way. The route is cached on the person and rebuilt when it breaks. */
function stepToward(S, p, goal) {
  if (p.at === goal) { p.nav = null; return false; }
  let nav = p.nav;
  // Rebuild when the goal changed, or when the cached route has run out without
  // arriving — a stale route must never leave them standing still.
  if (!nav || nav.goal !== goal || !nav.steps.length) {
    // `from` is the cell they are standing on, never the person: the old call
    // passed the person, so `neighbours[<object>]` was undefined and the walk
    // silently planned nothing — every step in the world was taken by the blind
    // fallback below, which is how a route became a shuttle between two cells.
    nav = { goal, steps: findRoute(S, p.at, goal, p) };
    p.nav = nav;
  }
  while (nav.steps.length) {
    const at = nav.steps[0];
    // Somebody is standing there. Waiting at a doorway is how a camp starves, so
    // they step aside and rebuild the route from wherever they end up.
    if (occupantAt(S, at, p)) { p.nav = null; return freeStepToward(S, p, goal); }
    nav.steps.shift();
    p.prev = p.at;
    p.at = at;
    p.pack.food = Math.max(0, p.pack.food - RULES.kcalPerTileWalk);
    p.activity = 'walk';
    return true;
  }
  // No route at all: one honest step toward the goal. Moving "onto" your own
  // cell is how a person walks in place forever.
  return freeStepToward(S, p, goal);
}

/**
 * The nearest cell within `radius` steps that passes `test`, ring by ring and
 * nearest ring first, stopping at the first hit.
 *
 * `cellsWithin` builds the whole ball — at reach 24 that is 1,801 cells — and then
 * scans it, so a person standing three steps from the spring walked the entire
 * ball to find it. Measured, building balls was the largest single cost in the
 * ported world; the honest shape of this question is a widening ring that stops
 * when it finds what it is looking for, which is what the old code did by
 * scanning the fixed springs and forage indexes with a subtraction.
 */
function nearestWithin(S, p, radius, test) {
  const seen = new Set([p.at]);
  let ring = [p.at];
  for (let d = 1; d <= radius; d++) {
    const next = [];
    for (const i of ring) {
      for (const j of neighbours(S.terrain, i)) {
        if (seen.has(j)) continue;
        seen.add(j);
        next.push(j);
        if (!sameLand(S.terrain, p.at, j)) continue;    // never set an errand across water
        const t = tileAt(S, j);
        if (t && test(t)) return { at: j, d };
      }
    }
    if (!next.length) break;
    ring = next;
  }
  return null;
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
 * Not everyone keeps the same hours. Each person's night is `RULES.sleepHoursPerDay`
 * long, starting ninety minutes apart from 21:00, so the camp is never wholly
 * asleep: there is always somebody awake to fetch, build, or notice a storm
 * turning. The length of that night is also what fixes the day's labour budget
 * (see `SLEEP_HOURS_PER_DAY`): people work as long as they are awake.
 */
function sleepWindow(S, p) {
  const i = Math.max(0, S.people.indexOf(p));
  // Ninety minutes apart from 21:00, so the night is covered end to end and the
  // camp is never all asleep at once.
  const start = (21 * 60 + (i % 5) * 90) % 1440;
  const end = (start + RULES.sleepHoursPerDay * 60) % 1440;
  const m = S.minute % 1440;
  return end > start ? (m >= start && m < end) : (m >= start || m < end);
}

const outFetching = S => S.people.filter(q => q.alive && q.goal && q.goal.kind === 'water').length;
const outForaging = S => S.people.filter(q => q.alive && q.goal && q.goal.kind === 'food').length;
const outHauling = (S, key) => S.people.filter(q => q.alive && q.goal && q.goal.kind === key).length;

/** The unfinished site nearest to where they stand, as a structure. */
const unfinishedNear = (S, p) => {
  let best = null, bestD = Infinity;
  for (const s of S.structures) {
    if (s.built) continue;
    const d = cellDistance(S.terrain, s.at, p.at);
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
  const atSite = beside(S.terrain, site.at, p.at);
  if (!atSite) {
    if (asleep) return false;
    // Walking there is walking; only standing at the site is building.
    stepToward(S, p, site.at);
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
  // At camp means on the camp cell or beside it: only one person can stand on a
  // cell, so the doorway has to count as being home.
  const home = nearCamp(S, p);
  const keep = need * KEEP_DAYS;
  const tile = tileAt(S, p.at);
  const asleep = sleepWindow(S, p);
  p.activity = 'idle';
  const there = at => at === p.at || beside(S.terrain, p.at, at);

  // A storm coming, or already here: get under a roof. The errand waits.
  const storm = w.storm;
  if (storm && hour >= storm.hour - 2 && hour <= storm.hour + 4) {
    if (sheltered(S, p)) { p.activity = 'shelter'; p.resting = true; return; }
    const roof = nearestShelter(S, p);
    if (roof !== null) { p.resting = false; if (!stepToward(S, p, roof)) p.activity = 'shelter'; return; }
    p.activity = 'cower';
    return;
  }

  // No errand is worth dying on. Anyone away from camp who is running dry drops
  // what they were doing and goes to water, whatever they had set out to fetch.
  if (!home && p.pack.water < need * 0.6 && !(p.goal && p.goal.kind === 'water')) {
    // The nearest spring, a standing structure that holds water, or the camp
    // butt: any of the three is water, and the errand can wait for a living
    // person. Nearest wins, so a still built out by the coast is walked to
    // rather than passed by on the way to a spring. The camp is not a cell to
    // drink at — arriving home is what the survival loop needs to see.
    const spring = nearestWater(S, p);
    const tap = nearestWaterStore(S, p);
    const pick = !spring ? tap : !tap ? spring : (spring.d <= tap.d ? spring : tap);
    const goal = pick
      ? { kind: 'water', at: pick.at, store: pick.s || null }
      : (S.camp.stock.water > 0 ? { kind: 'home' } : null);
    if (goal) { p.goal = goal; p.activity = goal.kind === 'water' ? 'fetch' : 'carry'; stepToward(S, p, goal.at ?? S.camp.at); return; }
  }

  // ------------------------------------------------------------ an errand, in progress
  if (p.goal && p.goal.kind === 'water') {
    const at = p.goal.at;
    // Drinking distance: the bank of the spring counts, because the water cell
    // itself may be taken and a pool does not fit one pair of feet.
    if (there(at)) {
      const store = p.goal.store && p.goal.store.store && p.goal.store.store.water > 0 ? p.goal.store : null;
      const took = store ? tapStore(S, p, store, 4 * RULES.waterDrinkLDay) : drink(S, p);
      const more = store ? store.store.water > 0.01 : reachable(S, p, t => t.potable > 0);
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
    if (there(at)) {
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
    if (there(at)) {
      p.activity = 'gather';
      // An errand that cannot make progress has to give up. `gatherSubstance`
      // takes nothing when the cell has under half a kilogram left; `more` stayed
      // true while any trace remained, so the goal never cleared and the person
      // stood on the spot gathering nothing for the rest of the day. Latent on the
      // rectangle, where a cell was either full or empty; the planet's coast cells
      // strip to a trace and it swallowed whole days — the camp spent 2,160 of
      // 3,600 person-ticks in this branch, never slept, and never fetched water.
      const got = gatherSubstance(S, p, key);
      const more = reachable(S, p, t => (t[key] || 0) > 0);
      if (!got || !more || p.pack[key] >= 6 || RULES.carryKg - packMass(p) < 1) p.goal = { kind: 'home' };
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
      if (!stepToward(S, p, S.camp.at)) { p.stuck = (p.stuck || 0) + 1; if (p.stuck > 12) { p.goal = null; p.stuck = 0; } }
      else p.stuck = 0;
      return;
    }
  }

  // ----------------------------------------------------------------- away from camp
  if (!home) {
    if (p.health < 25) { p.goal = { kind: 'home' }; p.activity = 'carry'; stepToward(S, p, S.camp.at); return; }
    // Thirst first: three days without water and they are dead.
    if (p.pack.water < need * 0.6) {
      const water = nearestWater(S, p);
      p.goal = water ? { kind: 'water', at: water.at, store: null } : { kind: 'home' };
      p.activity = water ? 'fetch' : 'no-water';
      stepToward(S, p, water ? water.at : S.camp.at);
      return;
    }
    // Water they are already carrying goes home before anything else. Fetching a
    // load and then wandering off to forage would leave the camp dry.
    if (p.pack.water > keep) {
      p.goal = { kind: 'home' }; p.activity = 'carry'; stepToward(S, p, S.camp.at); return;
    }
    // Then hunger. They will walk for food before they will stand about, and a
    // starving person walks further than a comfortable one.
    if (p.pack.food < RULES.foodPerPersonDay * 0.8) {
      if (tile && tile.food > 0 && gather(S, p)) return;
      const desperate = p.pack.food < RULES.foodPerPersonDay * 0.3;
      const food = nearestForage(S, p, desperate ? RULES.reachTiles * 6 : 14);
      if (food !== null) { p.goal = { kind: 'food', at: food }; p.activity = 'forage'; stepToward(S, p, food); return; }
      const store = S.structures.find(s => s.built && s.store && s.store.food > 0 && beside(S.terrain, s.at, p.at));
      if (store) {
        const got = Math.min(store.store.food, 2 * RULES.foodPerPersonDay, Math.max(0, RULES.carryKg * RULES.foodKcalPerKg - packMass(p)));
        if (got > 0) { store.store.food -= got; p.pack.food += got; p.activity = 'eat'; return; }
      }
    }
    // Carrying a load of food home.
    if (p.pack.food > 2 * RULES.foodPerPersonDay) {
      p.goal = { kind: 'home' }; p.activity = 'carry'; stepToward(S, p, S.camp.at); return;
    }
    // A structure the authors designed, still unfinished, is work they can walk
    // to. Water and food first, then the site: a person away from camp who has
    // both is not idle, they are on their way to build.
    const buildingSite = unfinishedNear(S, p);
    if (buildingSite && build(S, p, buildingSite, asleep)) return;
    // Nothing to do out here. Somewhere else is better than here, and home is
    // where the water is.
    p.activity = asleep ? 'sleep' : 'carry';
    stepToward(S, p, S.camp.at);
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
    if (water) { p.goal = { kind: 'water', at: water.at, store: null }; p.activity = 'fetch'; stepToward(S, p, water.at); return; }
  }

  // Then food: they keep the larder stocked before they lift a finger to build.
  // An empty larder is everyone's problem; a low one is a few people's.
  const foodCrew = foodDays < 1 ? 5 : foodDays < 2 ? 4 : 3;
  if (foodDays < FOOD_DAYS && (!asleep || foodDays < 1) && outForaging(S) < foodCrew) {
    // Nearer fields first: a twelve-cell walk for food burns what the food was
    // meant to replace.
    const food = nearestForage(S, p, 14);
    if (food !== null) { p.goal = { kind: 'food', at: food }; p.activity = 'forage'; stepToward(S, p, food); return; }
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
      if (at !== null) { p.goal = { kind: key, at }; p.activity = 'haul'; stepToward(S, p, at); return; }
    }
  }

  // Comfortable is not finished. While the reserve is only just comfortable one
  // of them keeps working the surplus: a couple of extra days in the butt is the
  // difference between a lean week and four graves.
  if (!asleep && foodDays >= FOOD_DAYS && waterDays < CAMP_DAYS + MORE_DAYS && outFetching(S) < 1) {
    const water = nearestWater(S, p);
    if (water) { p.goal = { kind: 'water', at: water.at, store: null }; p.activity = 'fetch'; stepToward(S, p, water.at); return; }
  }
  if (!asleep && foodDays < FOOD_DAYS + MORE_DAYS && outForaging(S) < 1) {
    const food = nearestForage(S, p, 14);
    if (food !== null) { p.goal = { kind: 'food', at: food }; p.activity = 'forage'; stepToward(S, p, food); return; }
  }

  // Nothing pressing. Standing alone in the middle of a camp is not living, so
  // they go and find somebody: the nearest awake person, and a word with them.
  // A conversation is not a post, though — half an hour with the same person and
  // they move on to another, so the camp circulates instead of freezing into a
  // ring of figures.
  if (!asleep) {
    const others = S.people.filter(q => q.alive && q !== p);
    const withinTwo = cellsWithin(S.terrain, p.at, 2);
    const beside_ = others.find(q => withinTwo.has(q.at));
    if (p.chatWith !== (beside_ ? beside_.id : null)) { p.chatWith = beside_ ? beside_.id : null; p.chatSince = S.minute; }
    const longEnough = S.minute - (p.chatSince ?? S.minute) > 30;
    if (beside_ && !longEnough) { p.activity = 'talk'; return; }
    const someone = others
      .filter(q => q.at !== p.at && !sleepWindow(S, q) && q.id !== (beside_ ? beside_.id : null))
      .sort((a, b) => cellDistance(S.terrain, a.at, p.at) - cellDistance(S.terrain, b.at, p.at))[0];
    if (someone && stepToward(S, p, someone.at)) { p.activity = 'walk'; return; }
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
      // freezes four cells out dies of thirst with a full butt behind them,
      // which is an artefact, not a fact. Crawling is not labour.
      p.activity = 'dying';
      if (!nearCamp(S, p)) { stepToward(S, p, S.camp.at); p.activity = 'dying'; }
      continue;
    }
    try { act(S, p, w, hour); } catch { p.activity = 'idle'; }
  }
}
