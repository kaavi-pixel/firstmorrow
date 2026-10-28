// What the browser is allowed to see: the whole world, because the browser is an
// observer, not an inhabitant. This is the only place hidden state becomes public.

import { PALETTE } from '../public/forms.mjs';
import { living, shelterCount, summarise, dayIndex, minuteOfDay } from './world.mjs';
import {
  region, terrainAt, walkable, neighbours, campCells, cellDistance, sameLand,
} from '../public/terrain.mjs';

const REGION_INDEX = new Map();
export function regionIds(terrain) {
  if (!REGION_INDEX.size) terrain.regions.forEach((r, i) => REGION_INDEX.set(r.id, i));
  return terrain.regions.map(r => r.id);
}

function activityFor(S, p) {
  if (!p.alive) return { at: p.at, kind: 'gone', hidden: true };
  // The people's own behaviour decides what they are doing; this is just how it
  // is drawn.
  const kind = p.activity || 'idle';
  const art = { sleep: 'sleep', drink: 'walk', eat: 'walk', fetch: 'walk', carry: 'walk', forage: 'walk',
    gather: 'walk', haul: 'walk', talk: 'idle',
    build: 'build', walk: 'walk', shelter: 'idle', cower: 'idle', 'no-water': 'idle', idle: 'idle', dying: 'idle' };
  return { at: p.at, kind: art[kind] || 'idle', doing: kind };
}

export function livePayload(S, now = Date.now()) {
  const terrain = S.terrain;
  const ids = regionIds(terrain);
  // Only the region of each cell rides the poll. A cell's position is a pure
  // function of (seed, subdivisions), so the geometry must not be sent at all, and
  // the reserves are read one cell at a time by whoever clicks it.
  const cellRegions = new Array(terrain.tiles.size).fill(0);
  for (const t of terrain.tiles.values()) cellRegions[t.id] = ids.indexOf(t.regionId);

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
      version: terrain.version, seed: terrain.seed, subdivisions: terrain.subdivisions,
      tileM: terrain.tileM, cellM: terrain.tileM,
      regions: terrain.regions, regionIds: ids, cellRegions,
      // Placement is authority, and this world has one authority. The client can
      // recompute the camp and the spring from (seed, subdivisions), but both are
      // sent anyway: the day anything moves the camp or drains the spring by hand,
      // a recomputing client would draw water the world does not have, and nothing
      // about it would look wrong until someone walked there.
      camp: terrain.camp, spring: terrain.spring,
    },
    buildings: S.structures.map(s => ({
      id: s.id, name: s.name, at: s.at, sprite: s.sprite, palette: PALETTE,
      // What the author said this is for. It is the reason the thing exists, and
      // the only part of a structure a visitor can actually read.
      description: s.description || null,
      built: s.built, progressHours: s.progressHours, laborHours: s.laborHours,
      active: true, damaged: !!s.damaged,
      mass: Math.round(s.mass || 0), shelter: s.shelter || 0,
      author: (S.authors.find(a => a.id === s.authorId) || {}).name || null,
      program: s.program || null,
      physical: { shelterAreaM2: (s.shelter || 0) * 3.5 },
    })),
    // art.js expects inhabitants and a parallel activity list.
    inhabitants: people.map(p => ({
      id: p.id, name: p.name, color: p.color, hair: p.hair, at: p.at,
      age: Math.floor(p.age), health: Math.round(p.health), doing: p.activity || 'idle',
      thirst: +(p.thirst || 0).toFixed(2), starving: +(p.starving || 0).toFixed(2),
      carrying: { water: +(p.pack.water || 0).toFixed(1), food: Math.round(p.pack.food || 0) },
      children: p.children || 0, pregnant: !!p.pregnant,
    })),
    activities: people.map(p => activityFor(S, p)),
    authors: S.authors.map(a => ({
      id: a.id, name: a.name, model: a.model, color: a.color, role: a.role,
      calls: a.calls || 0, standing: S.structures.filter(s => s.authorId === a.id).length,
      design: a.lastProgram || null,
    })),
    authorActivity: S.authors.map(a => ({ at: a.at, kind: a.say ? 'think' : 'idle' })),
    council: (S.council || []).slice(-20).map(m => ({ name: m.name, at: m.t, text: m.text })),
    conversations: (S.conversations || []).slice(-60).reverse(),
    speech: Object.fromEntries([...people, ...S.authors].filter(p => p.say && S.minute - p.saidAt < 720).map(p => [p.id, p.say])),
    log: S.log.slice(-40).reverse(),
    dead: S.graveyard,
    ledger: { water: S.camp.stock.water, food: S.camp.stock.food, material: S.camp.stock.material, soil: S.camp.stock.soil, shelter: shelterCount(S) },
  };
}

/**
 * One clicked cell, in full. This is the whole reason the poll carries no reserves:
 * a hexagon's ground is read one cell at a time, and there is no poll at all while
 * nobody is looking at one. Sent per click, never per second.
 *
 * A null answer means "no such cell", which on a sphere is not the same as "sea":
 * the sea is a region somebody can stand beside and cannot stand on, and a cell id
 * past the end of the planet is nothing at all.
 */
export function cellCard(S, id) {
  const g = S?.terrain;
  // Strict, because `Number('')` is 0 and `Number('0x10')` is 16: a query string is
  // text, and the gap between text and maths is where `?id=` becomes cell zero. The
  // route passes a string; an exact integer is accepted so a probe can call it directly.
  const raw = typeof id === 'string' ? id.trim() : id;
  const at = typeof raw === 'number' ? raw : (/^[0-9]{1,9}$/.test(raw) ? Number(raw) : NaN);
  if (!Number.isSafeInteger(at) || at < 0) return null;
  const t = terrainAt(g, at);
  if (!t) return null;
  const r = region(t.regionId) || { id: t.regionId, name: t.regionId, walk: false };
  const near = neighbours(g, at);
  const camp = S.camp && Number.isInteger(g.camp) ? campCells(g).has(at) : false;
  return {
    id: at,
    regionId: t.regionId, regionName: r.name, walk: walkable(g, at),
    camp, campCell: at === g.camp,
    pentagon: near.length === 5,
    neighbours: near.slice(),
    // Graph steps, straight across the world. A walk that has to go round the coast
    // is a different number and it is the people's, not the observer's.
    stepsFromCamp: Number.isInteger(g.camp) ? cellDistance(g, g.camp, at) : null,
    // Honest about the islets: a cell across water is a place nobody can walk to.
    reachableOnFoot: Number.isInteger(g.camp) ? sameLand(g, g.camp, at) : null,
    reserves: {
      water: t.water, potable: t.potable, soil: t.soil, material: t.material, food: t.food,
    },
    standing: S.structures.filter(s => s.at === at).map(s => ({
      id: s.id, name: s.name, description: s.description || null, mass: Math.round(s.mass || 0),
      built: !!s.built, shelter: s.shelter || 0, damaged: !!s.damaged,
      author: (S.authors.find(a => a.id === s.authorId) || {}).name || null,
      program: s.program || null,
    })),
    people: living(S).filter(p => p.at === at).map(p => ({
      id: p.id, name: p.name, age: Math.floor(p.age), health: Math.round(p.health),
      doing: p.activity || 'idle',
    })),
    authors: S.authors.filter(a => a.at === at).map(a => ({ id: a.id, name: a.name, role: a.role })),
  };
}

export { region, terrainAt };
