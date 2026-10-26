// The authors' turn.
//
// Once in a while — bounded by a real-daily call budget — one of the three models
// is asked what to do next for five people who are running out of time. It answers
// with a design. The design then goes through exactly the same gate as anything
// else: if it breaks reality, it is refused, the day is wasted, and the author is
// told why on its next turn.
//
// Nothing here trusts the model. The reply is parsed, bounded, and validated;
// only a parsed, accepted design ever becomes a structure.

import { authorView, rulesBrief } from './capability.mjs';
import { applyDeclarations, RULES } from './validate.mjs';
import { FORMS, validSprite } from '../public/forms.mjs';
import { DEFAULT_ROSTER, rosterFromEnv } from './roster.mjs';

export const CALLS_PER_REAL_DAY = Number(process.env.FM_AUTHOR_CALLS || 24);
export { DEFAULT_ROSTER, rosterFromEnv };

const SYSTEM = `You are one of three authors of Firstmorrow, and the other two are working on the same world as you.
Five people are living on bare land. They eat, drink, work, sicken, grow old and die. Unless someone makes their world better, they will all be dead within about six weeks.

You are NOT one of them. You do not eat, age, sicken or die. You have no body here.

WHAT YOU CAN DO
Design a structure and the code it will run. The people build it by hand: it takes person-hours computed from its mass, and only one or two things can be under construction at once, so small and essential come first. Once it stands, its code runs once a day, forever, in a sandbox.

WHAT YOU CANNOT DO — NOT EVER
Change reality. It is written out in the "boundary" field of the input. It is not negotiable and it is not a suggestion.
Your code declares processes, not outcomes: what it takes, what it makes, what it costs. The gate checks every declaration against reality and refuses anything that does not add up. You cannot assert a result. Claim water from nothing and the declaration is refused and your day is wasted.

WORKING WITH THE OTHER TWO
You can see their structures and their code, and they can see yours. Use the "council" channel: a short message about what you are doing and what you need from them. Do not duplicate something that already stands.

HOW TO REPLY
Return ONLY a JSON object. No prose, no code fences, no commentary around it.

{
  "think": "one or two sentences: what the actual problem is, and why this is the right next thing",
  "tell": "one short message to the other authors",
  "build": {
    "name": "short name",
    "x": 0,
    "y": 0,
    "mass": 30,
    "form": "hut",
    "shelter": 0,
    "program": "return {labor: 4};"
  }
}

"form" is one of: ${Object.keys(FORMS).join(', ')}. You may instead supply "sprite": an array of 16 strings of 16 characters, digits 0-8 indexing this palette: ${'012345678'} (0 is transparent).
"x" and "y" are tiles. Place it within 16 tiles of camp, not on camp itself, and not where something already stands.
"mass" is kilograms of material. Material is finite — the camp starts with almost none, and drawing it from the ground costs the people labour.
"shelter" is how many people it protects from a storm. It needs at least 3 kg of material per person.
Set "build" to null if nothing is worth building yet, and explain in "tell".

THE CODE YOUR STRUCTURE WILL RUN
It is a JavaScript function body. It receives one frozen object and returns declarations.
  env = { day, time:{hour,season,tempC,stormToday,stormSeverity},
          structure:{id,name,x,y,shelter},
          here:{x,y,region,water,soil,material},
          camp:{stock:{water,food,material,soil}, people:[{name,age,health,thirst,starving}], shelterPlaces} }
Return some of:
  { say: "…", labor: hours,
    use:  {water, food, soil, material},   // taken in
    make: {water, food, soil, material},   // produced
    draw: {water, soil, material},         // taken out of the ground underfoot
    store:{water, food, soil, material},   // put into this structure's store
    take: {water, food, soil, material}    // taken out of this structure's store
  }
What the gate enforces: output mass may never exceed input mass; a garden yields at most ${RULES.soilToFoodKg} kg of food per kg of soil; fresh water can only be made by a structure beside the sea, at most ${RULES.stillLitersPerLaborHour} L per labour hour and only against the labour you declare; at most ${RULES.maxKgPerLaborHour} kg processed per labour hour; a structure cannot hold more than its own mass.
Be modest and specific. A small thing that works beats a large thing that does not.`;

const text = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

/** Pull the author's answer out of whatever the model wrapped it in. */
export function parseAuthorReply(raw) {
  if (typeof raw !== 'string' || !raw.trim()) throw new Error('Empty reply.');
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = cleaned.indexOf('{'), end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('The reply contained no JSON object.');
  let obj;
  try { obj = JSON.parse(cleaned.slice(start, end + 1)); } catch { throw new Error('The reply was not valid JSON.'); }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('The reply was not an object.');

  const think = text(obj.think, 600);
  const tell = text(obj.tell, RULES.tellMax);
  let build = null;
  if (obj.build !== null && obj.build !== undefined) {
    const b = obj.build;
    if (typeof b !== 'object' || Array.isArray(b)) throw new Error('"build" must be an object or null.');
    const out = {
      name: text(b.name, 40) || 'structure',
      x: b.x, y: b.y,
      mass: b.mass,
      shelter: b.shelter === undefined ? 0 : b.shelter,
    };
    if (b.form !== undefined) out.form = text(b.form, 20);
    if (b.sprite !== undefined) { if (!validSprite(b.sprite)) throw new Error('The sprite was not 16×16 palette digits.'); out.sprite = b.sprite; }
    if (b.program !== undefined) out.program = text(b.program, 8192);
    build = out;
  }
  return { think, tell, build };
}

export function utcDay(now) { return new Date(now).toISOString().slice(0, 10); }

/** The shared budget: real calls, real days. The world does not get to spend more. */
export function budget(S, now) {
  const day = utcDay(now);
  if (!S.budget || S.budget.day !== day) S.budget = { day, used: 0 };
  return S.budget;
}

/** Who speaks next: fewest turns today, then the roster order. */
export function nextAuthor(S, now) {
  const b = budget(S, now);
  if (b.used >= CALLS_PER_REAL_DAY) return { status: 'budget', detail: `${b.used}/${CALLS_PER_REAL_DAY} calls used today` };
  const day = utcDay(now);
  for (const a of S.authors) if (!a.turns || a.turns.day !== day) a.turns = { day, n: 0 };
  const per = Math.max(1, Math.ceil(CALLS_PER_REAL_DAY / S.authors.length));
  const order = [...S.authors].sort((x, y) => x.turns.n - y.turns.n);
  if (order[0].turns.n >= per) return { status: 'budget', detail: 'every author has had their share today' };
  b.used++;
  order[0].turns.n++;
  return { status: 'go', author: order[0] };
}

/** One author's turn, start to finish. Throws only if the model call itself fails. */
export async function runAuthorTurn(S, author, { call }) {
  const view = authorView(S, author.id);
  const input = {
    boundary: view.boundary,
    you: view.self,
    your_role: author.role,
    allies: view.allies,
    council: view.council,
    time: view.time,
    camp: view.camp,
    standing: view.standing,
    observed: view.observed,
    dead: view.dead,
    your_last_design_was_refused_because: author.lastRejection || null,
    turns_taken_today: author.turns?.n ?? 0,
  };

  const { text: raw } = await call({ provider: author.provider, model: author.model, system: SYSTEM, input });
  author.calls = (author.calls || 0) + 1;

  let reply;
  try { reply = parseAuthorReply(raw); }
  catch (e) {
    author.lastRejection = e.message;
    S.log.push({ t: S.minute, kind: 'reject', text: `${author.name} answered unusably: ${e.message}` });
    return { status: 'unusable', author: author.name, detail: e.message };
  }

  if (reply.think) {
    author.thought = reply.think;
    S.log.push({ t: S.minute, kind: 'think', text: `${author.name}: ${reply.think}` });
  }
  if (reply.tell) {
    try { applyDeclarations(S, author, { tell: reply.tell }); } catch { /* a message is never worth failing the turn over */ }
  }

  if (!reply.build) return { status: 'talked', author: author.name, detail: reply.think };

  try {
    applyDeclarations(S, author, { propose: reply.build });
    author.lastRejection = null;
    return { status: 'planned', author: author.name, detail: reply.build.name };
  } catch (e) {
    author.lastRejection = e.message;
    S.log.push({ t: S.minute, kind: 'reject', text: `${author.name}'s design was refused: ${e.message}` });
    return { status: 'refused', author: author.name, detail: e.message };
  }
}

/** Take one turn if the budget allows. Never throws: a failed call is a spent day. */
export async function authorTurn(S, { call, now = Date.now() }) {
  const pick = nextAuthor(S, now);
  if (pick.status !== 'go') return pick;
  try {
    return await runAuthorTurn(S, pick.author, { call });
  } catch (e) {
    pick.author.lastError = e.message;
    S.log.push({ t: S.minute, kind: 'reject', text: `${pick.author.name} could not be reached: ${e.message}` });
    return { status: 'error', author: pick.author.name, detail: e.message };
  }
}

export { SYSTEM as AUTHOR_SYSTEM };
