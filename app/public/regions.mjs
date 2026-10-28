// What a piece of ground is, before anything stands on it.
//
// Regions and their reserves live here rather than in terrain.mjs because two
// different worlds read them: the rectangle shapes land from them, and the planet
// needs TILE_M at module scope, before any terrain exists. A module that reads a
// constant at load time cannot import it from a module that builds a world, so the
// constants sit below both and neither has to know about the other's load order.
//
// This file knows nothing about x, y, tiles or cells. It is shapes of ground.

export const TILE_M = 8;

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
