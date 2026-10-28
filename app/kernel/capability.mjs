// What an author is allowed to know.
//
// An author is not omniscient and not omnipresent. It sees the camp it was
// assigned to, the ground within survey range of it, and the people living
// there. It does not see the whole map, another author's code, or anything a
// person has not been near. Most importantly it is handed the boundary: the
// rules of reality it may work inside but never change.

import { terrainAt, region, cellsWithin } from '../public/terrain.mjs';
import { RULES, SUBSTANCES, waterNeedL } from './validate.mjs';
import { living, shelterCount, dayIndex, minuteOfDay, hourOfDay } from './world.mjs';
import { weatherOn, WEATHER } from './weather.mjs';

const SURVEY_TILES = 14;

/** The boundary, written out for the author. This is the interface to reality. */
export function rulesBrief() {
  return [
    'REALITY — fixed, and not yours to change. Work inside it.',
    'You are not alone here. Other authors share this world and this channel. Work with them.',
    'The world is a planet of hexagonal cells, not a grid. There is no x and no y: a place is a cell id, and a structure is proposed at one with { at: id }. A cell has six neighbours, or five on one of the twelve pentagons, and every distance here is counted in steps over those neighbours. You are shown the cells around camp and their ids in "observed".',
    `Matter is finite. Water, soil and material are drawn from a cell and never return: ${SUBSTANCES.join(', ')}.`,
    'Nothing comes from nothing. Every process is mass-checked: output mass may never exceed input mass.',
    `Bodies: a person needs ${RULES.waterDrinkLDay} L of drinking water a day at 20 C, and more in the heat — about ${waterNeedL(40).toFixed(1)} L at 40 C. And ${RULES.foodPerPersonDay} kcal a day. A person can carry ${RULES.carryKg} kg.`,
    `Water is the fast killer: without it, about ${RULES.daysToDieWithoutWater} days. Food is the slow one: about ${RULES.daysToDieWithoutFood} days. Children under five and people over sixty go first.`,
    `Work: ${RULES.laborHoursPerDay} person-hours per person per day — as long as they are awake, and the camp sleeps ${RULES.sleepHoursPerDay} hours of the twenty-four. Less for anyone weakened or starving. Construction costs ${RULES.buildHoursPerKg} person-hours per kg. You cannot shorten that by declaring it.`,
    `A finished structure you own may run a process: at most ${RULES.maxKgPerLaborHour} kg per labour hour. A garden yields ${RULES.soilToFoodKg} kg of food per kg of soil. A still beside the sea yields ${RULES.stillLitersPerLaborHour} L of fresh water per labour hour.`,
    `A process must declare its hours: return { labor: hours, make: { ... } }. A structure holds no more of anything than its own mass, and the hours you declare bound what it may make in the day it is given.`,
    'You may only make water in a structure that stands beside the sea, and food only out of soil you have brought to it.',
    'The land itself feeds them, a little. Scrub and coast carry edible plants a person can gather by hand, and they will walk for it when hungry. It is finite: the ground near camp is stripped bare within a season or two. Wild food buys time. It does not keep them alive.',
    `Weather is real and destructive. Storms destroy what is not built to stand: roughly ${WEATHER.stormMassPerSeverity} kg of structure per point of severity. Anyone caught in the open loses health.`,
    'The people act for themselves — they will walk to water they can see, gather food when the larder is low, drink and eat before they build, and take cover from a storm. They cannot invent, build or plan. That is your work.',
    `People age, and die of it. They can conceive and bear children, but only while they are healthy and there is food.`,
    'There is no rescue. No free materials, no repair, no rollback, no bringing back the dead.',
    `You may design only within ${RULES.writTiles} cells of camp. The camp is the camp cell and the six beside it, and they have to stay clear.`,
    'You may build anything reality permits. You may change nothing about reality.',
  ].join('\n');
}

/** What a structure's own code is allowed to see when it runs. */
export function structureEnv(S, s) {
  const day = dayIndex(S);
  const w = weatherOn(S.weather, day);
  const t = terrainAt(S.terrain, s.at);
  return {
    day,
    time: { hour: +hourOfDay(S).toFixed(1), season: w.season, tempC: w.tempC, stormToday: !!w.storm, stormSeverity: w.storm?.severity ?? 0 },
    structure: { id: s.id, name: s.name, at: s.at, shelter: s.shelter || 0 },
    here: { at: s.at, region: t?.regionId, water: t?.potable || 0, food: t?.food || 0, soil: t?.soil || 0, material: t?.material || 0 },
    camp: {
      stock: { ...S.camp.stock },
      people: living(S).map(p => ({
        name: p.name, age: Math.floor(p.age), health: Math.round(p.health),
        thirst: +(p.thirst || 0).toFixed(2), starving: +(p.starving || 0).toFixed(2),
      })),
      shelterPlaces: shelterCount(S),
    },
  };
}

export function authorView(S, authorId) {
  const a = S.authors.find(x => x.id === authorId);
  if (!a) return null;
  const day = dayIndex(S);
  const w = weatherOn(S.weather, day);
  const camp = S.camp;

  // Survey: the ground around camp, as the author has actually walked it. On a
  // planet this is a hex ball of cells rather than a square of coordinates, and it
  // comes out of the walk itself, so it can never be a shape the world is not.
  const observed = [];
  for (const [at, d] of cellsWithin(S.terrain, camp.at, SURVEY_TILES)) {
    const t = terrainAt(S.terrain, at);
    if (!t) continue;
    observed.push({ at, steps: d, region: t.regionId, water: t.potable || 0, food: t.food || 0, soil: t.soil || 0, material: t.material || 0 });
  }

  return {
    self: { id: a.id, name: a.name, model: a.model, role: a.role, immortal: true },
    allies: S.authors.filter(x => x.id !== a.id).map(x => ({ id: x.id, name: x.name, model: x.model, role: x.role })),
    council: (S.council || []).slice(-24).map(m => ({ from: m.name, at: m.t, said: m.text })),
    time: { day, minuteOfDay: minuteOfDay(S), hour: +hourOfDay(S).toFixed(1), season: w.season, tempC: w.tempC, stormToday: !!w.storm, stormSeverity: w.storm?.severity ?? 0 },
    camp: {
      at: camp.at,
      stock: { ...camp.stock },
      shelterPlaces: shelterCount(S),
      people: living(S).map(p => ({
        id: p.id, name: p.name, age: Math.floor(p.age), health: Math.round(p.health),
        starving: +(p.starving || 0).toFixed(2), thirst: +(p.thirst || 0).toFixed(2),
        pregnant: !!p.pregnant, children: p.children, values: p.values,
        activity: p.activity || null,
      })),
    },
    standing: S.structures.map(s => ({ id: s.id, name: s.name, at: s.at, mass: s.mass, shelter: s.shelter, built: s.built, progressHours: s.progressHours, laborHours: s.laborHours, authorId: s.authorId, program: s.program || null })),
    observed,
    dead: S.graveyard.map(g => ({ name: g.name, at: g.at, cause: g.cause })),
    boundary: rulesBrief(),
  };
}
