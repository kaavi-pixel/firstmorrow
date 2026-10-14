// Versioned, finite scenario geography. Scores are authored scenario parameters,
// not physical resource stocks. Existing settlement coordinates never move.
export const GEO_VERSION = 1;
export const TILE_M = 8;
export const LEGACY_BOUNDS = Object.freeze({ minX: 0, minY: 0, maxX: 21, maxY: 21 });
export const BOUNDS = Object.freeze({ minX: -10, minY: -8, maxX: 62, maxY: 54 });
export const SIGHT_TILES = 13;
export const CLEAR_WINDOW_MINUTES = 360;
export const START = Object.freeze({ x: 11, y: 11 });
const copy = v => JSON.parse(JSON.stringify(v));
const pointKey = p => `${p.x},${p.y}`;
const inside = (p, b) => p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;
export const integerPoint = p => p && Number.isInteger(p.x) && Number.isInteger(p.y);
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// These dimensions compete: high water/soil/materials and low exposure/effort
// are useful in different ways. Values do not grant extractable resources.
export const REGIONS = Object.freeze([
  { id: 'interior', label: 'Arid interior', color: '#cba370',
    properties: { freshwater: 1, soil: 1, materials: 5, heatExposure: 5, travelEffort: 1 } },
  { id: 'western-ridge', label: 'Western ridge', color: '#ad9472',
    properties: { freshwater: 2, soil: 1, materials: 4, heatExposure: 2, travelEffort: 4 } },
  { id: 'eastern-coast', label: 'Eastern coast', color: '#9aaa81',
    properties: { freshwater: 4, soil: 4, materials: 1, heatExposure: 2, travelEffort: 2 } },
  { id: 'southern-plain', label: 'Southern plain', color: '#b8b583',
    properties: { freshwater: 2, soil: 5, materials: 2, heatExposure: 3, travelEffort: 1 } },
  { id: 'near-island', label: 'Near island', color: '#aeb28a',
    properties: { freshwater: 1, soil: 2, materials: 3, heatExposure: 1, travelEffort: 2 } },
  { id: 'outer-island', label: 'Outer island', color: '#90a48a',
    properties: { freshwater: 3, soil: 3, materials: 2, heatExposure: 2, travelEffort: 3 } },
  { id: 'south-island', label: 'Southern island', color: '#7f9980',
    properties: { freshwater: 5, soil: 4, materials: 2, heatExposure: 1, travelEffort: 4 } }
]);

export function createGeography(seed = 2049) {
  if (!Number.isInteger(seed)) throw new Error('Geography seed must be an integer.');
  return {
    version: GEO_VERSION, seed, bounds: { ...BOUNDS }, tileM: TILE_M,
    regions: copy(REGIONS),
    mainland: { minX: -10, minY: -8, maxX: 29, maxY: 29 },
    islands: [
      { id: 'near-island', bounds: { minX: 36, minY: 12, maxX: 40, maxY: 17 },
        landing: { x: 36, y: 14 }, lookouts: [{ x: 40, y: 16 }] },
      { id: 'outer-island', bounds: { minX: 47, minY: 18, maxX: 51, maxY: 22 },
        landing: { x: 47, y: 19 }, lookouts: [{ x: 51, y: 22 }] },
      { id: 'south-island', bounds: { minX: 45, minY: 32, maxX: 60, maxY: 50 },
        landing: { x: 51, y: 32 }, lookouts: [{ x: 51, y: 32 }] }
    ],
    mainlandLookouts: [{ x: 29, y: 14 }],
    islandsEnabled: false
  };
}

export function terrainAt(g, x, y) {
  const p = { x, y };
  if (!g || g.version !== GEO_VERSION) throw new Error('Unsupported geography version.');
  if (!integerPoint(p) || !inside(p, g.bounds)) return null;
  if (inside(p, g.mainland)) {
    const regionId = inside(p, LEGACY_BOUNDS) ? 'interior'
      : x > 21 ? 'eastern-coast' : x < 0 ? 'western-ridge'
        : y > 21 ? 'southern-plain' : 'interior';
    return { x, y, kind: 'land', landmass: 'mainland', regionId };
  }
  const island = g.islands.find(i => inside(p, i.bounds));
  return island ? { x, y, kind: 'land', landmass: island.id, regionId: island.id }
    : { x, y, kind: 'sea', landmass: null, regionId: null };
}

export function findLandRoute(g, from, to, { maxSteps = 5000 } = {}) {
  if (!integerPoint(from) || !integerPoint(to)) throw new Error('Invalid route coordinates.');
  const a = terrainAt(g, from.x, from.y), b = terrainAt(g, to.x, to.y);
  if (a?.kind !== 'land' || b?.kind !== 'land' || a.landmass !== b.landmass) return null;
  if (a.landmass !== 'mainland' && !g.islandsEnabled) return null;
  const q = [{ ...from }], prior = new Map([[pointKey(from), null]]);
  for (let n = 0; n < q.length && n < maxSteps; n++) {
    const p = q[n];
    if (pointKey(p) === pointKey(to)) {
      const path = [];
      for (let at = p; at; at = prior.get(pointKey(at))) path.push(at);
      return path.reverse();
    }
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const next = { x: p.x + dx, y: p.y + dy }, key = pointKey(next);
      const t = terrainAt(g, next.x, next.y);
      if (!prior.has(key) && t?.kind === 'land' && t.landmass === a.landmass) {
        prior.set(key, p); q.push(next);
      }
    }
  }
  return null;
}

// A deliberately simple bounded scenario: each six-hour period starts with
// a three-hour clear interval. This is not a meteorological climate model.
export function visibilityAt(absoluteMinute) {
  const minute = ((Math.floor(absoluteMinute) % CLEAR_WINDOW_MINUTES) + CLEAR_WINDOW_MINUTES) % CLEAR_WINDOW_MINUTES;
  return { clear: minute < 180, maxSightTiles: minute < 180 ? SIGHT_TILES : 4 };
}

function coastline(g, island) {
  const b = island.bounds, out = [];
  for (let y = b.minY; y <= b.maxY; y++) for (let x = b.minX; x <= b.maxX; x++) {
    if (x === b.minX || x === b.maxX || y === b.minY || y === b.maxY) out.push({ x, y });
  }
  return out;
}
function clearRay(g, from, target, targetId) {
  const origin = terrainAt(g, from.x, from.y)?.landmass;
  const steps = Math.ceil(distance(from, target) * 4);
  for (let i = 1; i < steps; i++) {
    const t = terrainAt(g, Math.round(from.x + (target.x - from.x) * i / steps),
      Math.round(from.y + (target.y - from.y) * i / steps));
    if (t?.kind === 'land' && t.landmass !== origin && t.landmass !== targetId) return false;
  }
  return true;
}
export function visibleIslands(g, from, absoluteMinute, { includeDisabled = false } = {}) {
  if (!integerPoint(from) || (!g.islandsEnabled && !includeDisabled)) return [];
  const range = visibilityAt(absoluteMinute).maxSightTiles;
  return g.islands.filter(i => i.id !== terrainAt(g, from.x, from.y)?.landmass).flatMap(i => {
    const target = coastline(g, i).sort((a, b) => distance(from, a) - distance(from, b))
      .find(p => distance(from, p) <= range && clearRay(g, from, p, i.id));
    if (!target) return [];
    return [{ id: i.id, bearingDegrees: (Math.atan2(target.x - from.x, -(target.y - from.y)) * 180 / Math.PI + 360) % 360,
      distanceTiles: Math.round(distance(from, target)), silhouette: 'distant land' }];
  });
}

export function validateIslandDiscovery(g) {
  const enabled = { ...g, islandsEnabled: true }, edges = [], errors = [];
  for (const [id, lookouts, landing] of [
    ['mainland', g.mainlandLookouts, START],
    ...g.islands.map(i => [i.id, i.lookouts, i.landing])
  ]) {
    for (const p of lookouts) {
      if (!findLandRoute(enabled, landing, p)) {
        errors.push(`Unreachable lookout on ${id}`); continue;
      }
      for (const sight of visibleIslands(enabled, p, 0)) edges.push({ from: id, to: sight.id, lookout: p });
    }
  }
  const reached = new Set(['mainland']);
  for (let changed = true; changed;) {
    changed = false;
    for (const e of edges) if (reached.has(e.from) && !reached.has(e.to)) { reached.add(e.to); changed = true; }
  }
  for (const island of g.islands) {
    if (!reached.has(island.id)) errors.push(`Island ${island.id} has no discovery chain`);
    if (terrainAt(g, island.landing.x, island.landing.y)?.landmass !== island.id)
      errors.push(`Invalid landing on ${island.id}`);
    if (![[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy]) =>
      terrainAt(g,island.landing.x+dx,island.landing.y+dy)?.kind === 'sea'))
      errors.push(`Landing on ${island.id} is not coastal`);
  }
  // Scan all mainland tiles, not just curated lookouts, to prove hidden islands.
  const direct = new Set();
  for (let y = g.mainland.minY; y <= g.mainland.maxY; y++)
    for (let x = g.mainland.minX; x <= g.mainland.maxX; x++)
      for (const s of visibleIslands(enabled, { x, y }, 0)) direct.add(s.id);
  if (!direct.size) errors.push('No mainland-visible island');
  if (g.islands.every(i => direct.has(i.id))) errors.push('No island-only discovery');
  return { valid: !errors.length, errors, edges, reached: [...reached], mainlandVisible: [...direct] };
}

export function migrateGeography(world, { enabled = false } = {}) {
  if (!enabled) return world;
  if (world.geography) {
    if (world.geography.version !== GEO_VERSION) throw new Error('Unsupported geography version; migration required.');
    return world;
  }
  const next = copy(world);
  next.geography = createGeography(world.seed);
  next.exploration = {
    version: 1, positions: Object.fromEntries(world.inhabitants.map(p => [p.id, { ...START }])),
    knowledge: Object.fromEntries(world.inhabitants.map(p => [p.id, { tiles: {}, islands: {} }])),
    journeys: {}, sequences: {},
    packs: Object.fromEntries(world.inhabitants.map(p => [p.id, { water: 0, food: 0, materials: 0 }]))
  };
  next.extensionMigration = { version: 1, atDay: world.day, atMinute: world.minute };
  return next;
}
