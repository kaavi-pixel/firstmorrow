// What the browser is allowed to see: the whole world, because the browser is an
// observer, not an inhabitant. This is the only place hidden state becomes public.

import { PALETTE } from '../public/forms.mjs';
import { living, shelterCount, summarise, dayIndex, minuteOfDay } from './world.mjs';
import { region, terrainAt } from '../public/terrain.mjs';

const REGION_INDEX = new Map();
export function regionIds(terrain) {
  if (!REGION_INDEX.size) terrain.regions.forEach((r, i) => REGION_INDEX.set(r.id, i));
  return terrain.regions.map(r => r.id);
}

function activityFor(S, p) {
  if (!p.alive) return { tile: { x: p.x, y: p.y }, kind: 'gone', hidden: true };
  // The people's own behaviour decides what they are doing; this is just how it
  // is drawn.
  const kind = p.activity || 'idle';
  const art = { sleep: 'sleep', drink: 'walk', eat: 'walk', fetch: 'walk', carry: 'walk', forage: 'walk',
    build: 'build', walk: 'walk', shelter: 'idle', cower: 'idle', 'no-water': 'idle', idle: 'idle', dying: 'idle' };
  return { tile: { x: p.x, y: p.y }, kind: art[kind] || 'idle', doing: kind };
}

export function livePayload(S, now = Date.now()) {
  const terrain = S.terrain;
  const ids = regionIds(terrain);
  const grid = new Array((terrain.bounds.maxX + 1) * (terrain.bounds.maxY + 1)).fill(0);
  for (const t of terrain.tiles.values()) grid[t.y * (terrain.bounds.maxX + 1) + t.x] = ids.indexOf(t.regionId);

  const people = living(S);
  return {
    now,
    day: dayIndex(S),
    minute: minuteOfDay(S),                      // art.js reads minute-of-day for darkness
    clock: `${String(Math.floor(minuteOfDay(S) / 60)).padStart(2, '0')}:${String(minuteOfDay(S) % 60).padStart(2, '0')}`,
    seed: S.seed,
    summary: summarise(S),
    weather: { season: summarise(S).season, tempC: summarise(S).tempC },
    geography: {
      version: terrain.version, seed: terrain.seed, tileM: terrain.tileM,
      bounds: terrain.bounds, mainland: terrain.mainland,
      regions: terrain.regions, features: terrain.features, oasis: terrain.oasis,
      grid, gridW: terrain.bounds.maxX + 1, regionIds: ids,
    },
    buildings: S.structures.map(s => ({
      id: s.id, name: s.name, x: s.x, y: s.y, sprite: s.sprite, palette: PALETTE,
      built: s.built, progressHours: s.progressHours, laborHours: s.laborHours,
      active: true, damaged: !!s.damaged,
      physical: { shelterAreaM2: (s.shelter || 0) * 3.5 },
    })),
    // art.js expects inhabitants and a parallel activity list.
    inhabitants: people.map(p => ({ id: p.id, name: p.name, color: p.color, hair: p.hair, x: p.x, y: p.y, age: Math.floor(p.age), health: Math.round(p.health), doing: p.activity || 'idle' })),
    activities: people.map(p => activityFor(S, p)),
    authors: S.authors.map(a => ({ id: a.id, name: a.name, model: a.model, color: a.color, role: a.role })),
    authorActivity: S.authors.map(a => ({ tile: { x: a.x, y: a.y }, kind: a.say ? 'think' : 'idle' })),
    council: (S.council || []).slice(-20).map(m => ({ name: m.name, at: m.t, text: m.text })),
    speech: Object.fromEntries([...people, ...S.authors].filter(p => p.say && S.minute - p.saidAt < 720).map(p => [p.id, p.say])),
    log: S.log.slice(-40).reverse(),
    dead: S.graveyard,
    ledger: { water: S.camp.stock.water, food: S.camp.stock.food, material: S.camp.stock.material, soil: S.camp.stock.soil, shelter: shelterCount(S) },
  };
}

export { region, terrainAt };
