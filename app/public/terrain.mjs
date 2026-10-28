// Land for Firstmorrow v2, on a planet.
//
// A cell is a tile: the same 8 m of ground, the same finite reserves in it, the
// same rule that one body stands on one tile. What changed is how a place is
// *named*. There is no x and no y any more. A place is a cell id, and "beside"
// means "shares an edge with": six neighbours, and five at the twelve pentagons
// Euler's formula forces on any hex planet.
//
// The geometry is not state and is not saved. A cell's position is a pure function
// of (seed, subdivisions), so the graph is rebuilt on demand from two numbers and
// the save holds only what can actually change: which region a cell is, and what is
// left in it. That is the same argument the observer contract makes about the
// payload, applied to storage — geometry from the module, state from the record.
//
// Nothing here is hand placed. `campsite` and `springFor` in hexasphere.mjs choose
// the camp and the spring from the seed; there is no `START` and no `OASIS` to
// offset from any more.

import { worldPlanet, cellsWithin as ballWithin, cellDistance as stepsBetween } from './hexasphere.mjs';
import { TILE_M, REGIONS, region } from './regions.mjs';

export { TILE_M, REGIONS, region };

export const GEO_VERSION = 2;
// How finely the icosahedron is subdivided. Level 14 is 1,962 cells and 186 m
// across; level 32 is 10,242 and 425 m. It is one number, and the whole world
// follows it, so it is read once here rather than passed around.
// The level, as a default and a parameter — never a module-scope environment read.
// The browser imports this module to draw the planet, and a constant that has to be
// read at load time is exactly what the regions split took away from the planet: the
// moment anything in `public/` reads `process.env`, every client import of it dies
// with `process is not defined` before a line runs. The server reads its environment
// where its environment lives, and passes the number in.
export const SUBDIVISIONS = 14;

// The graph, by (seed, subdivisions). Pure geometry, shared, never serialised.
const GRAPHS = new Map();
export function planetFor(seed = 2049, subdivisions = SUBDIVISIONS) {
  const key = `${seed}:${subdivisions}`;
  let g = GRAPHS.get(key);
  if (!g) { g = worldPlanet({ seed, subdivisions }); GRAPHS.set(key, g); }
  return g;
}
const GRAPH_OF = new WeakMap();
export function graphOf(g) {
  let p = GRAPH_OF.get(g);
  if (!p) { p = planetFor(g.seed, g.subdivisions ?? SUBDIVISIONS); GRAPH_OF.set(g, p); }
  return p;
}

/**
 * The world's land: the regions and the reserves, addressed by cell id.
 *
 * Deliberately not the geometry. `tiles` is a Map of cell id to a small record of
 * what is there and what is left, which is the part a save has to carry.
 */
export function createTerrain(seed = 2049, subdivisions = SUBDIVISIONS) {
  const planet = planetFor(seed, subdivisions);
  const tiles = new Map();
  for (const c of planet.cells) {
    tiles.set(c.id, {
      id: c.id, regionId: c.regionId,
      water: c.water, soil: c.soil, material: c.material,
      potable: c.potable, food: c.food,
    });
  }
  return {
    version: GEO_VERSION, seed, subdivisions, tileM: TILE_M,
    regions: REGIONS.map(r => ({ id: r.id, name: r.name, color: r.color })),
    tiles,
    camp: planet.camp,
    // The spring, as the four cells it is: one body to a tile, so five people
    // cannot drink from one cell.
    spring: (planet.spring?.cells ?? []).slice(),
    springs: [...planet.springs],
    forage: [...planet.forage],
    features: [],
  };
}

/**
 * Worlds saved before wild food existed have no `food` on their cells, so the
 * people would starve on land that now ought to feed them. Cells that already
 * carry food are left exactly as they are: a stripped hillside must not refill.
 */
export function addWildFood(g) {
  if (!g || !(g.tiles instanceof Map) || g.tiles.size === 0) return g;
  let missing = false;
  for (const t of g.tiles.values()) if (typeof t.food !== 'number') { missing = true; break; }
  if (!missing) return g;
  // The reserve a cell was born with, straight from the geometry, so a save that
  // predates wild food is given exactly what the land it stands on carries.
  const planet = graphOf(g);
  for (const t of g.tiles.values()) {
    if (typeof t.food === 'number') continue;
    t.food = planet.cells[t.id]?.food ?? 0;
  }
  g.forage = [];
  for (const t of g.tiles.values()) if (t.food > 0) g.forage.push(t.id);
  g.springs = [];
  for (const t of g.tiles.values()) if (t.potable > 0) g.springs.push(t.id);
  return g;
}

/** The ground of one cell, or null if there is no such cell. */
export function terrainAt(g, at) {
  if (!g || !Number.isInteger(at)) return null;
  return g.tiles.get(at) || null;
}

/** The sea is not ground you can stand on. */
export function walkable(g, at) {
  const t = g.tiles.get(at);
  return !!t && region(t.regionId)?.walk === true;
}

// --- the neighbourhood, which is no longer a square ---------------------------

/** A cell's own neighbours: six of them, five at the twelve pentagons. */
export const neighbours = (g, at) => graphOf(g).neighbours[at] || [];

/** Steps between two cells over neighbours. Replaces `|dx| + |dy|`. */
export const cellDistance = (g, a, b) => (a === b ? 0 : stepsBetween(graphOf(g), a, b));

/** Every cell within `steps` of one, nearest first (a hex ball, not a box). */
export const cellsWithin = (g, from, steps) => ballWithin(graphOf(g), from, steps);

/** Are two cells the same place, or next to each other? The old `<= 1` box. */
export const beside = (g, a, b) => a === b || neighbours(g, a).includes(b);

/**
 * The camp, as a place. One body to a cell, so the camp is the camp cell plus its
 * neighbours — seven cells, six when the camp sits on a pentagon — or four of the
 * five would be queuing outside their own water butt.
 */
export function campCells(g) {
  if (!Number.isInteger(g?.camp)) return new Set();
  const key = `${g.camp}/${g.seed}/${g.subdivisions}`;
  let set = CAMP_CACHE.get(g);
  if (!set || set.key !== key) { set = { key, cells: new Set(cellsWithin(g, g.camp, 1).keys()) }; CAMP_CACHE.set(g, set); }
  return set.cells;
}
const CAMP_CACHE = new WeakMap();

/**
 * Which landmass each walkable cell is on, as a number, built once per graph.
 *
 * A rectangle had one landmass and an edge you could see coming. A planet has
 * 1,120 cells of continent at level 14 plus islets of two, one and one — and an
 * errand set to a cell across water is an errand nobody can carry out. `findRoute`
 * answers the same question the hard way; this answers it once.
 */
const LANDMASS = new WeakMap();
export function landmassIndex(g) {
  let m = LANDMASS.get(g);
  if (m) return m;
  const graph = graphOf(g);
  m = new Map();
  let n = 0;
  for (const c of graph.cells) {
    if (m.has(c.id) || c.regionId === 'sea') continue;
    const stack = [c.id];
    m.set(c.id, n);
    while (stack.length) {
      const i = stack.pop();
      for (const j of graph.neighbours[i]) {
        if (m.has(j) || graph.cells[j].regionId === 'sea') continue;
        m.set(j, n);
        stack.push(j);
      }
    }
    n++;
  }
  LANDMASS.set(g, m);
  return m;
}

/** Can somebody standing on one cell walk to the other at all? */
export function sameLand(g, a, b) {
  const m = landmassIndex(g);
  return m.has(a) && m.get(a) === m.get(b);
}

/** Did the land ever get a camp? A world shaped but not composed has none. */
export const hasCamp = g => Number.isInteger(g?.camp);
