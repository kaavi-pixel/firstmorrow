// The world as a planet instead of a rectangle.
//
// Reality does not change here. A cell is a tile: the same 8 m of ground, the same
// finite reserves, the same rule that one body stands on one tile. What changes is
// how places are addressed, how many neighbours a place has, and what "far away"
// measures.
//
// A sphere cannot be tiled with hexagons alone. Euler's formula leaves no choice:
// exactly twelve cells have five neighbours and every other cell has six, so a world
// built this way has twelve pentagons and they are not a defect to be hidden.
//
// Everything is deterministic from (seed, subdivisions). A cell's position is a pure
// function of those two numbers, so no name, index or coordinate needs to be stored
// and no consumer has to be sent the geometry.
//
// Checked in tests/hexasphere.test.mjs: the cell count, the twelve pentagons, the
// adjacency, the exact tiling (adjacent cells share corners and the facing cells
// cover the disk once), the campsite, the spring, and the walk budget.

import { REGIONS, region, TILE_M } from './terrain.mjs';

export const GEO_VERSION_SPHERE = 2;
export const CELL_M = TILE_M;

// Icosahedron: the twelve corners a hex planet is built around.
const PHI = (1 + Math.sqrt(5)) / 2;
const ICO_V = [
  [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
  [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
  [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
].map(v => normalize(v));
const ICO_F = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
  [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
  [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
];

function normalize(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** The plane tangent to the sphere at a point, used to sort things around a cell. */
function tangent(n) {
  const up = Math.abs(n[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = normalize(cross(up, n));
  return { u, v: normalize(cross(n, u)) };
}
/** A direction on the planet, in degrees: 0 is north, 90 is east. */
function bearingFrom(n, p) {
  const { u, v } = tangent(n);
  return (Math.atan2(dot(p, u), dot(p, v)) * 180 / Math.PI + 360) % 360;
}

/**
 * Subdivide each icosahedron face into n^2 triangles, carrying every new point out
 * onto the sphere. Returns 10n^2 + 2 vertices and 20n^2 triangles.
 */
function subdivide(n) {
  const verts = [];
  const index = new Map();
  const at = (i, j, k, A, B, C) => {
    const x = (i * A[0] + j * B[0] + k * C[0]) / n;
    const y = (i * A[1] + j * B[1] + k * C[1]) / n;
    const z = (i * A[2] + j * B[2] + k * C[2]) / n;
    const key = `${Math.round(x * 1e8)},${Math.round(y * 1e8)},${Math.round(z * 1e8)}`;
    let v = index.get(key);
    if (v === undefined) { v = verts.push(normalize([x, y, z])) - 1; index.set(key, v); }
    return v;
  };
  const faces = [];
  for (const [A, B, C] of ICO_F.map(f => f.map(i => ICO_V[i]))) {
    const id = [];
    for (let i = 0; i <= n; i++) {
      id[i] = [];
      for (let j = 0; j <= n - i; j++) id[i][j] = at(i, j, n - i - j, A, B, C);
    }
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n - i; j++) {
        faces.push([id[i][j], id[i + 1][j], id[i][j + 1]]);
        if (j < n - i - 1) faces.push([id[i + 1][j], id[i + 1][j + 1], id[i][j + 1]]);
      }
    }
  }
  return { verts, faces };
}

/**
 * A cell's own ground. Its corners are the centres of the triangles that touch it.
 * Edge midpoints look like they would do, and do not: the three midpoint corners of
 * a triangle leave its middle quarter owned by nobody, so a quarter of the planet
 * falls out of the map and a click between two cells belongs to neither.
 */
function ringFor(cell, verts) {
  const { u, v } = tangent(cell.p);
  const angle = p => Math.atan2(dot(p, v), dot(p, u));
  return {
    ring: cell.next.slice().sort((a, b) => angle(verts[a]) - angle(verts[b])),
    corners: cell.triangleCentres.slice().sort((a, b) => angle(a) - angle(b)),
  };
}

export function createPlanet({ seed = 2049, subdivisions = 14 } = {}) {
  const n = Math.max(1, Math.round(subdivisions));
  const { verts, faces } = subdivide(n);

  const neighbours = verts.map(() => new Set());
  const triangleCentres = verts.map(() => []);
  for (const [a, b, c] of faces) {
    const centre = normalize([
      (verts[a][0] + verts[b][0] + verts[c][0]) / 3,
      (verts[a][1] + verts[b][1] + verts[c][1]) / 3,
      (verts[a][2] + verts[b][2] + verts[c][2]) / 3,
    ]);
    for (const [i, j, k] of [[a, b, c], [b, a, c], [c, a, b]]) {
      neighbours[i].add(j); neighbours[i].add(k);
      triangleCentres[i].push(centre);
    }
  }

  const cells = verts.map((p, i) => ({
    id: i,
    p,
    lat: Math.asin(p[1]) * 180 / Math.PI,
    lon: Math.atan2(p[2], p[0]) * 180 / Math.PI,
    next: [...neighbours[i]].sort((a, b) => a - b),
    triangleCentres: triangleCentres[i],
  }));
  for (const c of cells) {
    const { ring, corners } = ringFor(c, verts);
    c.ring = ring;                    // neighbours, in order around the cell
    c.corners = corners;              // the polygon's corners, in the same order
    c.centre = normalize(corners.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]));
  }

  const planet = {
    version: GEO_VERSION_SPHERE,
    seed,
    subdivisions: n,
    cellM: CELL_M,
    regions: REGIONS.map(r => ({ id: r.id, name: r.name, color: r.color })),
    cells,
    neighbours: cells.map(c => c.next),
    pentagons: cells.filter(c => c.next.length === 5).map(c => c.id),
    triangles: faces,
  };
  // Geometry and nothing else. A client rebuilds the planet from here: ids, corners,
  // centres, adjacency. It deliberately has no `regionId` and no reserves, because
  // land is state and state comes from the payload. Shaping it here as well would
  // hand a client a planet that looks right and is not.
  return planet;
}

/**
 * The whole world, composed in one call: geometry, then land, then the camp, then the
 * spring. Anything that needs a world rather than a shape wants this, because the two
 * steps after `shapePlanet` move cells: the spring rewrites the region and the
 * reserves of four of them. A caller that runs `createPlanet` and `shapePlanet` and
 * stops has a planet with no camp and a spring with no water in it, and nothing about
 * it looks wrong until someone walks to the water.
 */
export function worldPlanet({ seed = 2049, subdivisions = 14 } = {}) {
  const planet = shapePlanet(createPlanet({ seed, subdivisions }));
  const camp = campsite(planet);
  const spring = springFor(planet, camp);
  planet.camp = camp;
  planet.spring = spring;
  return planet;
}

// --- land --------------------------------------------------------------------
// The noise is sampled at the cell's position in space, so there is no meridian to
// wrap and no rectangle edge to hide: two cells that touch in space get near values,
// wherever they are. The regions and their reserves are the ones terrain.mjs has
// always declared.

function hash3(x, y, z, seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2246822519) ^ Math.imul(seed | 0, 362437);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const smooth = t => t * t * (3 - 2 * t);
function noise3(p, seed, scale) {
  const x = p[0] * scale, y = p[1] * scale, z = p[2] * scale;
  const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
  const tx = smooth(x - x0), ty = smooth(y - y0), tz = smooth(z - z0);
  let acc = 0;
  for (let dz = 0; dz <= 1; dz++) for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) {
    acc += (dx ? tx : 1 - tx) * (dy ? ty : 1 - ty) * (dz ? tz : 1 - tz) * hash3(x0 + dx, y0 + dy, z0 + dz, seed);
  }
  return acc;
}
const reliefAt = (p, seed) => noise3(p, seed, 2.1) * 0.66 + noise3(p, seed + 977, 4.4) * 0.34;

/** Tell each cell what it is made of. Deterministic, and every reserve is finite. */
export function shapePlanet(planet) {
  const seed = planet.seed;
  for (const c of planet.cells) {
    const p = c.p;
    const land = reliefAt(p, seed);
    const cold = Math.abs(p[1]);                        // the poles are bare rock
    let id;
    if (land < 0.44) id = 'sea';
    else {
      const coastal = c.next.some(j => reliefAt(planet.cells[j].p, seed) < 0.44);
      const rocky = cold > 0.62 || noise3(p, seed + 313, 5.0) > 0.62;
      id = cold > 0.82 ? 'rock' : coastal ? 'coast' : rocky ? 'rock' : land > 0.55 ? 'scrub' : 'interior';
    }
    c.regionId = id;
    const r = region(id);
    const jitter = 0.55 + noise3(p, seed + 55, 7.0) * 0.9;
    c.water = Math.round(r.water * jitter);
    c.soil = Math.round(r.soil * jitter);
    c.material = Math.round(r.material * jitter);
    c.potable = Math.round(c.water * r.drink);
    c.food = Math.round(r.food * jitter);
  }
  indexSubstances(planet);
  return planet;
}

/** Where the drinkable water and the forageable food are. The places are fixed; what
 *  is left in them is not. Same shape as `terrain.springs` / `terrain.forage`. */
export function indexSubstances(planet) {
  planet.springs = [];
  planet.forage = [];
  for (const c of planet.cells) {
    if (c.potable > 0) planet.springs.push(c.id);
    if (c.food > 0) planet.forage.push(c.id);
  }
  planet.land = planet.cells.filter(c => c.regionId !== 'sea').length;
  return planet;
}

// --- walking -----------------------------------------------------------------

/**
 * Steps between two cells, over neighbours. This replaces `Math.hypot` over integer
 * coordinates: on a planet the honest measure of how far away something is is how
 * many cells you have to cross to stand on it, and it is the same on a pentagon.
 */
export function cellDistance(planet, from, to, cap = 512) {
  if (from === to) return 0;
  const seen = new Set([from]);
  let ring = [from];
  for (let d = 1; d <= cap; d++) {
    const next = [];
    for (const i of ring) for (const j of planet.neighbours[i]) {
      if (seen.has(j)) continue;
      if (j === to) return d;
      seen.add(j);
      next.push(j);
    }
    if (!next.length) break;
    ring = next;
  }
  return Infinity;
}

/** Every cell within `steps` of one cell, nearest first. A hex ball, not a box. */
export function cellsWithin(planet, from, steps) {
  const seen = new Map([[from, 0]]);
  let ring = [from];
  for (let d = 1; d <= steps; d++) {
    const next = [];
    for (const i of ring) for (const j of planet.neighbours[i]) {
      if (seen.has(j)) continue;
      seen.set(j, d);
      next.push(j);
    }
    if (!next.length) break;
    ring = next;
  }
  return seen;
}

/** The land only, so a walk is planned on ground someone can stand on. */
const walkable = (planet, id) => planet.cells[id].regionId !== 'sea';

/**
 * Where the five people land. A coastal cell with drinkable water within a short
 * walk and land around it: the rectangle's starting conditions, chosen by the seed
 * instead of by hand. No hand placed coordinates survive on a planet; this is the
 * replacement for `START`.
 */
export function campsite(planet, reach = 3) {
  const candidates = planet.cells
    .filter(c => c.regionId === 'coast')
    .map(c => {
      const near = cellsWithin(planet, c.id, reach);
      let springs = 0;
      for (const [id] of near) if (id !== c.id && planet.cells[id].potable > 0) springs++;
      return { id: c.id, springs, landRing: c.next.filter(j => walkable(planet, j)).length };
    })
    .filter(c => c.springs > 0 && c.landRing >= 4);
  if (!candidates.length) return planet.cells.find(c => walkable(planet, c.id))?.id ?? 0;
  candidates.sort((a, b) => b.springs - a.springs || b.landRing - a.landRing || a.id - b.id);
  return candidates[0].id;
}

/**
 * The spring: the only water anyone can see when they arrive.
 *
 * In the rectangle this was four tiles at a fixed offset from camp. The offset and
 * the 2x2 shape are both gone. What is kept is what the four tiles were for: it is
 * three steps from camp, so it is inside sight; it is drinkable; and it is four
 * cells, because one body to a tile means five people cannot drink from one cell.
 * The shape is a wedge pointing away from camp, so the near edge faces home.
 */
export const SPRING = Object.freeze({ bearingDeg: 60, steps: 3, spread: 3, water: 190, potable: 180, food: 3000 });

export function springFor(planet, camp, { bearingDeg = SPRING.bearingDeg, steps = SPRING.steps, spread = SPRING.spread } = {}) {
  const from = planet.cells[camp].centre;
  const atStep = [];
  for (const [id, d] of cellsWithin(planet, camp, steps)) if (d === steps) atStep.push(id);
  if (!atStep.length) return null;
  // The cell three steps out, nearest the bearing, land, and the lowest id on a tie.
  let at = null, best = Infinity;
  for (const id of atStep.sort((a, b) => a - b)) {
    if (!walkable(planet, id)) continue;
    const p = planet.cells[id].centre;
    const off = Math.abs(((bearingFrom(from, p) - bearingDeg + 540) % 360) - 180);
    if (off < best) { best = off; at = id; }
  }
  if (at === null) return null;

  const cell = planet.cells[at];
  // The wedge: the cell, plus the cells on the far side of it from camp.
  const { u, v } = tangent(cell.centre);
  const away = [cell.centre[0] + (cell.centre[0] - from[0]), cell.centre[1] + (cell.centre[1] - from[1]), cell.centre[2] + (cell.centre[2] - from[2])];
  const outward = ((Math.atan2(dot(away, v), dot(away, u)) * 180 / Math.PI) + 360) % 360;
  const ring = cell.ring
    .map(id => ({ id, off: Math.abs(((bearingFrom(cell.centre, planet.cells[id].centre) - outward + 540) % 360) - 180) }))
    .filter(x => walkable(planet, x.id))
    .sort((a, b) => a.off - b.off || a.id - b.id);
  const members = [at, ...ring.slice(0, Math.max(0, spread)).map(x => x.id)];

  for (const id of members) {
    const t = planet.cells[id];
    t.regionId = 'scrub';
    t.water = SPRING.water;
    t.potable = SPRING.potable;
    t.soil = 14;
    t.material = 6;
    t.food = Math.max(t.food, SPRING.food);
  }
  indexSubstances(planet);
  return { at, cells: members, bearing: bearingDeg, steps };
}

/**
 * The landmasses, largest first. A rectangle's edge was a wall you could see coming;
 * on a planet the land ends in water, and land you cannot walk to is land nobody can
 * reach. Islands of a cell or two are inert until there are boats, which is exactly
 * what design/islands-and-boats.md reserved them for, so the rule people and camps
 * need is: stay on the landmass the camp is on, and never place anyone on a piece of
 * land the camp cannot walk to.
 */
export function landmasses(planet) {
  const seen = new Set();
  const found = [];
  for (const c of planet.cells) {
    if (c.regionId === 'sea' || seen.has(c.id)) continue;
    const members = [];
    const stack = [c.id];
    seen.add(c.id);
    while (stack.length) {
      const i = stack.pop();
      members.push(i);
      for (const j of planet.neighbours[i]) {
        if (planet.cells[j].regionId === 'sea' || seen.has(j)) continue;
        seen.add(j);
        stack.push(j);
      }
    }
    found.push({ cells: members, size: members.length });
  }
  found.sort((a, b) => b.size - a.size || a.cells[0] - b.cells[0]);
  return found;
}

/** Which landmass a cell is on, or null at sea. */
export function landmassOf(planet, id) {
  if (planet.cells[id].regionId === 'sea') return null;
  const seen = new Set([id]);
  const stack = [id];
  const members = [];
  while (stack.length) {
    const i = stack.pop();
    members.push(i);
    for (const j of planet.neighbours[i]) {
      if (planet.cells[j].regionId === 'sea' || seen.has(j)) continue;
      seen.add(j);
      stack.push(j);
    }
  }
  return { cells: members.sort((a, b) => a - b), size: members.length };
}

/** How far someone will walk, how much of the world an author may claim, and how far
 * they can see.
 *
 * These stay in metres, which is the honest unit: a person walks 8 m a step, so
 * reach is 192 m of walking for water and an author's writ is 128 m of ground. What
 * the value is a *share* of is the ground the camp can actually reach, and that is
 * measured here rather than assumed, because the comparison that made these numbers
 * look dangerous used the wrong denominator.
 *
 * The rectangle's own shares, measured from camp over land rather than corner to
 * corner: the camp sits at (13,21) of a 48x40 grid with 514 land tiles, its furthest
 * land is 31 steps, so `reachTiles: 24` was 77% of that and `16 steps of camp` 52%.
 * Measured against the grid's full 86 step diagonal they read as 28% and 19%, but
 * nobody ever walked the diagonal across the sea.
 *
 * A level 14 planet has 1,124 land cells where the rectangle had 514, and its far
 * end is 73 steps from camp rather than 31. So the same 24 and 16 become 33% and 22%:
 * the world more than doubled and the legs did not. That is the honest reading of
 * keeping metres, and it is what makes a planet feel like one. At level 32 (span 167)
 * the shares are 14% and 10%. If the wanted behaviour is instead "always reach most
 * of the home region whatever the level", pass shares of the measured span.
 */
export function budgetFor(planet, camp, { sight = 6, reach = 24, writ = 16 } = {}) {
  // One walk out from camp over land, keeping the furthest step reached. Measured
  // rather than assumed, and never a distance per cell: at level 32 that was ten
  // thousand separate searches for one number.
  let span = 0;
  const seen = new Set([camp]);
  let ring = [camp];
  while (ring.length) {
    const next = [];
    for (const i of ring) for (const j of planet.neighbours[i]) {
      if (seen.has(j) || !walkable(planet, j)) continue;
      seen.add(j);
      next.push(j);
    }
    if (!next.length) break;
    span++;
    ring = next;
  }
  const reachable = reach > span ? span : reach;          // a small world has nowhere further to walk
  const writable = writ > reachable ? reachable : writ;
  return {
    span,
    sight,
    reach: reachable,
    writ: writable,
    reachShare: span ? reachable / span : 1,
    writShare: span ? writable / span : 1,
  };
}

/** What a planet of this many cells actually is, in metres, if one cell is one tile. */
export function scaleOf(planet, cellM = CELL_M) {
  const perCell = (3 * Math.sqrt(3) / 2) * (cellM / Math.sqrt(3)) ** 2;
  const area = perCell * planet.cells.length;
  const radius = Math.sqrt(area / (4 * Math.PI));
  return { cells: planet.cells.length, cellM, areaKm2: area / 1e6, radiusM: radius, acrossM: radius * 2 };
}
