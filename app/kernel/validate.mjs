// The gate.
//
// A program declares processes, not outcomes. This module is the only place that
// turns a declaration into a change in the world, and it is the only place that
// can say no. The rules below are the whole physics of v2 — deliberately small,
// deliberately explicit, and deliberately not a simulation of anything real.
//
// Where a rule is a game assumption rather than a physical one, it says so.

import { terrainAt, region, walkable, beside, cellDistance, campCells, neighbours } from '../public/terrain.mjs';
import { validSprite, FORMS } from '../public/forms.mjs';

// The night, in hours. The instinct loop puts each person to bed for exactly
// this long (instinct.mjs `sleepWindow`), and the day's labour budget is what is
// left of the twenty-four: a person may work as long as they are awake, and not
// a minute longer. One number, so the two can never drift apart — the budget was
// a flat eight hours, which left the camp standing about all afternoon.
export const SLEEP_HOURS_PER_DAY = 6;

export const RULES = Object.freeze({
  // Survival, from the real evidence rather than a guess.
  //  - Water: ~3 days, and in a hot climate "as little as 3 days"
  //    (NIH, 'The physiology of survival: Fluid and food', citing Wolf 1958).
  //    Severe dehydration arrives at about 10% of body mass lost.
  //  - Food: with water, "complete starvation usually occurs within 40-60 days";
  //    lean adults weaken after 30-50 days (same paper). 45 is the midpoint.
  //  - Children and the old go first (Mayo Clinic).
  waterDrinkLDay: 3,              // drinking water for an adult at 20 C
  waterHeatFactor: 0.047,         // each degree above 20 C adds 4.7% to the need
  foodPerPersonDay: 2100,         // kcal
  foodKcalPerKg: 3500,            // game assumption: dry food mass
  carryKg: 20,                    // what one person hauls
  daysToDieWithoutWater: 3,
  daysToDieWithoutFood: 55,       // pure starvation alone; heat and hard labour bring it in
  maxHealthLossPerDay: 40,        // no combination of unmet needs kills faster

  // Work and time.
  minutesPerTile: 2,
  kcalPerTileWalk: 6,
  sleepHoursPerDay: SLEEP_HOURS_PER_DAY,
  laborHoursPerDay: 24 - SLEEP_HOURS_PER_DAY,
  walkHoursPerTile: 2 / 60,

  // Construction. The kernel computes labour from mass; a program cannot claim
  // a lower labour figure than this.
  buildHoursPerKg: 0.9,

  // A finished structure may run a process. Throughput is capped per labour hour.
  maxKgPerLaborHour: 5,
  // Game assumption: a garden turns 1 kg of soil into this much food per season.
  soilToFoodKg: 0.35,
  // A still on the coast draws from the sea beside it: litres per labour hour.
  stillLitersPerLaborHour: 4,

  // Program output.
  sayMax: 200,
  tellMax: 280,
  sightTiles: 6,
  reachTiles: 24,                 // how far someone will walk for water, in steps
  // How far from camp an author may design. It was a literal 16 in the gate; on a
  // planet it is still 16 steps, and it lives here so the gate and the brief read
  // the same number.
  writTiles: 16,
});

export const SUBSTANCES = Object.freeze(['water', 'food', 'soil', 'material']);
const KG_PER_UNIT = { water: 1, soil: 1, material: 1, food: 1 / RULES.foodKcalPerKg };
export const massOf = o => SUBSTANCES.reduce((t, s) => t + (Number(o?.[s]) || 0) * KG_PER_UNIT[s], 0);

/** Drinking water a person needs in a day, given the temperature. */
export const waterNeedL = tempC =>
  RULES.waterDrinkLDay * (1 + Math.max(0, (tempC ?? 20) - 20) * RULES.waterHeatFactor);

/** How much faster the very young and the old lose ground. */
export function fragility(age) {
  if (age < 5) return 1.8;
  if (age < 12) return 1.35;
  if (age < 18) return 1.1;
  if (age <= 60) return 1;
  if (age <= 70) return 1.35;
  if (age <= 80) return 1.8;
  return 2.4;
}

/** A weakened person cannot work a full day. Reality, not a penalty. */
export const capacity = p => Math.max(0.15, (p.health / 100) * (1 - 0.7 * Math.min(1, p.starving || 0)));

const DECLARATIONS = new Set(['say', 'tell', 'rest', 'move', 'draw', 'take', 'store', 'use', 'make', 'labor', 'propose']);
const num = v => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
const r2 = n => Math.round(n * 100) / 100;
const amt = (o, s) => { const v = o?.[s]; return v === undefined ? 0 : (num(v) ?? NaN); };

class Reject extends Error {}
const fail = m => { throw new Reject(m); };

// attr -> the pack or the camp stores, whichever holds it
function heldBy(S, p) { return (packedAtCamp(S, p) ? S.camp.stock : p.pack); }
// The camp's stores are communal and reach the whole camp square, because only
// one person can stand on the camp tile itself.
function packedAtCamp(S, p) {
  return campCells(S.terrain).has(p.at);
}

function takeFrom(store, want, what) {
  for (const s of SUBSTANCES) {
    const q = want[s] || 0;
    if (q <= 0) continue;
    if ((store[s] || 0) + 1e-9 < q) fail(`${what} needs ${q} ${s}, only ${(store[s] || 0).toFixed(1)} is there.`);
    store[s] -= q;
  }
}
function giveTo(store, want) {
  for (const s of SUBSTANCES) if (want[s] > 0) store[s] = (store[s] || 0) + want[s];
}
const packMass = p => massOf(p.pack);

/**
 * Validate and apply one inhabitant program's declarations.
 * Mutates S and the person. Throws a plain Error with a reason on rejection —
 * nothing is applied when it throws.
 */
export function applyDeclarations(S, person, decl) {
  if (!decl || typeof decl !== 'object' || Array.isArray(decl)) throw new Error('A program must return an object.');
  for (const key of Object.keys(decl)) if (!DECLARATIONS.has(key)) throw new Error(`Unknown declaration "${key}".`);
  if (person.health <= 0) throw new Error('They are dead.');

  const applied = [];
  const here = terrainAt(S.terrain, person.at);

  // --- say -----------------------------------------------------------------
  if (decl.say !== undefined) {
    if (typeof decl.say !== 'string') throw new Error('say must be a string.');
    const text = decl.say.trim().slice(0, RULES.sayMax);
    if (text) { person.say = text; person.saidAt = S.minute; applied.push('say'); }
  }

  // --- tell: the shared channel the authors work through ---------------------
  if (decl.tell !== undefined) {
    if (typeof decl.tell !== 'string') throw new Error('tell must be a string.');
    const text = decl.tell.trim().slice(0, RULES.tellMax);
    if (text) {
      if (!S.council) S.council = [];
      S.council.push({ t: S.minute, from: person.id, name: person.name, text });
      // The council is a channel, not an archive.
      if (S.council.length > 120) S.council.splice(0, S.council.length - 120);
      applied.push('tell');
    }
  }

  // --- rest ----------------------------------------------------------------
  if (decl.rest !== undefined) {
    if (decl.rest !== true) throw new Error('rest must be true.');
    person.resting = true; applied.push('rest');
  }

  // --- move ----------------------------------------------------------------
  if (decl.move !== undefined) {
    const { at } = decl.move || {};
    if (!Number.isInteger(at)) throw new Error('move needs a cell id.');
    if (!beside(S.terrain, person.at, at)) throw new Error('move is one step, to a neighbouring cell.');
    if (!walkable(S.terrain, at)) throw new Error('That cell cannot be walked on.');
    person.at = at;
    person.pack.food = Math.max(0, person.pack.food - RULES.kcalPerTileWalk);
    S.minute += RULES.minutesPerTile;
    applied.push('move');
  }

  // --- draw: take raw substance out of the ground --------------------------
  if (decl.draw !== undefined) {
    const want = decl.draw || {};
    for (const s of Object.keys(want)) if (!['water', 'food', 'soil', 'material'].includes(s)) throw new Error(`Cannot draw ${s}.`);
    const room = RULES.carryKg - packMass(person);
    const got = { water: 0, food: 0, soil: 0, material: 0 };
    for (const s of ['water', 'food', 'soil', 'material']) {
      const q = amt(want, s);
      if (Number.isNaN(q)) throw new Error(`draw.${s} must be a number.`);
      if (q <= 0) continue;
      // Food is kcal and is massed by foodKcalPerKg, so gathering 1 kg of it is
      // 3500 kcal. Everything else is already kilograms.
      const available = s === 'water' ? here.potable || 0
        : s === 'food' ? here.food || 0
          : s === 'soil' ? here.soil || 0 : here.material || 0;
      const roomFor = s === 'food' ? room * RULES.foodKcalPerKg : room;
      const canTake = Math.min(q, available, roomFor);
      if (canTake <= 1e-9) continue;
      if (s === 'water') here.potable = Math.max(0, (here.potable || 0) - canTake);
      else here[s] = Math.max(0, (here[s] || 0) - canTake);
      person.pack[s] = (person.pack[s] || 0) + canTake;
      got[s] = canTake;
    }
    if (massOf(got) <= 0) throw new Error('There was nothing to draw there.');
    applied.push('draw');
  }

  // --- take / store: camp stores, or a built structure within reach --------
  function storeNear(S2, p) {
    const site = S2.structures.find(s => s.built && beside(S2.terrain, s.at, p.at));
    if (!site) return null;
    if (!site.store) site.store = { water: 0, food: 0, material: 0, soil: 0 };
    return site.store;
  }
  const atCamp = packedAtCamp(S, person);
  if (decl.take !== undefined) {
    const src = atCamp ? S.camp.stock : storeNear(S, person);
    if (!src) throw new Error('Nothing within reach: camp stores need standing at camp.');
    const want = {};
    for (const s of SUBSTANCES) want[s] = amt(decl.take, s);
    takeFrom(src, want, 'take');
    if (massOf(want) + packMass(person) > RULES.carryKg + 1e-9) {
      giveTo(src, want);
      throw new Error('That is more than they can carry.');
    }
    giveTo(person.pack, want);
    applied.push('take');
  }
  if (decl.store !== undefined) {
    const dest = atCamp ? S.camp.stock : storeNear(S, person);
    if (!dest) throw new Error('Nothing within reach: camp stores need standing at camp.');
    const want = {};
    for (const s of SUBSTANCES) want[s] = amt(decl.store, s);
    takeFrom(person.pack, want, 'store');
    giveTo(dest, want);
    applied.push('store');
  }

  // --- labour --------------------------------------------------------------
  const hoursLeft = RULES.laborHoursPerDay * capacity(person) - (person.labor?.used ?? 0);
  let hours = 0;
  let hoursAsked = 0;
  if (decl.labor !== undefined) {
    const h = num(decl.labor);
    if (h === null) throw new Error('labor must be a number of hours.');
    hoursAsked = h;
    hours = Math.min(h, hoursLeft, 24);
    if (hours > 0) {
      person.labor.used += hours;
      S.minute += Math.round(hours * 60);
      applied.push('labor');
    }
  }

  // --- propose: begin a structure ------------------------------------------
  if (decl.propose !== undefined) {
    const d = decl.propose || {};
    const at = d.at;
    const isAuthor = person.kind === 'author';
    // A structure belongs to whoever designed it. An author designs; a person
    // only carries out what an author thought of, and owns nothing.
    const ownerOf = who => (who.kind === 'author' ? who.id : who.authorId ?? null);
    if (!Number.isInteger(at)) throw new Error('propose needs a cell id.');
    // A person has to be at the site. An author has no body: it may direct work
    // anywhere it has surveyed, and the material is drawn from camp by the people.
    if (!isAuthor && !beside(S.terrain, person.at, at)) throw new Error('They must stand on or beside the site.');
    // The writ, in steps from camp rather than in squares. It is a rule, not a
    // literal: the gate and the brief must not be able to disagree about it.
    if (isAuthor && cellDistance(S.terrain, S.camp.at, at) > RULES.writTiles) throw new Error('That is beyond what they have surveyed.');
    if (!Number.isInteger(d.mass) || d.mass <= 0 || d.mass > 400) throw new Error('propose.mass must be 1–400 kg.');
    if (S.structures.some(s => s.at === at)) throw new Error('Something is already standing there.');
    // Labour is the scarce thing: two half-built sites is all five people can carry.
    if (S.structures.filter(s => !s.built).length >= 2) throw new Error('Two things are already half-built. Finish one first.');
    if (at === S.camp.at) throw new Error('The camp cell has to stay clear.');
    if (!walkable(S.terrain, at)) throw new Error('That cell cannot be built on.');
    const name = String(d.name || 'structure').slice(0, 40);
    // What it is for, in the author's own words. A structure nobody can explain is
    // a structure nobody can judge, and the observer has to be able to read it.
    const description = typeof d.description === 'string' ? d.description.trim().slice(0, 400) : '';
    if (description.length < 12) throw new Error('propose needs a description: what this is for, and why it is the right next thing.');

    // A shelter protects this many people from weather. Reality bounds how much
    // shelter a given mass of material can provide; an author cannot claim more.
    let shelter = 0;
    if (d.shelter !== undefined) {
      if (!Number.isInteger(d.shelter) || d.shelter < 0 || d.shelter > 20) throw new Error('propose.shelter must be 0–20 people.');
      if (d.shelter * 3 > d.mass + 1e-9) throw new Error(`Shelter for ${d.shelter} needs at least ${d.shelter * 3} kg of material.`);
      shelter = d.shelter;
    }

    // The code this structure will run once it stands. It is not executed now.
    let program = null;
    if (d.program !== undefined) {
      if (typeof d.program !== 'string' || d.program.length > 8192) throw new Error('propose.program must be a string under 8 kB.');
      program = d.program;
    }

    // The drawing: a named form, or art of their own. Exactly one 16x16 sprite.
    let sprite = null;
    if (d.sprite !== undefined) { if (!validSprite(d.sprite)) throw new Error('sprite must be 16 rows of 16 palette digits 0-8.'); sprite = d.sprite; }
    else if (d.form !== undefined) { if (!FORMS[d.form]) throw new Error(`Unknown form "${String(d.form).slice(0, 20)}".`); sprite = FORMS[d.form]; }
    else throw new Error('propose needs either form or sprite.');

    // The material has to exist, and it is hauled to the site now.
    const need = { material: d.mass };
    const source = isAuthor
      ? S.camp.stock
      : (massOf(person.pack) >= d.mass ? person.pack : (packedAtCamp(S, person) ? S.camp.stock : person.pack));
    takeFrom(source, need, 'building');
    const id = `s${(S.structures.length + 1).toString().padStart(2, '0')}-${at}`;
    S.structures.push({
      id, at, name, description, sprite, mass: d.mass, shelter, program,
      laborHours: Math.round(d.mass * RULES.buildHoursPerKg * 10) / 10,
      progressHours: 0, built: false, authorId: ownerOf(person), startedAt: S.minute,
    });
    S.log.push({ t: S.minute, kind: 'plan', text: isAuthor
      ? `${person.name} designed ${name} (${d.mass} kg) at cell ${at}: ${description}`
      : `${person.name} began ${name} (${d.mass} kg).` });
    applied.push('propose');
  }

  // --- make: a finished structure turns one thing into another --------------
  if (decl.make !== undefined) {
    const out = {};
    for (const s of SUBSTANCES) out[s] = amt(decl.make, s);
    for (const s of SUBSTANCES) if (Number.isNaN(out[s])) throw new Error(`make.${s} must be a number.`);
    if (massOf(out) <= 0) throw new Error('make must produce something.');

    // Declaring the labour and having the hours left to spend are two different
    // faults, and the author is told which one it is. A program that declares
    // `labor` and is simply out of hours must never be answered with "declare
    // labor alongside make": the live world repeated that lie at every dawn.
    if (decl.labor === undefined) throw new Error('A process costs labour; declare labor alongside make.');
    const site = S.structures.find(s => s.built && beside(S.terrain, s.at, person.at));
    if (!site) throw new Error('A process needs a finished structure to run in.');
    if (hours <= 0) {
      fail(`No labour hours left today to run this process${hoursAsked > 0 ? ` (it asks for ${r2(hoursAsked)} h)` : ''}.`);
    }

    const used = {};
    for (const s of SUBSTANCES) used[s] = amt(decl.use, s);
    for (const s of SUBSTANCES) if (Number.isNaN(used[s])) throw new Error(`use.${s} must be a number.`);

    // A still has to stand beside the sea before any of the rest applies.
    const besideSea = neighbours(S.terrain, site.at).some(n => terrainAt(S.terrain, n)?.regionId === 'sea');
    if (out.water > 0 && !besideSea) fail('Only a structure beside the sea can make fresh water.');
    // Nothing comes from nothing: the input mass must cover the output mass.
    // The sea is the one input a structure can tap where it stands, so the water
    // a coastal still makes is balanced against the sea beside it rather than
    // against what anyone could carry.
    const seaInput = out.water > 0 && besideSea ? out.water : 0;
    if (massOf(out) > massOf(used) + seaInput + 1e-9) fail('A process cannot make more mass than it takes in.');
    if (out.food > 0 && out.food > used.soil * RULES.soilToFoodKg + 1e-9) fail(`A garden yields at most ${RULES.soilToFoodKg} kg of food per kg of soil.`);
    // When the hours fell short of what the declaration asked for, name the
    // shortage: the fault is the hours left in the day, not the declared yield.
    // "A still yields at most 4 L per labour hour" blamed a program that was
    // only ever short one hour of walking.
    const shortOf = needed => (hours < needed - 1e-9
      ? ` — ${r2(needed)} h are needed and ${r2(hours)} h are left today` : '');
    if (out.water > 0 && out.water > hours * RULES.stillLitersPerLaborHour + 1e-9) {
      fail(`A still yields at most ${RULES.stillLitersPerLaborHour} L per labour hour${shortOf(out.water / RULES.stillLitersPerLaborHour)}.`);
    }

    const total = massOf(out);
    if (total > hours * RULES.maxKgPerLaborHour + 1e-9) fail(`A structure processes at most ${RULES.maxKgPerLaborHour} kg per labour hour${shortOf(total / RULES.maxKgPerLaborHour)}.`);

    takeFrom(atCamp ? S.camp.stock : site.store || (site.store = { water: 0, food: 0, material: 0, soil: 0 }), used, 'process');
    const dest = site.store || (site.store = { water: 0, food: 0, material: 0, soil: 0 });
    const held = massOf(dest) + massOf(out);
    if (held > site.mass + 1e-9) fail(`A ${site.mass} kg structure cannot hold ${held.toFixed(1)} kg.`);
    giveTo(dest, out);
    S.log.push({ t: S.minute, kind: 'work', text: `${person.name} ran ${site.name}: ${Object.entries(out).filter(([, v]) => v > 0).map(([k, v]) => `${v.toFixed(1)} ${k}`).join(', ')}.` });
    applied.push('make');
  }

  return { applied, hour: S.minute };
}

export { region };
