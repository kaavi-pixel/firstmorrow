import { normalizeArt } from './public/core.js';
import {validatePhysical,minimumMaterialKg} from './public/physics.js';
export const PROVIDERS = Object.freeze({
  openai: { name: 'OpenAI', endpoint: 'https://api.openai.com/v1/responses', model: 'gpt-6-astra' },
  xai: { name: 'xAI / Grok', endpoint: 'https://api.x.ai/v1/responses', model: 'grok-4.7' },
  perplexity: { name: 'Perplexity', endpoint: 'https://api.perplexity.ai/v1/agent', model: 'openai/gpt-5.6-sol' }
});

export function validateArtifact(a) {
  if (!a || typeof a !== 'object' || Array.isArray(a)) throw new Error('The builder must return a JSON object.');
  const text = (v, n, label) => {
    if (typeof v !== 'string' || !v.trim() || v.length > n) throw new Error(`Invalid ${label}.`);
    return v;
  };
  const name = text(a.name, 70, 'name');
  const reason = text(a.reason, 1800, 'reason');
  const tradeoff = text(a.tradeoff, 1000, 'trade-off');
  const code = text(a.code, 8000, 'JavaScript module');
  if (!Array.isArray(a.palette) || a.palette.length < 2 || a.palette.length > 9 ||
      !a.palette.every(c => /^#[a-fA-F0-9]{6}$/.test(c))) throw new Error('Use a palette of 2–9 hex colors.');
  if (!Array.isArray(a.sprite) || a.sprite.length !== 16 ||
      !a.sprite.every(row => typeof row === 'string' && row.length === 16 &&
        [...row].every(c => /^[0-8]$/.test(c) && Number(c) < a.palette.length))) throw new Error('The sprite must be exactly 16×16 palette-index pixels.');
  if (!Number.isInteger(a.x) || !Number.isInteger(a.y) || a.x < 2 || a.x > 19 || a.y < 2 || a.y > 19) throw new Error('Place structures inside the 22×22 world.');
  const costs = {}, physical=validatePhysical(a.physical);
  for (const k of ['water', 'food', 'energy', 'materials']) {
    const n = a.costs?.[k] ?? 0;
    if (!Number.isFinite(n) || n < 0 || n > {water:1000,food:10000,energy:100,materials:2000}[k]) throw new Error('Construction cost exceeds its unit-specific limit.');
    costs[k] = n;
  }
  costs.materials=Math.max(costs.materials,minimumMaterialKg(physical));
  const say = typeof a.say === 'string' ? a.say.trim().slice(0, 160) : '';
  return { name, reason, tradeoff, code, palette: a.palette.slice(), sprite: a.sprite.slice(), x: a.x, y: a.y, costs, physical, say };
}

export function extractArtifact(text) {
  if (typeof text !== 'string' || text.length > 45000) throw new Error('Empty or oversized model response.');
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = cleaned.indexOf('{'), end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('The model did not return a JSON artifact. Try another turn or model.');
  try { return validateArtifact(normalizeArt(JSON.parse(cleaned.slice(start, end + 1)))); }
  catch (e) { if (e instanceof SyntaxError) throw new Error('The model returned invalid JSON. No changes were applied.'); throw e; }
}

export const SYSTEM = `You are a Firstmorrow builder. You invent executable systems AND original pixel art for an initially bare desert settlement. Nothing is preselected from a building menu. You have a protected foundation, read-only inhabitants, and existing world artifacts. Improve the worst-off inhabitants while respecting divergent values and autonomy. Do not claim your design is optimal. Learn from existing modules and rejection feedback. Each turn produce ONE new working structure. Placement: tiles are 8 m; never build on site.blocked tiles (oasis, rock, dune), and leave at least one empty tile in every direction, including diagonals, between your structure and any existing one (Sphere fire spacing and access).
You also appear in the world as a person the inhabitants can see. Return only a JSON object with:
say (one short sentence you say aloud to the inhabitants about this plan, first person, plain speech),
name (short), reason (explain mechanism and intended beneficiaries), tradeoff (honest limitation),
x,y (integer tile coordinates 2..19), costs:{water,food,energy,materials} (units L,kcal,kWh,kg; maximum1000,10000,100,2000 respectively),
physical:{solarAreaM2,cropAreaM2,shelterAreaM2,pumpCapacityLDay,materialRateKgDay}. Areas sum to at most64m². Pump at most2000L/day, extraction at most10kg/day. Engine enforces minimum build materials:8kg/m² panels,12kg/m² shelter,.2kg/m² crop equipment,60kg+.02kg per L/day pump capacity,10kg per kg/day extraction rate. These are scenario budgets, NOT empirically validated designs. Construction is slow: it takes 0.5 person-hours per kg (minimum 12), done by three inhabitants working 8 hours a day, and only one structure is built at a time. A structure does nothing until finished, so prefer modest, essential structures first. Do not claim structural adequacy.
palette (2..9 hex colors, index 0 transparent; use warm sand, clay, sage, slate blue),
sprite (16 strings, each exactly 16 characters, digits indexing palette),
code (JavaScript FUNCTION BODY, no markdown, no exports).
code has variables world and building. world={day,resources:{water:L,food:kcal,energy:kWh,materials:kg},groundwaterL,materialReserveKg,inhabitants:[{id,name,needs:{water,food,shelter,connection,autonomy,ecology},weights,values}],buildings:[{id,name,x,y,physical,cropGrowthDays,cropStoredKcal,code}]}. building has {name,x,y,physical}. It is a deep-frozen snapshot, with NO keys or browser access.
Return {actions:{collectSolarFraction:0..1,pumpLiters:0..2000,irrigateLiters:0..2000,extractKg:0..10},needs:[{id,connection:delta,autonomy:delta,ecology:delta}]}.
Direct resource changes are FORBIDDEN. Protected physics decides actual outcomes. Requests cannot exceed installed capacity or available stocks. Solar yield=area*5kWh/m²/day*.20 efficiency*.85 performance. Pumping uses liters*9.81*20/(.5*3.6e6)kWh and finite groundwater; storage max5000L. Battery max40kWh. Crop irrigation uses FAO Penman-Monteith ET at fictional Tmean34C,Tmax40,Tmin28,RH30%,wind2m/s,alt50m and clear-sky radiation25MJ/m²/day. Crops accumulate a solar-bounded plant-energy proxy at1% solar conversion, harvest only after30 fully-watered equivalent days; this is NOT a calibrated agronomic yield model. Extraction draws finite material reserves using.1kWh/kg (assumption). Each person uses15L domestic water and2100kcal food/day (humanitarian baselines, NOT perfect-life targets); household energy demand.5kWh/person/day assumed. Shelter need depends on actual covered area using3.5m²/person emergency minimum, not architectural adequacy. Social need deltas capped -2..2 per module,±5 per day; these scores are abstract and not science.
Modules run every day. No network, DOM, timers, imports or filesystem. Return synchronously within500ms. Avoid loops. Example pump code: "return {actions:{pumpLiters:Math.max(0,2000-world.resources.water)},needs:[]};"
The ecology, autonomy, and social outcomes are a toy model, not empirical evidence. Be specific and modest. Never include credentials or requests for secrets.`;

export async function callProvider({ provider, key, model, input, test = false }, fetcher = fetch, signal) {
  const p = PROVIDERS[provider];
  if (!p) throw new Error('Unsupported provider.');
  if (typeof key !== 'string' || key.length < 8 || key.length > 512 || /[\r\n]/.test(key)) throw new Error('Enter a valid API key in Connections.');
  if (typeof model !== 'string' || !/^[a-zA-Z0-9/_.:-]{1,140}$/.test(model)) throw new Error('Enter a valid model ID.');
  const body = {
    model, input: [
      { role: 'system', content: test ? 'Reply with only OK.' : SYSTEM },
      { role: 'user', content: test ? 'Connection test. Reply OK.' : JSON.stringify(input) }
    ], max_output_tokens: test ? 2048 : 16000, store: false
  };
  // Reasoning models can spend the whole output budget thinking; keep effort low.
  if (provider === 'openai' && /^(gpt-[5-9]|o[1-9])/.test(model)) body.reasoning = { effort: 'low' };
  const r = await fetcher(p.endpoint, {
    method: 'POST', headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal, redirect: 'error'
  });
  if (!r.ok) {
    const category = r.status === 401 || r.status === 403 ? 'Key rejected or model access denied. Check the key and model ID.' :
      r.status === 429 ? 'Provider rate limit or account quota reached.' :
      r.status === 404 ? 'Model or endpoint not found. Check the model ID.' :
      'Provider rejected the request. Check model compatibility and your account.';
    // Never return upstream bodies; they may echo secrets or user input.
    throw new Error(`${p.name}: ${category} (HTTP ${r.status})`);
  }
  const raw = await r.text();
  if (raw.length > 400000) throw new Error('Provider response exceeded the safety limit.');
  let data;
  try { data = JSON.parse(raw); } catch { throw new Error('Provider returned an unreadable response.'); }
  const output = data.output_text || (data.output || [])
    .filter(o => o.type === 'message').flatMap(o => o.content || [])
    .filter(c => c.type === 'output_text').map(c => c.text).join('\n');
  if (!output) throw new Error('The model returned no text. Its reasoning may have used the output budget; try another model.');
  return { ...(test ? { connected: true } : { artifact: extractArtifact(output) }),
    usage: { input: data.usage?.input_tokens || 0, output: data.usage?.output_tokens || 0 },
    model: data.model || model };
}
