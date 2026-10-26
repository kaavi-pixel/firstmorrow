// Land for Firstmorrow v2.
//
// Deterministic from a seed: one arid continent with contrasting regions and a
// finite reserve of water, soil and material in every tile. Nothing is hand
// placed, nothing is replenished. Sea surrounds the continent and the south-east
// is reserved for the later island work (design/islands-and-boats.md) — reserved,
// not implemented.

export const TILE_M = 8;
export const GEO_VERSION = 1;
export const BOUNDS = Object.freeze({ minX: 0, minY: 0, maxX: 47, maxY: 39 });
export const START = Object.freeze({ x: 13, y: 21 });
// A visible spring three tiles from camp: finite, drinkable, and the only water
// anyone can see when they arrive.
export const OASIS = Object.freeze({ x: START.x + 3, y: START.y - 2 });

// Regions differ across several dimensions and no region leads in all of them.
// `drink` is the fraction of a tile's water reserve that is potable. `food` is
// what can be foraged by hand: scrub and bush country feeds people, bare rock
// does not. It is finite, like everything else here.
export const REGIONS = Object.freeze([
  { id: 'sea', name: 'Sea', color: '#41637a', water: 0, soil: 0, material: 0, exposure: 1, drink: 0, food: 0, walk: false },
  { id: 'coast', name: 'Coast', color: '#bfae80', water: 95, soil: 24, material: 14, exposure: 0.45, drink: 0.5, food: 2500, walk: true },
  { id: 'scrub', name: 'Scrub', color: '#b99f6d', water: 36, soil: 12, material: 38, exposure: 0.72, drink: 0.35, food: 5000, walk: true },
  { id: 'interior', name: 'Interior', color: '#d5b07e', water: 7, soil: 3, material: 80, exposure: 1, drink: 0, food: 400, walk: true },
  { id: 'rock', name: 'Rock', color: '#a39684', water: 4, soil: 1, material: 280, exposure: 0.86, drink: 0, food: 80, walk: true },
]);

const regionById = new Map(REGIONS.map(r => [r.id, r]));
export const region = id => regionById.get(id);

function hash(x, y, seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const smooth = t => t * t * (3 - 2 * t);
function noise(x, y, seed, scale) {
  const fx = x / scale, fy = y / scale, x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = smooth(fx - x0), ty = smooth(fy - y0);
  const a = hash(x0, y0, seed), b = hash(x0 + 1, y0, seed);
  const c = hash(x0, y0 + 1, seed), d = hash(x0 + 1, y0 + 1, seed);
  return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
}

export function createTerrain(seed = 2049) {
  const tiles = new Map();
  const key = (x, y) => y * 128 + x;
  const cx = 19, cy = 20, R = 21;

  // Pass 1: land or sea.
  const coarse = new Map();
  for (let y = BOUNDS.minY; y <= BOUNDS.maxY; y++) {
    for (let x = BOUNDS.minX; x <= BOUNDS.maxX; x++) {
      const d = Math.hypot((x - cx) / R, ((y - cy) / (R * 1.05)));
      const n = noise(x, y, seed, 9) * 0.72 + noise(x, y, seed + 977, 4) * 0.28;
      coarse.set(key(x, y), { x, y, land: (1 - d) * 1.15 + (n - 0.5) * 0.95 > 0.46 });
    }
  }
  // Pass 2: classify land, then shade reserves with local noise.
  for (const c of coarse.values()) {
    const k = key(c.x, c.y);
    if (!c.land) { tiles.set(k, { x: c.x, y: c.y, regionId: 'sea', water: 0, soil: 0, material: 0, potable: 0 }); continue; }
    let coastal = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = coarse.get(key(c.x + dx, c.y + dy));
      if (!n || !n.land) { coastal = true; break; }
    }
    let id;
    if (coastal) id = 'coast';
    else {
      const south = (c.y - BOUNDS.minY) / (BOUNDS.maxY - BOUNDS.minY);
      const n = noise(c.x, c.y, seed + 313, 6);
      const rocky = n + south * 0.45 > 0.86;
      id = rocky ? 'rock' : n > 0.45 ? 'scrub' : 'interior';
    }
    const r = region(id);
    const jitter = 0.55 + noise(c.x, c.y, seed + 55, 3) * 0.9;
    const water = Math.round(r.water * jitter);
    tiles.set(k, {
      x: c.x, y: c.y, regionId: id,
      water, soil: Math.round(r.soil * jitter), material: Math.round(r.material * jitter),
      potable: Math.round(water * r.drink),
      food: Math.round(r.food * jitter),
    });
  }

  // Decoration. Deterministic, off by default on sea and on the camp tile.
  const features = [];
  for (const t of tiles.values()) {
    if (t.regionId === 'sea') continue;
    if (t.x === START.x && t.y === START.y) continue;
    const n = hash(t.x, t.y, seed + 4111);
    if (n > 0.9) features.push([t.x, t.y, t.regionId === 'rock' ? 'rock' : 'dune']);
    else if (n > 0.84) { features.push([t.x, t.y, 'bush']); t.food += 3500; }   // a bush is worth foraging
  }

  // The spring near camp: four tiles of standing water, finite like everything else.
  for (const [dx, dy] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
    const t = tiles.get(key(OASIS.x + dx, OASIS.y + dy));
    if (t) { t.regionId = 'scrub'; t.water = 190; t.potable = 180; t.soil = 14; t.material = 6; t.food = Math.max(t.food, 3000); }
  }

  // Every tile that can be drunk from at the start. The list of places is fixed;
  // what is left in them is not. Same for anything worth eating.
  const springs = [], forage = [];
  for (const t of tiles.values()) {
    if (t.potable > 0) springs.push({ x: t.x, y: t.y });
    if (t.food > 0) forage.push({ x: t.x, y: t.y });
  }

  return {
    version: GEO_VERSION, seed, tileM: TILE_M,
    bounds: BOUNDS,
    mainland: BOUNDS,
    regions: REGIONS.map(r => ({ id: r.id, name: r.name, color: r.color })),
    features,
    springs,
    forage,
    oasis: { ...OASIS },
    tiles,
  };
}

const NO_TILE = { regionId: 'sea', water: 0, soil: 0, material: 0, potable: 0, food: 0, unknown: true };

/**
 * Worlds saved before wild food existed have no `food` on their tiles, so the
 * people would starve on land that now ought to feed them. Give every tile its
 * reserve once and rebuild the forage index. Tiles that already carry food are
 * left exactly as they are: a stripped hillside must not quietly refill.
 */
export function addWildFood(g) {
  if (!g || !(g.tiles instanceof Map) || g.tiles.size === 0) return g;
  for (const t of g.tiles.values()) if (typeof t.food === 'number') return g;   // already done
  const seed = g.seed ?? 2049;
  const key = (x, y) => y * 128 + x;
  for (const t of g.tiles.values()) {
    const r = region(t.regionId);
    const jitter = 0.55 + noise(t.x, t.y, seed + 55, 3) * 0.9;
    let food = Math.round((r?.food || 0) * jitter);
    if (t.regionId !== 'sea' && !(t.x === START.x && t.y === START.y)) {
      const n = hash(t.x, t.y, seed + 4111);
      if (n > 0.84 && n <= 0.9) food += 3500;                                    // the same bush as always
    }
    t.food = food;
  }
  for (const [dx, dy] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
    const t = g.tiles.get(key(OASIS.x + dx, OASIS.y + dy));
    if (t) t.food = Math.max(t.food || 0, 3000);
  }
  g.forage = [];
  for (const t of g.tiles.values()) if (t.food > 0) g.forage.push({ x: t.x, y: t.y });
  return g;
}

export function terrainAt(g, x, y) {
  if (!g || !Number.isInteger(x) || !Number.isInteger(y)) return null;
  if (x < g.bounds.minX || y < g.bounds.minY || x > g.bounds.maxX || y > g.bounds.maxY) return null;
  return g.tiles.get(y * 128 + x) || NO_TILE;
}
export const walkable = (g, x, y) => !!terrainAt(g, x, y) && region(terrainAt(g, x, y).regionId).walk;
