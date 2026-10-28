// The observer half, in the browser: what the client rebuilds, what a click means, and
// what a card is made of.
//
//  1. Geometry is a function of (seed, subdivisions) and comes from hexasphere.mjs. The
//     client calls `createPlanet` and never `shapePlanet`: everything state decides —
//     which region a cell is, where the camp is, which four cells are the spring —
//     arrives in the payload. Geometry from the module, authority from the payload.
//  2. A click is a cell. On the rectangle a click reversed a list of screen rectangles
//     and bare ground *closed* the card; on a sphere the ground is the thing there is to
//     know about, so clicking it opens one. Empty sky at the limb closes it.
//  3. Reserves are not in the poll. One cell at a time, on the click that asks.

import { createPlanet } from './hexasphere.mjs';

/** The module's geometry with the payload's state laid over it, in the shape the
 *  renderer and the cards both read: `tiles` keyed by cell id, the camp, the spring. */
export function geographyFromPayload(g) {
  if (!g || !Number.isInteger(g.seed) || !Number.isInteger(g.subdivisions)) return null;
  const planet = createPlanet({ seed: g.seed, subdivisions: g.subdivisions });
  const ids = g.regions.map(r => r.id);
  const idx = g.cellRegions;
  if (!Array.isArray(idx) || idx.length !== planet.cells.length) return null;
  const tiles = new Map();
  for (let i = 0; i < planet.cells.length; i++) {
    planet.cells[i].regionId = ids[idx[i]];
    tiles.set(i, { id: i, regionId: ids[idx[i]] });
  }
  planet.camp = g.camp;
  planet.spring = Array.isArray(g.spring) ? g.spring.slice() : [];
  return {
    version: g.version, seed: g.seed, subdivisions: g.subdivisions,
    tileM: g.tileM ?? 8, cellM: g.cellM ?? g.tileM ?? 8,
    regions: g.regions, regionIds: g.regionIds || ids,
    camp: g.camp, spring: planet.spring, tiles, planet,
    terrainAt: at => tiles.get(at) || null,
    regionOf: at => tiles.get(at)?.regionId || null,
  };
}

/**
 * Where the camera is: one cell, or null for the sky at the limb. The pick is exact —
 * nearest centre in the clicked direction *is* the cell containing the point — but near
 * the limb the nearest centre can be one that has just gone over the horizon, and the
 * camera must not name ground nobody can see.
 */
export function pickCell(view, sx, sy) {
  const id = view.pick(sx, sy);
  if (!Number.isInteger(id)) return null;
  const spun = view.spun?.[id];
  if (spun && spun[2] <= 0) return null;
  return id;
}

/** The ring under a picked cell: six corners, five at the twelve pentagons. */
export function cellRing(view, id) {
  return Number.isInteger(id) ? view.cellRing(id) : null;
}

/** The part of a cell's card the poll already carries: no reserves, honestly null. */
export function cellCardLocal(geo, id, { people = [], structures = [] } = {}) {
  const c = geo?.planet?.cells?.[id];
  if (!c) return null;
  const inCamp = Number.isInteger(geo.camp) && (id === geo.camp || geo.planet.cells[geo.camp].next.includes(id));
  return {
    id, regionId: c.regionId, camp: id === geo.camp, inCamp,
    pentagon: c.next.length === 5, neighbours: c.next.slice(),
    lat: +c.lat.toFixed(3), lon: +c.lon.toFixed(3),
    reserves: null,
    standing: structures.filter(s => s.at === id),
    people: people.filter(p => p.at === id),
  };
}

/** The one request a click makes. */
export async function cardFor(id, { fetchImpl = globalThis.fetch } = {}) {
  const res = await fetchImpl(`/api/cell?id=${encodeURIComponent(id)}`, { headers: { accept: 'application/json' } });
  if (!res.ok) return null;
  const body = await res.json();
  return body.cell || null;
}
