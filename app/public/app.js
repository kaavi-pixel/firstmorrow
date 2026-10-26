// The observer's view. Thin on purpose: the world does the work.
import { paintSprite, paintPerson, paintAgent, createWorldRenderer } from './art.js';

const $ = id => document.getElementById(id);
const view = { seed: 0, minute: 0, geography: null, buildings: [], inhabitants: [] };
let payload = null, renderer = null, panel = null;

function buildGeography(g) {
  const tiles = new Map();
  const { bounds, grid, gridW, regionIds } = g;
  for (let y = bounds.minY; y <= bounds.maxY; y++)
    for (let x = bounds.minX; x <= bounds.maxX; x++)
      tiles.set(y * 128 + x, { x, y, regionId: regionIds[grid[y * gridW + x]] });
  return { version: g.version, seed: g.seed, tileM: g.tileM, bounds, mainland: g.mainland, regions: g.regions, features: g.features, oasis: g.oasis, tiles };
}

function apply(p) {
  payload = p;
  view.seed = p.seed;
  view.minute = p.minute;
  if (!view.geography || view.geography.seed !== p.geography.seed) view.geography = buildGeography(p.geography);
  view.buildings = p.buildings;
  view.inhabitants = p.inhabitants;
  $('day').textContent = `Day ${p.day + 1}`;
  $('time').textContent = p.clock;
  $('since').textContent = `day ${p.day + 1}`;
  $('cap-used').textContent = String(p.summary.dead);
  const s = p.summary;
  $('status-label').textContent = s.alive <= 0 ? 'Everyone is gone' : `Live · ${s.alive} alive · ${s.season} ${s.tempC}°C`;
  $('status').classList.toggle('past', s.alive <= 0);
  if (panel === 'stock') renderStock();
  if (panel === 'people') renderPeople();
  if (panel === 'log') renderLog();
}

const fmt = n => (Math.abs(n) >= 1000 ? Math.round(n).toLocaleString() : (+n).toFixed(1));

function renderPeople() {
  $('people-list').innerHTML = [...payload.inhabitants, ...payload.dead.map(d => ({ name: d.name, dead: d }))]
    .map(p => p.dead
      ? `<div class="row"><span class="swatch" style="background:#4a4941"></span><span><b>${p.name}</b><span class="muted small"> died day ${Math.floor((p.dead.at || 0) / 1440) + 1} — ${p.dead.cause}</span></span></div>`
      : `<div class="row"><span class="swatch" style="background:${p.color}"></span><span><b>${p.name}</b><span class="muted small"> · ${p.age} years · health ${p.health}</span></span></div>`)
    .join('') || '<p class="muted small">Nobody here.</p>';
}
function renderStock() {
  const L = payload.ledger, s = payload.summary;
  $('stock').innerHTML = `<dl class="facts">
    <div><dt>Water in store</dt><dd>${fmt(L.water)} L (${s.reserveWaterDays} days)</dd></div>
    <div><dt>Food in store</dt><dd>${fmt(L.food)} kcal (${s.reserveFoodDays} days)</dd></div>
    <div><dt>Material</dt><dd>${fmt(L.material)} kg</dd></div>
    <div><dt>Soil</dt><dd>${fmt(L.soil)} kg</dd></div>
    <div><dt>Shelter places</dt><dd>${L.shelter}</dd></div>
    <div><dt>Structures</dt><dd>${s.structures}</dd></div>
    <div><dt>Mean health</dt><dd>${s.meanHealth}</dd></div>
    <div><dt>Born / died</dt><dd>${s.born} / ${s.dead}</dd></div>
    <div><dt>Storms survived</dt><dd>${s.storms}</dd></div></dl>`;
}
function renderLog() {
  $('log').innerHTML = payload.log.map(e => `<li><span class="muted small">day ${Math.floor((e.t || 0) / 1440) + 1}</span> ${e.text}</li>`).join('');
}
function openPanel(name) {
  panel = panel === name ? null : name;
  $('panel').hidden = !panel;
  document.querySelectorAll('[data-view]').forEach(s => { s.hidden = s.dataset.view !== panel; });
  document.querySelectorAll('[data-panel]').forEach(b => b.classList.toggle('on', b.dataset.panel === panel));
  if (!panel) return;
  $('panel-title').textContent = { people: 'People', stock: 'World', log: 'Log', settings: 'About' }[panel];
  if (panel === 'people') renderPeople();
  if (panel === 'stock') renderStock();
  if (panel === 'log') renderLog();
}

$('assumptions-toggle').addEventListener('click', () => {
  const el = $('assumptions');
  el.hidden = !el.hidden;
});
document.querySelectorAll('[data-panel]').forEach(b => b.addEventListener('click', () => openPanel(b.dataset.panel)));
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => openPanel(panel)));
$('rotate').addEventListener('click', () => renderer && renderer.rotateBy(Math.PI / 4));
$('begin').addEventListener('click', () => { $('welcome').hidden = true; try { localStorage.setItem('fm.entered', '1'); } catch {} });
$('theme').addEventListener('click', () => {
  const el = document.documentElement;
  el.dataset.theme = el.dataset.theme === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem('fm.theme', el.dataset.theme); } catch {}
});
addEventListener('keydown', e => { if (e.key === 'q') renderer?.rotateBy(-Math.PI / 8); if (e.key === 'e') renderer?.rotateBy(Math.PI / 8); });

try { document.documentElement.dataset.theme = localStorage.getItem('fm.theme') || 'dark'; } catch {}
try { $('welcome').hidden = localStorage.getItem('fm.entered') === '1'; } catch { $('welcome').hidden = false; }

async function poll() {
  try {
    const res = await fetch('/api/live', { cache: 'no-store' });
    apply(await res.json());
    if (!renderer) {
      renderer = createWorldRenderer($('world'), {
        getWorld: () => view, getSpeed: () => 1,
        activityFor: i => payload.activities[i] || { tile: view.inhabitants[i] || { x: 13, y: 21 }, kind: 'idle' },
        onSelect: hit => selectPerson(hit),
        getAgents: () => payload.authors,
        agentActivity: a => payload.authorActivity[payload.authors.indexOf(a)] || null,
        getSpeech: obj => payload.speech[obj.id] || null,
      });
      // QA hooks, in the spirit of v1: let a test drive the renderer without
      // depending on the animation frame.
      window.fm = { renderer, view, payload: () => payload, draw: dt => renderer.draw(dt ?? 0.016), rotate: r => renderer.rotateBy(r) };
    }
  } catch (e) { $('status-label').textContent = 'Offline'; }
  setTimeout(poll, 1000);
}

function selectPerson(hit) {
  const card = $('card');
  if (!hit || hit.type !== 'person') { card.hidden = true; return; }
  const p = payload.inhabitants.find(i => i.id === hit.id);
  if (!p) { card.hidden = true; return; }
  card.innerHTML = `<h3>${p.name}</h3><p class="muted small">${p.age} years · health ${p.health}</p>`;
  card.hidden = false;
}

poll();
