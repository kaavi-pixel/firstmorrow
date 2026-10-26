// The world.
//
// Reality, not a feature. Five mortal people, one immortal author, finite land,
// real weather, and permanent outcomes. Nothing in this file is authored by a
// model, and nothing in it may be changed by one.

import { createTerrain, terrainAt, region, START, OASIS } from '../public/terrain.mjs';
import { RULES, massOf, applyDeclarations } from './validate.mjs';
import { createWeather, advanceWeather, weatherOn, stormEffect, WEATHER } from './weather.mjs';

export const MINUTES_PER_DAY = 1440;
export const dayIndex = S => Math.floor(S.minute / MINUTES_PER_DAY);
export const minuteOfDay = S => S.minute % MINUTES_PER_DAY;
export const hourOfDay = S => minuteOfDay(S) / 60;

// The five. From v1: names, colours, and what each of them wants out of a life.
export const PEOPLE = Object.freeze([
  { id: 'p0', name: 'Ada', color: '#c58b5e', hair: '#574130', age: 31, values: ['Pro-natal', 'Communitarian'], wish: 'I want a place where raising a family is a choice I can afford.' },
  { id: 'p1', name: 'Ren', color: '#81987f', hair: '#303a35', age: 27, values: ['Anti-natal', 'Autonomy-first'], wish: 'A quiet, independent life. Do not make parenthood the price of belonging.' },
  { id: 'p2', name: 'Mika', color: '#bdad77', hair: '#574638', age: 44, values: ['Utilitarian', 'Egalitarian'], wish: 'A good average is not enough if someone is still going hungry.' },
  { id: 'p3', name: 'Sol', color: '#7e9ea5', hair: '#4c3529', age: 35, values: ['Ecocentric', 'Long-termist'], wish: 'Make something that can keep living without exhausting the land.' },
  { id: 'p4', name: 'Ivo', color: '#ac8587', hair: '#424443', age: 22, values: ['Autonomy-first', 'Creative'], wish: 'Give me tools, room to experiment, and the freedom to be different.' },
]);

// The authors. They do not eat, age, sicken or die. They write code.
export const AUTHORS = Object.freeze([
  { id: 'a0', name: 'Sonnet', provider: 'perplexity', model: 'anthropic/claude-sonnet-5-5', color: '#5fa8c4' },
]);

const NAMES_POOL = ['Ora', 'Bram', 'Lise', 'Teo', 'Nell', 'Kai', 'Juno', 'Fenn', 'Maud', 'Rook'];
const HAIR = ['#574130', '#303a35', '#574638', '#4c3529', '#424443', '#6b5240'];
const SKIN_HUES = ['#c58b5e', '#81987f', '#bdad77', '#7e9ea5', '#ac8587'];

export function createWorld({ seed = 2049, now = Date.now(), reserveDays = 4 } = {}) {
  const terrain = createTerrain(seed);
  const S = {
    version: 1, seed, startedAt: now, minute: 0,
    terrain,
    camp: { x: START.x, y: START.y, stock: { water: 0, food: 0, material: 0, soil: 0 } },
    people: [], authors: [], structures: [], log: [], graveyard: [],
    weather: createWeather(seed),
    births: 0, deaths: 0, storms: 0,
  };
  // They arrive with supplies: enough to think, not enough to survive on.
  S.camp.stock.water = Math.round(RULES.waterPerPersonDay * PEOPLE.length * reserveDays);
  S.camp.stock.food = Math.round(RULES.foodPerPersonDay * PEOPLE.length * reserveDays);
  S.camp.stock.material = 40;
  S.camp.stock.soil = 12;

  S.people = PEOPLE.map(p => ({
    ...p, kind: 'person', x: START.x, y: START.y, alive: true, health: 100,
    age: p.age, bornAt: -Math.round(p.age * 365 * MINUTES_PER_DAY),
    pack: { water: 0, food: 0, material: 0, soil: 0 },
    labor: { day: -1, used: 0 }, resting: false, say: null, saidAt: -1,
    starving: 0, pregnant: null, children: 0, cause: null,
  }));
  S.authors = AUTHORS.map(a => ({
    ...a, kind: 'author', x: START.x, y: START.y - 1, alive: true,
    labor: { day: -1, used: 0 }, say: null, saidAt: -1, calls: 0, lastProgram: null,
  }));
  S.log.push({ t: 0, kind: 'arrive', text: 'Five people arrive on bare land with four days of supplies.' });
  advanceWeather(S.weather, 0);
  return S;
}

export const living = S => S.people.filter(p => p.alive);
export const atCamp = (S, p) => p.x === S.camp.x && p.y === S.camp.y;

// Shelter that actually stands, within reach of a tile.
export function shelterAt(S, x, y) {
  let best = 0;
  for (const s of S.structures) {
    if (!s.built || !s.shelter) continue;
    if (Math.abs(s.x - x) <= WEATHER.shelterRadius && Math.abs(s.y - y) <= WEATHER.shelterRadius) best = Math.max(best, s.shelter);
  }
  return best;
}

export function shelterCount(S) {
  return S.structures.filter(s => s.built && s.shelter).reduce((t, s) => t + s.shelter, 0);
}

function kill(S, person, cause) {
  person.alive = false;
  person.health = 0;
  person.cause = cause;
  person.diedAt = S.minute;
  S.deaths++;
  S.graveyard.push({ id: person.id, name: person.name, at: S.minute, cause });
  S.log.push({ t: S.minute, kind: 'death', text: `${person.name} died — ${cause}.` });
}

export const adult = p => p.age >= 16;

/** The day boundary: weather, ageing, deaths of age, births. */
function newDay(S, day) {
  advanceWeather(S.weather, day);
  const w = weatherOn(S.weather, day);
  for (const p of S.people) {
    if (!p.alive) continue;
    p.labor = { day, used: 0 };
    p.age += 1 / WEATHER.yearDays;
    // Age takes people. The chance is small and rises steeply after sixty.
    if (p.age > 58) {
      let h = Math.imul(day | 0, 2246822519) ^ Math.imul(S.people.indexOf(p) + 7, 3266489917);
      h = Math.imul(h ^ (h >>> 15), 668265263);
      const r = ((h ^ (h >>> 13)) >>> 0) / 4294967296;
      const risk = Math.pow((p.age - 58) / 26, 2.4);
      if (r < risk) kill(S, p, `old age (${Math.floor(p.age)})`);
    }
  }
  // Births. Two living adults in decent health, food in store, then a long wait.
  const fertile = living(S).filter(p => p.age >= 18 && p.age <= 45 && p.health >= 70);
  const foodDays = S.camp.stock.food / (RULES.foodPerPersonDay * Math.max(1, living(S).length));
  const expecting = living(S).filter(p => p.pregnant);
  for (const p of living(S)) {
    if (p.pregnant) {
      if (day >= p.pregnant.due) {
        const parent = living(S).length >= 1;
        if (parent && foodDays > 1) {
          const child = {
            id: `c${S.births + 1}`, kind: 'person',
            name: NAMES_POOL[(S.births + S.seed) % NAMES_POOL.length],
            color: SKIN_HUES[(S.births + 2) % SKIN_HUES.length],
            hair: HAIR[(S.births + 1) % HAIR.length],
            values: ['Born here'], wish: 'unknown yet',
            x: p.x, y: p.y, alive: true, health: 100, age: 0, bornAt: S.minute,
            pack: { water: 0, food: 0, material: 0, soil: 0 },
            labor: { day, used: 0 }, resting: false, say: null, saidAt: -1,
            starving: 0, pregnant: null, children: 0, parentId: p.id, cause: null,
          };
          S.people.push(child);
          p.children++;
          S.births++;
          p.pregnant = null;
          S.log.push({ t: S.minute, kind: 'birth', text: `${child.name} was born to ${p.name}.` });
        } else {
          p.pregnant = null;
          S.log.push({ t: S.minute, kind: 'loss', text: `${p.name} lost the child — there was not enough food.` });
        }
      }
      continue;
    }
    if (expecting.length) continue;
    if (fertile.length < 2 || p.health < 70 || p.age < 18 || p.age > 45) continue;
    if (foodDays < 2) continue;
    let h = Math.imul(day | 0, 40503) ^ Math.imul(S.people.indexOf(p) + 3, 2654435761);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    const r = ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    if (r < 0.012) {
      p.pregnant = { since: day, due: day + 270 };
      S.log.push({ t: S.minute, kind: 'birth', text: `${p.name} is expecting. Nine months, if there is food.` });
    }
  }
  if (w.storm) S.log.push({ t: S.minute, kind: 'forecast', text: `Day ${day}: ${w.season}, ${w.tempC}°C. A storm is coming.` });
}

/** A storm resolves once, at its hour on its day. */
function resolveStorm(S, storm) {
  S.storms++;
  S.log.push({ t: S.minute, kind: 'storm', text: `The storm hit. ${Math.round(storm.severity * 100)}% severity.` });
  for (const s of [...S.structures]) {
    const effect = stormEffect(storm, s);
    if (!effect || effect.survived) continue;
    if (effect.destroyed) {
      S.structures.splice(S.structures.indexOf(s), 1);
      S.log.push({ t: S.minute, kind: 'destroyed', text: `${s.name} was destroyed. ${s.mass} kg of material is gone.` });
    } else {
      const lost = s.progressHours;
      s.progressHours = Math.max(0, s.progressHours - Math.max(6, s.laborHours * 0.5));
      s.damaged = true;
      S.log.push({ t: S.minute, kind: 'damaged', text: `${s.name} was damaged (${lost.toFixed(0)} hours of work lost).` });
    }
  }
  // Anyone out in it, and not under a roof, pays for it.
  for (const p of living(S)) {
    if (shelterAt(S, p.x, p.y) > 0) continue;
    const t = terrainAt(S.terrain, p.x, p.y);
    const exposure = region(t?.regionId)?.exposure ?? 1;
    const hours = 3; // a storm passes through
    p.health = Math.max(0, p.health - WEATHER.exposureDamagePerHour * hours * exposure);
    S.log.push({ t: S.minute, kind: 'injury', text: `${p.name} was caught in the open.` });
    if (p.health <= 0) kill(S, p, 'exposure in a storm');
  }
}

/**
 * Advance the world. One call = a number of simulation minutes.
 * `onProgram` is called once per author per day with the world, so the caller
 * can fetch or install authored code. It never runs inside the sandbox itself.
 */
export function advance(S, minutes, { onProgram = null, run = null } = {}) {
  let stormsDone = new Set();
  for (let i = 0; i < minutes; i++) {
    S.minute++;
    const day = dayIndex(S);
    if (minuteOfDay(S) === 0) {
      newDay(S, day);
      if (onProgram) {
        for (const a of S.authors) {
          try { onProgram(S, a, day); } catch (e) { S.log.push({ t: S.minute, kind: 'reject', text: `${a.name}'s work failed: ${e.message}` }); }
        }
      }
      if (run) runStructures(S, day, { run });
    }
    // Storm.
    const w = weatherOn(S.weather, day);
    if (w.storm && !stormsDone.has(day) && hourOfDay(S) >= w.storm.hour) { stormsDone.add(day); resolveStorm(S, w.storm); }

    // Survival, minute by minute. Nobody is exempt.
    const needW = RULES.waterPerPersonDay / MINUTES_PER_DAY;
    const needF = RULES.foodPerPersonDay / MINUTES_PER_DAY;
    for (const p of living(S)) {
      const store = atCamp(S, p) ? S.camp.stock : p.pack;
      const gotW = Math.min(store.water || 0, needW);
      const gotF = Math.min(store.food || 0, needF);
      store.water = Math.max(0, (store.water || 0) - gotW);
      store.food = Math.max(0, (store.food || 0) - gotF);
      const shortfall = (needW - gotW) / needW + (needF - gotF) / needF;
      if (shortfall > 0) {
        p.starving = Math.min(1, p.starving + shortfall / MINUTES_PER_DAY);
        p.health = Math.max(0, p.health - (RULES.healthPerDayUnmet / MINUTES_PER_DAY) * shortfall);
        if (p.health <= 0) kill(S, p, shortfall > 1.4 ? 'thirst' : 'hunger');
      } else {
        p.starving = Math.max(0, p.starving - 1 / MINUTES_PER_DAY);
        // Recovery needs food, water and a roof over a body that is not worn out.
        const sheltered = shelterAt(S, p.x, p.y) > 0;
        p.health = Math.min(100, p.health + ((sheltered ? 0.9 : 0.5) / MINUTES_PER_DAY));
      }
    }
  }
  return S;
}

/** Every standing structure runs the code its author wrote for it, once a day. */
export function runStructures(S, day, { run = null } = {}) {
  if (!run) return;
  for (const s of S.structures) {
    if (!s.built || !s.program) continue;
    const actor = s.proxy || (s.proxy = {
      id: s.id, name: s.name, kind: 'structure', x: s.x, y: s.y,
      alive: true, health: 100, pack: { water: 0, food: 0, material: 0, soil: 0 },
      labor: { day, used: 0 }, authorId: s.authorId, say: null,
    });
    actor.labor = { day, used: RULES.laborHoursPerDay };
    try {
      const decl = run(s.program, { day, structure: { id: s.id, name: s.name, x: s.x, y: s.y, shelter: s.shelter } });
      applyDeclarations(S, actor, decl);
    } catch (e) {
      S.log.push({ t: S.minute, kind: 'reject', text: `${s.name} failed: ${e.message}` });
      s.failures = (s.failures || 0) + 1;
    }
  }
}

export function summarise(S) {
  const alive = living(S);
  return {
    alive: alive.length,
    dead: S.deaths,
    born: S.births,
    reserveWaterDays: +(S.camp.stock.water / (RULES.waterPerPersonDay * Math.max(1, alive.length))).toFixed(1),
    reserveFoodDays: +(S.camp.stock.food / (RULES.foodPerPersonDay * Math.max(1, alive.length))).toFixed(1),
    meanHealth: alive.length ? Math.round(alive.reduce((t, p) => t + p.health, 0) / alive.length) : 0,
    shelter: shelterCount(S),
    structures: S.structures.length,
    storms: S.storms,
    tempC: weatherOn(S.weather, dayIndex(S)).tempC,
    season: weatherOn(S.weather, dayIndex(S)).season,
  };
}
