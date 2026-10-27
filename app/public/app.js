// The observer's view. Thin on purpose: the world does the work.
import { paintSprite, paintPerson, paintAgent, createWorldRenderer } from './art.js';

const $ = id => document.getElementById(id);
const view = { seed: 0, minute: 0, geography: null, buildings: [], inhabitants: [] };
let payload = null, renderer = null, panel = null;
let viewer = null;                       // who is watching: { email, canSpeed, speed }
let speedChoice = 1;                     // the observer's own preference, honoured only if privileged
try { speedChoice = Math.max(1, Math.min(60, Number(localStorage.getItem('fm.speed')) || 1)); } catch {}
// The timeline in the dock: it follows the world's clock while it runs. Dragging
// it moves only the observer's eye to another hour of the same day — the world
// itself is untouched, and a day is still lived exactly once.
let following = true;
const clockOf = m => `${String(Math.floor(Math.max(0, m) / 60)).padStart(2, '0')}:${String(Math.max(0, m) % 60).padStart(2, '0')}`;
// The day bar is that same idea one order up: dragging it moves the observer's
// eye across the days the record still holds. The world is not travelled and not
// rolled back — the top bar keeps telling the truth about now.
let lookingDay = null;                   // null = the live day
const dayOf = t => Math.floor((t || 0) / 1440);

function applyViewer(v) {
  viewer = v && typeof v === 'object' ? v : null;
  const can = !!(viewer && viewer.canSpeed);
  $('speed-box').hidden = !can;
  if (can) { $('speed').value = speedChoice; $('speed-label').textContent = speedChoice + '×'; }
  $('account-btn').textContent = viewer && viewer.email ? viewer.email.split('@')[0] : 'Sign in';
  if (panel === 'account') renderAccount();
}

function renderAccount() {
  $('account-email').textContent = viewer && viewer.email ? viewer.email : 'Not signed in';
  $('account-buttons').innerHTML = viewer && viewer.email
    ? '<a class="btn" href="/api/auth/signout">Sign out</a>'
    : '<a class="btn" href="/api/auth/begin">Sign in with Google</a>';
  $('speed-note').hidden = !(viewer && viewer.canSpeed);
}

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
  applyViewer(p.viewer);
  view.seed = p.seed;
  if (following) {
    view.minute = p.minute;
    const scrub = $('scrub');
    scrub.min = 0; scrub.max = 1439; scrub.step = 1;
    scrub.value = p.minute;
    $('scrub-label').textContent = `Live ${p.clock}`;
  }
  if (!view.geography || view.geography.seed !== p.geography.seed) view.geography = buildGeography(p.geography);
  view.buildings = p.buildings;
  view.inhabitants = p.inhabitants;
  $('day').textContent = `Day ${p.day + 1}`;
  applyDayBar();
  $('time').textContent = p.clock;
  $('since').textContent = `day ${p.day + 1}`;
  $('cap-used').textContent = String(p.summary.dead);
  const s = p.summary;
  $('status-label').textContent = s.alive <= 0 ? 'Everyone is gone' : `Live · ${s.alive} alive · ${s.season} ${s.tempC}°C`;
  $('status').classList.toggle('past', s.alive <= 0);
  if (panel === 'stock') renderStock();
  if (panel === 'people') renderPeople();
  if (panel === 'talk') renderConversations();
  if (panel === 'log') renderLog();
}

// How far back the world's record actually reaches. The bar can only look at days
// the payload still carries; past that there is nothing to read, so the range
// stops there rather than promising days the record has already let go.
function recordStart() {
  const p = payload;
  if (!p) return 0;
  const times = [...(p.log || []).map(e => e.t), ...(p.council || []).map(m => m.at), ...(p.conversations || []).map(m => m.t)]
    .filter(t => typeof t === 'number' && t >= 0);
  return times.length ? dayOf(Math.min(...times)) : p.day;
}

// The bar states the day you are looking at: the live one, filling as it passes,
// or a day you have dragged back to — which is over, so it reads full.
function applyDayBar() {
  const live = payload ? payload.day : 0;
  const start = recordStart();
  if (lookingDay !== null && lookingDay < start) lookingDay = start;
  const past = lookingDay !== null && lookingDay < live;
  if (!past) lookingDay = null;
  const shown = past ? lookingDay : live;
  const scrub = $('day-scrub');
  scrub.min = start;
  scrub.max = live;
  scrub.value = shown;
  $('day-bar').classList.toggle('past', past);
  $('day-bar-label').textContent = past ? `Day ${shown + 1} · back to live` : `Day ${shown + 1}`;
  $('day-fill').style.width = `${past ? 100 : Math.min(100, (payload ? payload.minute / 1440 : 0) * 100)}%`;
}
const refreshDayViews = () => {
  if (panel === 'log') renderLog();
  if (panel === 'talk') renderConversations();
};

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
function renderConversations() {
  const day = lookingDay;
  const words = (payload.conversations || []).filter(m => day === null || dayOf(m.t) === day);
  const lens = day === null ? '' : `<p class="muted small">Looking back at day ${day + 1} — the world's record keeps only its recent words.</p>`;
  $('talk').innerHTML = lens + (words.map(m => `
    <div class="talk-item ${m.kind}">
      <div class="muted small">${esc(m.speaker)} <span class="talk-to">to ${esc(m.target)}</span> · ${m.kind === 'agents' ? 'agent' : 'person'}</div>
      <p>${esc(m.text)}</p>
    </div>`).join('') || `<p class="muted small">${day === null ? 'Nobody has said anything yet.' : `Nothing from day ${day + 1} is in the world's record.`}</p>`);
}
function renderLog() {
  const day = lookingDay;                       // null = the live day
  const here = t => day === null || dayOf(t) === day;
  const council = (payload.council || []).filter(m => here(m.at)).map(m => `<li class="council"><span class="muted small">${m.name}</span> ${m.text}</li>`).join('');
  const events = payload.log.filter(e => here(e.t)).map(e => `<li><span class="muted small">day ${dayOf(e.t) + 1}</span> ${e.text}</li>`).join('');
  const lens = day === null ? '' : `<li class="lens"><span class="muted small">day ${day + 1}</span> Looking back — the world's record keeps only its recent events.</li>`;
  $('log').innerHTML = lens + (council + events || `<li class="muted small">Nothing from day ${day + 1} is in the world's record.</li>`);
}
function openPanel(name) {
  panel = panel === name ? null : name;
  $('panel').hidden = !panel;
  document.querySelectorAll('[data-view]').forEach(s => { s.hidden = s.dataset.view !== panel; });
  document.querySelectorAll('[data-panel]').forEach(b => b.classList.toggle('on', b.dataset.panel === panel));
  if (!panel) return;
  $('panel-title').textContent = { people: 'People', talk: 'Talk', stock: 'World', log: 'Log', settings: 'About', account: 'Account' }[panel];
  if (panel === 'people') renderPeople();
  if (panel === 'stock') renderStock();
  if (panel === 'log') renderLog();
  if (panel === 'talk') renderConversations();
  if (panel === 'account') renderAccount();
}

$('assumptions-toggle').addEventListener('click', () => {
  const el = $('assumptions');
  el.hidden = !el.hidden;
});
document.querySelectorAll('[data-panel]').forEach(b => b.addEventListener('click', () => openPanel(b.dataset.panel)));
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => openPanel(panel)));
$('rotate').addEventListener('click', () => renderer && renderer.rotateBy(Math.PI / 4));
$('account-btn').addEventListener('click', () => {
  // Signed out: straight to Google. Signed in: the account panel.
  if (viewer && viewer.email) openPanel('account');
  else location.href = '/api/auth/begin';
});
$('speed').addEventListener('input', e => {
  speedChoice = Math.max(1, Math.min(60, Number(e.target.value) || 1));
  $('speed-label').textContent = speedChoice + '×';
  try { localStorage.setItem('fm.speed', String(speedChoice)); } catch {}
});
// Dragging the timeline is looking, not travelling: the view moves to that hour
// of the day, the world does not. Tapping the label returns to the live clock.
$('scrub').addEventListener('input', e => {
  following = false;
  const m = Math.max(0, Math.min(1439, Number(e.target.value) || 0));
  view.minute = m;
  $('scrub-label').textContent = `${clockOf(m)} · back to live`;
  $('scrub').closest('.timeline')?.classList.add('past');
});
$('scrub-label').addEventListener('click', () => {
  if (following) return;
  following = true;
  $('scrub').closest('.timeline')?.classList.remove('past');
  if (payload) { view.minute = payload.minute; $('scrub').value = payload.minute; $('scrub-label').textContent = `Live ${payload.clock}`; }
});
// Dragging the day bar looks along the days, not through them: you are reading
// the record, and the world is untouched. Tapping the label returns to live.
$('day-scrub').addEventListener('input', e => {
  const live = payload ? payload.day : 0;
  const v = Math.max(recordStart(), Math.min(live, Number(e.target.value) || 0));
  lookingDay = v >= live ? null : v;
  applyDayBar();
  refreshDayViews();
});
$('day-bar-label').addEventListener('click', () => {
  if (lookingDay === null) return;
  lookingDay = null;
  applyDayBar();
  refreshDayViews();
});
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
    // The speed a privileged observer asked for. The server decides whether to
    // honour it; anyone else gets the real pace whatever this says.
    const q = viewer && viewer.canSpeed && speedChoice > 1 ? `?speed=${speedChoice}` : '';
    const res = await fetch('/api/live' + q, { cache: 'no-store' });
    apply(await res.json());
    if (!renderer) {
      renderer = createWorldRenderer($('world'), {
        getWorld: () => view, getSpeed: () => 1,
        activityFor: i => payload.activities[i] || { tile: view.inhabitants[i] || { x: 13, y: 21 }, kind: 'idle' },
        onSelect: hit => selectThing(hit),
        getAgents: () => payload.authors,
        agentActivity: a => payload.authorActivity[payload.authors.indexOf(a)] || null,
        getSpeech: obj => payload.speech[obj.id] || null,
      });
      // QA hooks, in the spirit of v1: let a test drive the renderer without
      // depending on the animation frame.
      window.fm = { renderer, view, payload: () => payload, draw: dt => renderer.draw(dt ?? 0.016), rotate: r => renderer.rotateBy(r), select: selectThing };
    }
  } catch (e) { $('status-label').textContent = 'Offline'; }
  setTimeout(poll, 1000);
}

const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const DOING = {
  idle: 'standing about', walk: 'walking', fetch: 'fetching water', drink: 'drinking',
  forage: 'foraging for food', carry: 'carrying a load home', eat: 'eating', build: 'building',
  shelter: 'sheltering', cower: 'cowering in the open', sleep: 'asleep', 'no-water': 'looking for water',
  gather: 'gathering material', haul: 'hauling it home', talk: 'talking', dying: 'dying',
};
const bar = v => `<span class="bar"><i style="width:${Math.round(Math.max(0, Math.min(1, v)) * 100)}%"></i></span>`;
const recentWords = id => (payload.conversations || []).filter(m => m.speakerId === id).slice(0, 2)
  .map(m => `<p class="quote">“${esc(m.text)}”<span class="muted small"> to ${esc(m.target)}</span></p>`).join('');

// Every clickable thing answers with a card. A person, an author, and the thing
// an author designed all have one; clicking empty ground closes it.
function selectThing(hit) {
  const card = $('card');
  if (renderer && renderer.select) renderer.select(hit);
  if (!hit) { card.hidden = true; return; }
  if (hit.type === 'person') return showPerson(card, hit.id);
  if (hit.type === 'agent') return showAgent(card, hit.id);
  if (hit.type === 'building') return showBuilding(card, hit.id);
  card.hidden = true;
}

function showPerson(card, id) {
  const p = payload.inhabitants.find(i => i.id === id);
  if (!p) { card.hidden = true; return; }
  card.innerHTML = `
    <div class="card-head">
      <canvas class="person"></canvas>
      <div><h3>${esc(p.name)}</h3><p>${p.age} years · health ${p.health} · ${esc(DOING[p.doing] || p.doing)}</p></div>
    </div>
    <div class="need"><span>Thirst</span>${bar(p.thirst)}<span>${Math.round(p.thirst * 100)}%</span></div>
    <div class="need"><span>Hunger</span>${bar(p.starving)}<span>${Math.round(p.starving * 100)}%</span></div>
    <div class="tags">
      <span class="tag">carrying ${p.carrying.water} L of water</span>
      <span class="tag">${p.carrying.food.toLocaleString()} kcal</span>
      ${p.pregnant ? '<span class="tag">pregnant</span>' : ''}
      ${p.children ? `<span class="tag">${p.children} children</span>` : ''}
    </div>
    ${recentWords(p.id)}`;
  paintPerson(card.querySelector('canvas'), p);
  card.hidden = false;
}

function showAgent(card, id) {
  const a = payload.authors.find(x => x.id === id);
  if (!a) { card.hidden = true; return; }
  const mine = payload.buildings.filter(b => b.author === a.name);
  card.innerHTML = `
    <div class="card-head">
      <canvas data-sprite-agent></canvas>
      <div><h3>${esc(a.name)}</h3><p>${esc(a.role || 'author')}${a.model ? ' · ' + esc(a.model) : ''}</p></div>
    </div>
    <p>Designs the world from outside it. It cannot be killed, it does not eat, and it cannot change reality.</p>
    <div class="tags">
      <span class="tag">${a.standing} standing</span>
      <span class="tag">${a.calls} calls spent</span>
    </div>
    ${mine.length ? `<div class="tags">${mine.map(b => `<span class="tag">${esc(b.name)}</span>`).join('')}</div>` : ''}
    ${recentWords(a.id)}
    ${a.design ? `<details><summary>Its latest code</summary><pre>${esc(a.design)}</pre></details>` : ''}`;
  paintAgent(card.querySelector('canvas'), a);
  card.hidden = false;
}

function showBuilding(card, id) {
  const b = payload.buildings.find(x => x.id === id);
  if (!b) { card.hidden = true; return; }
  const state = b.built
    ? `standing${b.author ? ' · designed by ' + esc(b.author) : ''}`
    : `${Math.round(b.progressHours)} of ${b.laborHours} person-hours done${b.author ? ' · designed by ' + esc(b.author) : ''}`;
  card.innerHTML = `
    <div class="card-head">
      <canvas></canvas>
      <div><h3>${esc(b.name)}</h3><p>${state}</p></div>
    </div>
    ${b.description
      ? `<p>${esc(b.description)}</p>`
      : '<p class="muted">The author did not say what this is for.</p>'}
    <div class="tags">
      <span class="tag">${b.mass} kg of material</span>
      ${b.shelter ? `<span class="tag">shelters ${b.shelter}</span>` : ''}
      <span class="tag">tile ${b.x},${b.y}</span>
    </div>
    ${b.program ? `<details><summary>Its program</summary><pre>${esc(b.program)}</pre></details>` : ''}`;
  paintSprite(card.querySelector('canvas'), b);
  card.hidden = false;
}

if (!window.fm) window.fm = {};
window.fm.select = selectThing;

poll();
