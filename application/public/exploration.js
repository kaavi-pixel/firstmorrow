import { START, terrainAt, findLandRoute, visibleIslands, integerPoint } from './geography.js';
import { walkingObstacles } from './navigation.js';

// Explicit scenario parameters, not physiological or engineering predictions.
export const TRAVEL = Object.freeze({
  minutesPerTile: 2, waterPerTileL: .02, foodPerTileKcal: 2,
  carryKg: 20, foodKcalPerKg: 3500, sightRadius: 2
});
const clone = v => JSON.parse(JSON.stringify(v));
const key = p => `${p.x},${p.y}`;
export const campOf = w => w?.exploration?.camp || START;
export const atCamp = (p, w) => p?.x === campOf(w).x && p?.y === campOf(w).y;
export const walkingRoute = (w, from, to, options = {}) =>
  findLandRoute(w.geography, from, to, { ...options, blocked: walkingObstacles(w) });
export const packedMass = p => p.water + p.food / TRAVEL.foodKcalPerKg + p.materials;
const time = w => w.day * 1440 + w.minute;
function state(w, personId) {
  const e = w.exploration;
  if (!e || !w.inhabitants.some(p => p.id === personId)) throw new Error('Unknown explorer.');
  e.packs ||= Object.fromEntries(w.inhabitants.map(p => [p.id, { water: 0, food: 0, materials: 0 }]));
  return e;
}
function log(w, journey, kind, text) {
  w.history.push({ day: w.day, minute: w.minute, eventId: `${journey.id}:${kind}`,
    actorId: journey.personId, text });
  if (w.history.length > 300) w.history.splice(0, w.history.length - 300);
}
export function observe(w, personId) {
  const e = state(w, personId), p = e.positions[personId], k = e.knowledge[personId];
  const blocked = walkingObstacles(w);
  for (let dy = -TRAVEL.sightRadius; dy <= TRAVEL.sightRadius; dy++)
    for (let dx = -TRAVEL.sightRadius; dx <= TRAVEL.sightRadius; dx++) {
      const t = terrainAt(w.geography, p.x + dx, p.y + dy);
      if (!t || (t.landmass && t.landmass !== 'mainland' && !w.geography.islandsEnabled)) continue;
      const region = w.geography.regions.find(r => r.id === t.regionId);
      k.tiles[key(t)] = { ...t, blocked: blocked.has(key(t)), observedAt: time(w), ...(region ? { properties: clone(region.properties) } : {}) };
    }
  for (const sight of visibleIslands(w.geography, p, time(w)))
    k.islands[sight.id] = { ...sight, stage: 'sighted', observedAt: time(w), from: { ...p } };
  return clone(k);
}
export function inhabitantView(w, personId) {
  const e = state(w, personId), person = w.inhabitants.find(p => p.id === personId);
  return {
    person: clone(person), position: { ...e.positions[personId] },
    carried: clone(e.packs[personId]), knowledge: clone(e.knowledge[personId]),
    journey: e.journeys[personId] ? {
      id: e.journeys[personId].id, status: e.journeys[personId].status,
      destination: clone(e.journeys[personId].destination)
    } : null
  };
}

// Requests are internal simulation actions until M3 exposes them to the model.
// A monotonic sequence is persisted per inhabitant, rejecting stale/replayed IDs
// without an unbounded receipt log.
export function startJourney(w, personId, destination, sequence, provisions = { water: 15, food: 2100, materials: 0 }, options = {}) {
  const e = state(w, personId);
  if (!integerPoint(destination)) throw new Error('Invalid destination.');
  e.sequences ||= {};
  if (!Number.isSafeInteger(sequence) || sequence !== (e.sequences[personId] || 0) + 1)
    throw new Error('Stale or out-of-order action.');
  if (e.journeys[personId]?.status === 'active') throw new Error('Already travelling.');
  const origin = e.positions[personId], path = walkingRoute(w, origin, destination, options);
  if (!path || path.length < 2) throw new Error('No supported land route.');
  const steps = path.length - 1;
  const durationMinutes = steps * TRAVEL.minutesPerTile;
  if (durationMinutes * 2 >= 1440) throw new Error('Route exceeds the one-day scouting envelope.');
  const existing = e.packs[personId], departingCamp = atCamp(origin, w);
  const additions = { water: 0, food: 0, materials: 0 };
  if (departingCamp) {
    for (const resource of Object.keys(additions)) {
      const n = provisions[resource] ?? 0;
      if (!Number.isFinite(n) || n < 0) throw new Error('Invalid provisions.');
      additions[resource] = n;
    }
    // Pack travel effort for an outbound and return leg, in addition to rations.
    additions.water += steps * 2 * TRAVEL.waterPerTileL;
    additions.food += steps * 2 * TRAVEL.foodPerTileKcal;
  }
  const pack = Object.fromEntries(Object.keys(additions).map(r => [r, existing[r] + additions[r]]));
  if (packedMass(pack) > TRAVEL.carryKg) throw new Error('Carrying capacity exceeded.');
  const midnight = (w.day + 1) * 1440;
  const crossesDay = time(w) + durationMinutes >= midnight;
  const waterNeeded = steps * TRAVEL.waterPerTileL + (crossesDay ? 15 : 0);
  const foodNeeded = steps * TRAVEL.foodPerTileKcal + (crossesDay ? 2100 : 0);
  if (pack.water + 1e-9 < waterNeeded || pack.food + 1e-9 < foodNeeded) throw new Error('Insufficient carried provisions.');
  for (const r of Object.keys(additions)) if (w.resources[r] < additions[r]) throw new Error(`Insufficient ${r}.`);
  // All validation precedes the first resource mutation.
  for (const r of Object.keys(additions)) w.resources[r] -= additions[r];
  e.packs[personId] = pack;
  e.sequences[personId] = sequence;
  const journey = {
    id: `${personId}:j${sequence}`, personId, origin: { ...origin }, destination: { ...destination },
    route: path, step: 0, stepMinutes: 0, status: 'active', startedAt: time(w),
    lastMinute: time(w), durationMinutes, roundTrip: options.roundTrip === true,
    phase: 'outbound', knownOnly: !!options.allowed
  };
  e.journeys[personId] = journey;
  observe(w, personId);
  log(w, journey, 'departure', `${w.inhabitants.find(p=>p.id===personId).name} leaves on a scouting journey`);
  return clone({ id: journey.id, status: journey.status, durationMinutes });
}

export function cancelJourney(w, personId) {
  const e = state(w, personId), j = e.journeys[personId];
  if (!j || j.status !== 'active') return false;
  j.status = 'cancelled';
  log(w, j, 'cancelled', `${personId} stops travelling; supplies remain with them`);
  return true;
}
export function advanceJourneys(w) {
  if (!w.exploration) return;
  for (const [personId, j] of Object.entries(w.exploration.journeys)) {
    if (j.status !== 'active' || j.lastMinute >= time(w)) continue;
    // Called once per simulation minute. Refuse catch-up shortcuts that would
    // skip day-end consumption; the simulation's minute loop is authoritative.
    if (time(w) !== j.lastMinute + 1) throw new Error('Journey must advance one simulation minute at a time.');
    j.lastMinute = time(w);
    // Revalidate on every minute, including after a restart or a new structure.
    // A blocked route can be repaired, but never teleported through.
    const e = state(w, personId), blocked = walkingObstacles(w);
    if (j.route.slice(j.step + 1).some(p => blocked.has(key(p)))) {
      const route = walkingRoute(w, e.positions[personId], j.destination,
        j.knownOnly ? {allowed:new Set(Object.keys(e.knowledge[personId].tiles))} : {});
      if (!route) {
        j.status = 'blocked';
        log(w, j, 'blocked', `${personId} stops because the route is blocked`);
        continue;
      }
      j.route = route; j.step = 0; j.stepMinutes = 0;
      log(w, j, `reroute-${time(w)}`, `${personId} takes a new route around an obstacle`);
    }
    j.stepMinutes++;
    if (j.stepMinutes < TRAVEL.minutesPerTile) continue;
    const pack = e.packs[personId];
    if (pack.water + 1e-9 < TRAVEL.waterPerTileL || pack.food + 1e-9 < TRAVEL.foodPerTileKcal) {
      j.status = 'failed';
      log(w, j, 'failed', `${personId} stops: carried travel supplies are exhausted`);
      continue;
    }
    pack.water = Math.max(0, pack.water - TRAVEL.waterPerTileL);
    pack.food = Math.max(0, pack.food - TRAVEL.foodPerTileKcal);
    w.balances.waterUsedL += TRAVEL.waterPerTileL;
    w.balances.foodConsumedKcal += TRAVEL.foodPerTileKcal;
    j.step++; j.stepMinutes = 0;
    e.positions[personId] = { ...j.route[j.step] };
    observe(w, personId);
    if (j.step === j.route.length - 1) {
      if (j.roundTrip && j.phase === 'outbound') {
        const route = walkingRoute(w, e.positions[personId], campOf(w),
          j.knownOnly ? {allowed:new Set(Object.keys(e.knowledge[personId].tiles))} : {});
        if (!route) {
          j.status = 'blocked';
          log(w, j, 'blocked-return', `${personId} cannot find a clear route home`);
          continue;
        }
        j.phase = 'return'; j.destination = {...campOf(w)};
        j.route = route; j.step = 0; j.stepMinutes = 0;
        log(w, j, 'surveyed', `${w.inhabitants.find(p=>p.id===personId).name} finishes scouting and heads home`);
        continue;
      }
      j.status = 'completed'; j.completedAt = time(w);
      if (atCamp(e.positions[personId], w)) {
        for (const r of ['water', 'food', 'materials']) { w.resources[r] += pack[r]; pack[r] = 0; }
      }
      log(w, j, 'arrival', `${w.inhabitants.find(p=>p.id===personId).name} arrives${atCamp(e.positions[personId],w)?' back at camp':' at the end of their journey'}`);
    }
  }
}
