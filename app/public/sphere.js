// The world as a planet, drawn from the module's own corners.
//
// The same options interface `createWorldRenderer` in art.js exposes, so app.js swaps
// one factory for the other and nothing else moves: getWorld/getSpeed/activityFor/
// onSelect/getAgents/agentActivity, plus draw/advance/rotateBy/select.
//
// The geometry is not drawn twice: `createPlanet`'s cells carry their own `corners`, so
// a hexagon here is its own polygon — the same polygon `cellRing` outlines and the same
// one the pick answers for, which is why a click and the ring cannot disagree.
//
// A person walks a path on a sphere, not a line on a plane: the drawn position is a
// direction between two cells' centres, re-normalised every frame, so a walk curves the
// way the ground does. With the poles not necessarily up, a cell past the horizon is not
// drawn and cannot be clicked.

import { paintSprite, paintPerson, paintAgent } from './paint.mjs';

const CELL_RAD = 0.085;              // roughly one step of ground at level 14

export function createSphereRenderer(canvas, {
  getWorld, getSpeed = () => 1, activityFor = () => null, onSelect = () => {},
  getAgents = () => [], agentActivity = () => null,
} = {}) {
  const c = canvas.getContext('2d');
  let w = 0, h = 0, dpr = 1, zoom = 1;
  let yaw = 0, yawTarget = 0, pitch = 0.25, pitchTarget = 0.25;
  let selected = null, hit = [], pos = new Map(), sprite = new Map(), people = new Map();
  let layoutVersion = null, geoRef = null, time = 0, prev = performance.now(), running = false;
  const pointers = new Map();
  let drag = null;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const spinCache = { yaw: null, pitch: null, spun: null };

  function resize() {
    dpr = Math.min(2, devicePixelRatio || 1);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  }
  const radius = () => Math.min(w, h) * 0.42 * zoom;

  function spin(p) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const y1 = p[1] * cp - p[2] * sp, z1 = p[1] * sp + p[2] * cp;
    return [p[0] * cy + z1 * sy, y1, -p[0] * sy + z1 * cy];
  }
  const spunFor = planet => {
    if (spinCache.spun && spinCache.yaw === yaw && spinCache.pitch === pitch && spinCache.of === planet) return spinCache.spun;
    const spun = planet.cells.map(cell => spin(cell.centre));
    Object.assign(spinCache, { yaw, pitch, spun, of: planet });
    return spun;
  };
  const project = q => ({ x: w / 2 + q[0] * radius(), y: h / 2 - q[1] * radius(), z: q[2] });
  // The spun centres are the camera's whole idea of where things are, so they are built
  // on demand rather than only inside `draw`: a click, or a test, can arrive first.
  const ensureSpin = () => (geoRef?.planet ? spunFor(geoRef.planet) : null);

  /** Screen point -> a direction on the sphere -> the cell that owns it. */
  function pick(sx, sy) {
    const planet = geoRef?.planet; if (!planet) return null;
    const R = radius();
    const X = (sx - w / 2) / R, Y = -(sy - h / 2) / R;
    const r2 = X * X + Y * Y;
    if (r2 > 1) return null;                       // off the limb: empty sky
    const q = [X, Y, Math.sqrt(1 - r2)];
    const spun = spunFor(planet);
    let best = -2, bestId = -1;
    for (let i = 0; i < spun.length; i++) {
      const s = spun[i], d = s[0] * q[0] + s[1] * q[1] + s[2] * q[2];
      if (d > best) { best = d; bestId = i; }
    }
    return bestId;
  }
  const pickCentre = (planet, id) => project(ensureSpin()[id]);
  const visible = id => { const s = ensureSpin(); return !!s && s[id][2] > 0; };
  const cellRing = id => geoRef.planet.cells[id].corners.map(p => { const q = project(spin(p)); return { x: q.x, y: q.y, front: q.z > 0 }; });

  const view = {
    get pick() { return pick; },
    get spun() { return ensureSpin(); },
    pickCentre: id => pickCentre(geoRef.planet, id),
    visible, cellRing,
    get planet() { return geoRef.planet; },
    get w() { return w; }, get h() { return h; }, get radius() { return radius(); },
  };

  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const f = v => Math.max(0, Math.min(255, Math.round(v * k)));
    return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }
  const colorOf = id => {
    const r = geoRef.regions.find(x => x.id === geoRef.tiles.get(id)?.regionId);
    return r ? r.color : '#8d694a';
  };
  function spriteOf(b) {
    let img = sprite.get(b.id);
    if (!img) { img = document.createElement('canvas'); paintSprite(img, b); sprite.set(b.id, img); }
    return img;
  }
  function personSprite(p) {
    let img = people.get(p.id);
    if (!img) { img = document.createElement('canvas'); paintPerson(img, p); people.set(p.id, img); }
    return img;
  }
  function agentSprite(a) {
    const key = 'a:' + (a.id || '');
    let img = people.get(key);
    if (!img) { img = document.createElement('canvas'); paintAgent(img, a); people.set(key, img); }
    return img;
  }

  /** A walk on a sphere: slide the drawn direction toward the next centre and re-normalise. */
  function glide(id, target, step) {
    let p = pos.get(id);
    if (!p) { p = target.slice(); pos.set(id, p); return p; }
    const d = Math.hypot(target[0] - p[0], target[1] - p[1], target[2] - p[2]);
    if (d > 1e-4 && step > 0) {
      const k = Math.min(1, step / d);
      p[0] += (target[0] - p[0]) * k; p[1] += (target[1] - p[1]) * k; p[2] += (target[2] - p[2]) * k;
      const n = Math.hypot(p[0], p[1], p[2]) || 1; p[0] /= n; p[1] /= n; p[2] /= n;
    }
    return p;
  }

  function easeCamera(dt) {
    const use = reduced.matches ? 1 : Math.min(1, Math.max(0.25, dt) * 10);
    if (yaw !== yawTarget) yaw = Math.abs(yawTarget - yaw) < 0.002 ? yawTarget : yaw + (yawTarget - yaw) * use;
    if (pitch !== pitchTarget) pitch = Math.abs(pitchTarget - pitch) < 0.002 ? pitchTarget : pitch + (pitchTarget - pitch) * use;
  }

  function draw(dt = 0) {
    const world = getWorld();
    const geo = world.geography;
    if (!geo || !geo.planet) return;
    if (geo !== geoRef) {
      geoRef = geo; pos = new Map(); sprite = new Map(); people = new Map();
      spinCache.spun = null;
      yaw = 0; yawTarget = 0; pitch = 0.25; pitchTarget = 0.25; zoom = 1;
    }
    if (layoutVersion !== geo.seed) { layoutVersion = geo.seed; resize(); }
    if (!w || !h) resize();

    const spun = spunFor(geo.planet);
    // The camera eases toward where it is going, and it does so in `draw` rather than in
    // the animation loop, so `rotateBy` + `draw` moves it for a test with no rAF at all.
    easeCamera(dt);
    const style = getComputedStyle(document.documentElement);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.imageSmoothingEnabled = false;
    c.fillStyle = style.getPropertyValue('--map').trim() || '#1d1a16';
    c.fillRect(0, 0, w, h);

    const R = radius();
    // The sea, as the disk it is, then the land on top of it: 838 cells of sea are a
    // colour, not 838 polygons.
    c.beginPath(); c.arc(w / 2, h / 2, R, 0, Math.PI * 2);
    c.fillStyle = colorOf(0) || '#41637a'; c.fill();
    c.save(); c.beginPath(); c.arc(w / 2, h / 2, R, 0, Math.PI * 2); c.clip();

    const front = [];
    for (let i = 0; i < spun.length; i++) if (spun[i][2] > 0) front.push(i);
    front.sort((a, b) => spun[a][2] - spun[b][2]);
    hit = [];
    const camp = geo.camp, spring = new Set(geo.spring || []);
    for (const id of front) {
      const cell = geo.planet.cells[id];
      const region = geo.tiles.get(id)?.regionId;
      const k = 0.62 + 0.45 * spun[id][2];
      c.beginPath();
      for (let j = 0; j < cell.corners.length; j++) {
        const p = project(spin(cell.corners[j]));
        j ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y);
      }
      c.closePath();
      c.fillStyle = region === 'sea' ? shade(colorOf(id), k * 0.98) : shade(colorOf(id), k);
      c.fill();
      c.strokeStyle = region === 'sea' ? 'rgba(0,0,0,0.10)' : 'rgba(0,0,0,0.22)';
      c.lineWidth = 0.6; c.stroke();
      if (spring.has(id)) { c.fillStyle = 'rgba(129,158,149,0.75)'; c.fill(); }
      else if (id === camp) { c.fillStyle = 'rgba(255,240,200,0.18)'; c.fill(); }
      else if (Number.isInteger(camp) && geo.planet.cells[camp].next.includes(id)) { c.fillStyle = 'rgba(255,240,200,0.08)'; c.fill(); }
    }

    // The ring: the picked cell's own polygon, the same corners the pick answers for.
    if (selected && Number.isInteger(selected.at) && geo.planet.cells[selected.at]) {
      const ring = cellRing(selected.at);
      if (ring.every(p => p.front)) {
        c.beginPath();
        ring.forEach((p, j) => (j ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
        c.closePath();
        c.strokeStyle = '#f4e6c4'; c.lineWidth = 2; c.stroke();
      }
    }

    const speed = getSpeed();
    const visual = Math.min(1.2 + (speed || 1) * 0.08, 6);
    const step = Math.min(dt, 0.25) * visual * CELL_RAD;
    const drawables = [];

    for (const b of world.buildings || []) {
      if (!Number.isInteger(b.at)) continue;
      const q = spun[b.at]; if (q[2] <= 0.02) continue;
      const p = project(q);
      drawables.push({ kind: 'building', obj: b, at: b.at, depth: q[2], sx: p.x, sy: p.y });
    }
    (world.inhabitants || []).forEach((person, i) => {
      const act = activityFor(i);
      const target = Number.isInteger(act?.at) ? geo.planet.cells[act.at].centre : spun[person.at];
      const p = glide(person.id, target, step);
      const q = spin(p); if (q[2] <= 0.02) return;
      const s = project(q);
      drawables.push({ kind: 'person', obj: person, at: act?.at ?? person.at, depth: q[2], sx: s.x, sy: s.y, act });
    });
    for (const agent of getAgents()) {
      const act = agentActivity(agent);
      const at = Number.isInteger(act?.at) ? act.at : null;
      if (at === null) continue;
      const p = glide(agent.id, geo.planet.cells[at].centre, step * 0.8);
      const q = spin(p); if (q[2] <= 0.02) continue;
      const s = project(q);
      drawables.push({ kind: 'agent', obj: agent, at, depth: q[2], sx: s.x, sy: s.y, act });
    }
    drawables.sort((a, b) => a.depth - b.depth);
    for (const d of drawables) {
      const scale = 0.55 + 0.75 * d.depth;
      if (d.kind === 'building') {
        const img = spriteOf(d.obj);
        c.drawImage(img, d.sx - 24 * scale, d.sy - 34 * scale, 48 * scale, 48 * scale);
      } else if (d.kind === 'person') {
        if (d.act?.hidden) continue;             // gone: nothing to draw
        const img = personSprite(d.obj);
        c.drawImage(img, d.sx - 8 * scale, d.sy - 20 * scale, 16 * scale, 22 * scale);
      } else {
        const img = agentSprite(d.obj);
        c.drawImage(img, d.sx - 9 * scale, d.sy - 22 * scale, 18 * scale, 24 * scale);
      }
      hit.push(d);
    }
    c.restore();
  }

  function pickAt(sx, sy) {
    let best = null, bestD = 14;
    for (const d of hit) {
      const dd = Math.hypot(d.sx - sx, d.sy - sy);
      if (dd < bestD) { bestD = dd; best = d; }
    }
    if (best) return { type: best.kind, id: best.obj.id, at: best.at };
    const id = pick(sx, sy);
    if (!Number.isInteger(id) || !spinCache.spun || spinCache.spun[id][2] <= 0) return null;   // empty sky
    return { type: 'ground', at: id };
  }

  // --- input ---------------------------------------------------------------------
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    drag = { x: e.offsetX, y: e.offsetY, moved: 0, yaw, pitch };
  });
  canvas.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    const p = pointers.get(e.pointerId); p.x = e.offsetX; p.y = e.offsetY;
    if (!drag || pointers.size > 1) return;
    const dx = e.offsetX - drag.x, dy = e.offsetY - drag.y;
    drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
    if (drag.moved > 4) {
      yaw = yawTarget = drag.yaw + dx * 0.006;
      pitch = pitchTarget = Math.max(-1.35, Math.min(1.35, drag.pitch + dy * 0.005));
    }
  });
  const release = e => {
    pointers.delete(e.pointerId);
    if (drag && drag.moved <= 4 && pointers.size === 0) onSelect(pickAt(e.offsetX, e.offsetY));
    if (pointers.size === 0) drag = null;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', e => { pointers.delete(e.pointerId); drag = null; });
  canvas.addEventListener('wheel', e => { e.preventDefault(); zoom = Math.max(0.6, Math.min(4, zoom * (e.deltaY > 0 ? 0.92 : 1.08))); }, { passive: false });
  addEventListener('resize', resize);

  function frame() {
    if (!running) return;
    const now = performance.now(); const dt = (now - prev) / 1000; prev = now; time += dt;
    draw(dt);
    requestAnimationFrame(frame);
  }

  return {
    draw,
    advance(ms) { time += ms / 1000; draw(ms / 1000); },
    clearCache() { sprite.clear(); people.clear(); pos.clear(); spinCache.spun = null; },
    select(sel) { selected = sel && Number.isInteger(sel.at) ? sel : (sel && sel.id ? sel : null); },
    rotateBy(rad) { yawTarget += rad; },
    get angle() { return yaw; },
    get view() { return view; },
    start() { if (!running) { running = true; prev = performance.now(); requestAnimationFrame(frame); } },
    stop() { running = false; },
  };
}
