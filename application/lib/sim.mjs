// The shared world, simulated on the server. One real second is one in-world minute.
// This is the same rule set the browser used to run, moved here so the world keeps going
// when nobody is watching. AI proposals are the only outside input.
import { freshWorld, clone, wellbeing, worldSnapshot, checkArtifact, normalizeEffects, settleDay,
  ROLES, NEEDS, SITE, siteProblem, laborHours, workMinute, currentProject, workDaysLeft, WORK } from '../public/core.js';
import { SCIENCE, payConstruction } from '../public/physics.js';
import { advanceJourneys } from '../public/exploration.js';

export const MS_PER_MINUTE = 1000;
export const WAIT_DAYS = 7, DAILY_PROPOSALS = 24, REQUEST_TIMEOUT_MS = 5 * 60000, ERROR_BACKOFF_MIN = 1440;
export const AGENT = Object.freeze({ id: 'ai-perplexity', provider: 'perplexity', name: 'Sonnet', model: 'anthropic/claude-sonnet-5-5', color: '#5fa8c4' });
export const BRIEF = 'Create a good life for all five people without forcing agreement. Prioritize the worst-off. Building is slow, so choose what matters most next.';
// Fields of a structure that never change after it is placed. Stored once, sent once.
export const STATIC = ['id', 'name', 'reason', 'tradeoff', 'code', 'palette', 'sprite', 'x', 'y', 'costs', 'physical', 'say', 'role', 'source', 'agentId', 'day', 'laborHours'];
export const DYNAMIC = ['id', 'built', 'progressHours', 'active', 'cropStoredKcal', 'cropGrowthDays'];
const pick = (o, keys) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]));

export function freshState(now) {
  return { v: 1, world: freshWorld(2049), simAt: now, startedAt: now, plan: null, waiting: null, feedback: '', nextPlanAbs: 0,
    agent: { ...AGENT, say: '', sayAt: -1e9, status: 'idle', proposals: 0, built: 0, tokens: 0 },
    cap: { date: '', count: 0 }, staticCount: 0 };
}
export const abs = w => w.day * 1440 + w.minute;

function log(S, text, buildingId) {
  const w = S.world;
  w.history.push({ day: w.day, minute: w.minute, text, ...(buildingId ? { buildingId } : {}) });
  if (w.history.length > 300) w.history.splice(0, w.history.length - 300);
}
function speak(S, text) { S.agent.say = String(text).slice(0, 160); S.agent.sayAt = abs(S.world); }

// One day's record for the timeline: everything that changes, nothing that is fixed.
export function daySnapshot(S, day) {
  const w = S.world;
  return { day, resources: clone(w.resources), groundwaterL: w.groundwaterL, materialReserveKg: w.materialReserveKg, balances: clone(w.balances),
    needs: Object.fromEntries(w.inhabitants.map(p => [p.id, clone(p.needs)])),
    buildings: w.buildings.map(b => pick(b, DYNAMIC)),
    agent: pick(S.agent, ['say', 'proposals', 'built', 'tokens']),
    geographyVersion: w.geography?.version ?? null,
    ...(w.exploration ? { exploration: clone(w.exploration) } : {}),
    log: w.history.filter(h => h.day === day) };
}

function startPlan(S) {
  const w = S.world, role = ROLES[w.buildings.length % 3];
  S.plan = { id: `p${abs(w)}`, role, start: abs(w), pending: true, requested: false, requestedAt: 0, artifact: null, error: null, source: '', agentId: AGENT.id };
  S.agent.status = 'thinking';
  log(S, `${S.agent.name} is thinking about what to build next`);
}

async function tryStart(S, item, run) {
  const w = S.world; let a;
  try {
    a = checkArtifact(item.artifact);
    const site = siteProblem(w, a.x, a.y); if (site) throw new Error(site);
    const proposed = { ...a, id: `b${w.buildings.length}-${abs(w).toString(36)}`, role: item.role, source: item.source, agentId: item.agentId,
      day: w.day, active: true, built: false, progressHours: 0, laborHours: laborHours(a) };
    // Test the behavior against a hypothetical finished world before committing anything.
    const candidate = clone(w); payConstruction(candidate, a.costs); candidate.buildings.push({ ...proposed, built: true });
    normalizeEffects(run(a.code, worldSnapshot(candidate), { name: a.name, x: a.x, y: a.y, physical: a.physical }, abs(w)), candidate);
    const short = ['water', 'food', 'energy', 'materials'].filter(k => w.resources[k] < a.costs[k]);
    if (short.length) {
      if (!S.waiting) { S.waiting = { ...item, since: w.day }; log(S, `${a.name} is waiting for ${short.join(' and ')}`); }
      else if (w.day - S.waiting.since >= WAIT_DAYS) { S.waiting = null; S.feedback = `${a.name} needed more ${short.join(' and ')} than the world had for ${WAIT_DAYS} days.`; log(S, `${a.name} was abandoned`); }
      return;
    }
    S.waiting = null; payConstruction(w, a.costs); w.buildings.push(proposed); S.feedback = '';
    const d = Math.ceil(workDaysLeft(proposed));
    log(S, `Work begins on ${a.name}. About ${d} working day${d === 1 ? '' : 's'}.`, proposed.id);
  } catch (e) {
    S.waiting = null; S.feedback = String(e.message).slice(0, 1500);
    log(S, `A ${item.role.toLowerCase()} proposal was set aside: ${S.feedback.slice(0, 90)}`);
  }
}

function endOfDay(S, run, snapshots) {
  const w = S.world, effects = [], snap = worldSnapshot(w), day = w.day;
  const before = new Map(w.buildings.map(b => [b.id, b.cropGrowthDays || 0]));
  for (const b of w.buildings.filter(b => b.active && b.built !== false)) {
    try { effects.push({ ...normalizeEffects(run(b.code, snap, { name: b.name, x: b.x, y: b.y, physical: b.physical }, abs(w) ^ b.x * 31 ^ b.y), w), buildingId: b.id }); }
    catch (e) { b.active = false; log(S, `${b.name} stopped working: ${String(e.message).slice(0, 80)}`, b.id); }
  }
  settleDay(w, effects);
  for (const b of w.buildings) if ((before.get(b.id) || 0) >= SCIENCE.cropMaturityDays - 1 && b.cropGrowthDays === 0) log(S, `First harvest from ${b.name}`, b.id);
  const worst = [...w.inhabitants].sort((a, b) => wellbeing(a) - wellbeing(b))[0];
  if (w.resources.water < w.inhabitants.length * SCIENCE.waterPerPersonL) log(S, 'There was not enough water today');
  else if (w.resources.food < w.inhabitants.length * SCIENCE.foodPerPersonKcal * 7) log(S, 'Food stores will run out within a week');
  else if (wellbeing(worst) < 35) log(S, `${worst.name} is struggling`);
  snapshots.push(daySnapshot(S, day));
}

async function minute(S, run, snapshots) {
  const w = S.world;
  w.minute++;
  if (w.minute >= 1440) { w.minute = 0; endOfDay(S, run, snapshots); }
  advanceJourneys(w);
  if (currentProject(w)) {
    const done = workMinute(w);
    if (done) { log(S, `${done.name} is finished`, done.id); if (done.agentId === AGENT.id) S.agent.built++; }
    return;
  }
  const h = w.minute / 60;
  if (S.planningPaused) return;
  if (S.waiting) { if (w.minute === 480) await tryStart(S, S.waiting, run); return; }
  if (!S.plan) { if (h >= 7 && h < 16 && abs(w) >= S.nextPlanAbs) startPlan(S); return; }
  if (!S.plan.pending && abs(w) - S.plan.start >= WORK.planMinutes && h >= 7 && h < 17) {
    const p = S.plan; S.plan = null; S.agent.status = 'idle';
    if (p.error) { S.feedback = p.error; S.nextPlanAbs = abs(w) + ERROR_BACKOFF_MIN; log(S, `${S.agent.name} could not reach its model: ${p.error.slice(0, 90)}`); }
    else await tryStart(S, p, run);
  }
}

// Advance the world to `now`, at most `budgetMs` of computing. Returns finished days.
export async function advance(S, now, run, budgetMs = 20000) {
  const snapshots = [], t0 = Date.now();
  // A request that never came back is treated as failed so the world does not stall.
  if (S.plan?.requested && S.plan.pending && now - S.plan.requestedAt > REQUEST_TIMEOUT_MS) failPlan(S, 'The model did not answer in time.');
  while (S.simAt + MS_PER_MINUTE <= now) {
    await minute(S, run, snapshots);
    S.simAt += MS_PER_MINUTE;
    if ((S.simAt / MS_PER_MINUTE) % 60 === 0 && Date.now() - t0 > budgetMs) break;
  }
  return snapshots;
}

// Proposal requests: the tick asks for one when a plan is waiting, within a daily cap.
export function needsProposal(S, now) {
  if (S.planningPaused) return false;
  if (!S.plan?.pending || S.plan.requested) return false;
  const date = new Date(now).toISOString().slice(0, 10);
  if (S.cap.date !== date) S.cap = { date, count: 0 };
  if (S.cap.count >= DAILY_PROPOSALS) { if (S.agent.status !== 'resting') { S.agent.status = 'resting'; log(S, `${S.agent.name} has made today's ${DAILY_PROPOSALS} proposals and will continue tomorrow`); } return false; }
  return true;
}
export function markRequested(S, now) { S.plan.requested = true; S.plan.requestedAt = now; S.cap.count++; S.agent.proposals++; S.agent.status = 'thinking'; }
export function proposalInput(S) { return { role: S.plan.role, world: worldSnapshot(S.world), brief: BRIEF, feedback: S.feedback, site: { tileM: SITE.tileM, minGapTiles: SITE.minGapTiles, blocked: SITE.blocked } }; }
export function applyProposal(S, planId, result) {
  if (!S.plan || S.plan.id !== planId || !S.plan.pending) return false;
  const u = result.usage || { input: 0, output: 0 };
  S.world.usage.input += u.input; S.world.usage.output += u.output; S.agent.tokens += u.input + u.output;
  S.plan.artifact = result.artifact; S.plan.source = `${S.agent.name} · ${result.model}`; S.plan.pending = false; S.agent.status = 'idle';
  const line = result.artifact?.say || `I think we should build ${result.artifact?.name || 'something'}.`;
  speak(S, line); log(S, `${S.agent.name}: “${line}”`);
  return true;
}
export function failPlan(S, message, planId) {
  if (!S.plan || !S.plan.pending || (planId && S.plan.id !== planId)) return false;
  S.plan.error = String(message).slice(0, 300); S.plan.pending = false; S.agent.status = 'error'; S.agent.lastError = S.plan.error;
  return true;
}

// Storage split: structures' fixed parts are stored once; everything else is small.
export function splitState(S) {
  const statics = S.world.buildings.map(b => pick(b, STATIC));
  const core = { ...S, world: { ...S.world, buildings: S.world.buildings.map(b => pick(b, DYNAMIC)) }, staticCount: statics.length };
  return { core, statics };
}
export function joinState(core, staticById) {
  const S = clone(core);
  S.world.buildings = S.world.buildings.map(d => { const s = staticById[d.id]; if (!s) throw new Error(`Missing structure ${d.id}`); return { ...s, ...d }; });
  return S;
}
// What visitors receive every few seconds.
export function livePayload(S, now) {
  const { core } = splitState(S), w = core.world;
  return { simAt: S.simAt, serverNow: now, startedAt: S.startedAt, staticCount: core.staticCount,
    world: { ...w, history: w.history.slice(-120) },
    plan: S.plan && { role: S.plan.role, start: S.plan.start, pending: S.plan.pending, artifactName: S.plan.artifact?.name || null, x: S.plan.artifact?.x, y: S.plan.artifact?.y, agentId: S.plan.agentId },
    waiting: !!S.waiting, agent: S.agent, cap: { daily: DAILY_PROPOSALS, used: S.cap.count } };
}
export { NEEDS };
