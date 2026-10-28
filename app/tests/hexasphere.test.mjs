// The planet's geometry, and the two numbers that must not stay as grid literals.
//
// These checks are deliberately projection-free: the tiling is proved with spherical
// excess (the angles of a cell's own polygon must add up to its area), so a bug in a
// camera or a renderer cannot make a broken world look correct here.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPlanet, cellDistance, cellsWithin, campsite, springFor, budgetFor, scaleOf,
  landmasses, landmassOf, SPRING, CELL_M,
} from '../public/hexasphere.mjs';

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = v => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };

/**
 * The area of a cell's own spherical polygon, by Girard's theorem: the angles minus
 * (corners - 2) pi. Every cell's area summed must be the whole sphere, 4 pi.
 *
 * The angle at a corner is measured between the two arcs leaving it, which means the
 * direction to a neighbour has to be projected into the corner's own tangent plane
 * first. Using the raw difference of two unit vectors leaves a radial component and
 * reports the angle of a flat polygon, which makes every cell look flat and the sum
 * come out at zero instead of the sphere.
 */
function sphericalArea(corners) {
  const k = corners.length;
  let sum = 0;
  for (let i = 0; i < k; i++) {
    const v = corners[i];
    const toward = j => {
      const d = sub(corners[(i + j + k) % k], v);
      return norm(sub(d, v.map(x => x * dot(d, v))));
    };
    const prev = toward(-1), next = toward(1);
    sum += Math.atan2(Math.hypot(...cross3(prev, next)), dot(prev, next));
  }
  return sum - (k - 2) * Math.PI;
}
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

test('a planet has ten n squared plus two cells, and it is twelve pentagons', () => {
  for (const n of [2, 4, 8, 14]) {
    const P = createPlanet({ subdivisions: n });
    assert.equal(P.cells.length, 10 * n * n + 2, `n=${n}`);
    assert.equal(P.pentagons.length, 12, `n=${n} must have exactly twelve pentagons`);
    assert.ok(P.cells.every(c => c.next.length === 5 || c.next.length === 6), 'five or six neighbours, nothing else');
    assert.ok(P.cells.every(c => Math.abs(Math.hypot(...c.p) - 1) < 1e-9), 'every cell sits on the sphere');
  }
});

test('every cell can be walked to from every other, over neighbours that agree', () => {
  const P = createPlanet({ subdivisions: 8 });
  for (const c of P.cells) for (const j of c.next) {
    assert.ok(P.neighbours[j].includes(c.id), `${c.id} and ${j} must agree they neighbour`);
    assert.notEqual(j, c.id);
  }
  const seen = new Set([0]);
  const stack = [0];
  while (stack.length) for (const j of P.neighbours[stack.pop()]) if (!seen.has(j)) { seen.add(j); stack.push(j); }
  assert.equal(seen.size, P.cells.length, 'one connected world');
});

test('the cells tile the sphere exactly, with nothing double owned and nothing left out', () => {
  // The bug this pins: corners at edge midpoints leave the middle quarter of every
  // subdivision triangle owned by nobody, so three quarters of the world fall out of
  // the map and a click between two cells belongs to neither.
  for (const n of [4, 8, 14]) {
    const P = createPlanet({ subdivisions: n });
    let total = 0;
    for (const c of P.cells) total += sphericalArea(c.corners);
    assert.ok(Math.abs(total - 4 * Math.PI) < 1e-6, `n=${n}: cells cover ${(total / (4 * Math.PI)).toFixed(4)} of the sphere`);
  }
  // Adjacent cells share the corners between them, so no gap can open along an edge.
  const P = createPlanet({ subdivisions: 6 });
  let pairs = 0;
  for (const c of P.cells) for (const j of c.next) {
    if (j < c.id) continue;
    pairs++;
    const other = P.cells[j].corners;
    assert.ok(c.corners.some(a => other.some(b => Math.hypot(...sub(a, b)) < 1e-9)), `${c.id}/${j} share a corner`);
  }
  assert.ok(pairs > 0);
});

test('the twelve pentagons sit where the icosahedron corners were, and never touch', () => {
  const n = 6;
  const P = createPlanet({ subdivisions: n });
  const dists = P.pentagons.map(id => cellDistance(P, P.pentagons[0], id));
  assert.ok(dists.every(d => d % n === 0 && d <= 3 * n), `pentagon spacing must be n, 2n or 3n: ${dists}`);
  assert.ok(dists.every(d => d !== 1), 'no pentagon touches another pentagon');
  for (const id of P.pentagons) {
    assert.equal(P.cells[id].next.length, 5);
    assert.ok(P.cells[id].ring.length === 5, 'a pentagon opens five neighbours, not six');
    assert.ok(P.neighbours[id].every(j => P.neighbours[j].length === 6), 'every pentagon is ringed by hexagons');
  }
});

test('the land is the land: the same regions, finite, and every kind present', () => {
  const P = createPlanet({ seed: 2049, subdivisions: 14 });
  const counts = {};
  for (const c of P.cells) counts[c.regionId] = (counts[c.regionId] || 0) + 1;
  for (const id of ['sea', 'coast', 'scrub', 'interior', 'rock']) assert.ok(counts[id] > 0, `${id} exists on the planet`);
  assert.ok(P.land > 0 && P.land < P.cells.length, 'there is land and there is sea');
  for (const c of P.cells) {
    for (const k of ['water', 'soil', 'material', 'potable', 'food']) {
      assert.ok(Number.isFinite(c[k]) && c[k] >= 0, `${k} on cell ${c.id}`);
    }
    assert.ok(c.potable <= c.water, 'nobody drinks more than there is');
  }
  assert.equal(P.springs.length, P.cells.filter(c => c.potable > 0).length);
  assert.equal(P.forage.length, P.cells.filter(c => c.food > 0).length);
  assert.equal(P.cellM, CELL_M);
});

test('the camp is on the coast with water it can walk to, and it is the seed that picks it', () => {
  for (const seed of [2049, 7, 12345]) {
    const P = createPlanet({ seed, subdivisions: 14 });
    const camp = campsite(P);
    assert.equal(camp, campsite(createPlanet({ seed, subdivisions: 14 })), 'the same seed picks the same camp');
    assert.equal(P.cells[camp].regionId, 'coast');
    assert.ok(P.cells[camp].next.filter(j => P.cells[j].regionId !== 'sea').length >= 4, 'there is ground around it');
    const near = [...cellsWithin(P, camp, 3)].filter(([id, d]) => d > 0 && P.cells[id].potable > 0);
    assert.ok(near.length > 0, 'there is water within three steps, so it is inside sight');
  }
});

test('the spring is four cells, visible from camp, and the only water in reach of it', () => {
  const P = createPlanet({ seed: 2049, subdivisions: 14 });
  const camp = campsite(P);
  const spring = springFor(P, camp);
  assert.ok(spring, 'there is a spring');
  assert.equal(cellDistance(P, camp, spring.at), SPRING.steps, 'three steps out, so it is seen from camp');
  assert.ok(cellDistance(P, camp, spring.at) <= 6, 'inside sight');
  assert.equal(spring.cells.length, SPRING.spread + 1, 'four cells, because one body stands on one tile');
  assert.ok(!spring.cells.includes(camp), 'the camp is not the spring');
  for (const id of spring.cells) {
    const t = P.cells[id];
    assert.notEqual(t.regionId, 'sea', `${id} is land`);
    assert.equal(t.regionId, 'scrub');
    assert.equal(t.potable, SPRING.potable);
    assert.ok(Number.isFinite(t.soil) && Number.isFinite(t.material), 'the spring is made of something');
  }
  const total = spring.cells.reduce((a, id) => a + P.cells[id].potable, 0);
  assert.equal(total, (SPRING.spread + 1) * SPRING.potable, 'finite, and countable');
  assert.ok(P.springs.includes(spring.at), 'and it is in the index of places to drink');
  // It is drinkable, and finite: the index and the reserves are the same fact.
  assert.equal(P.cells[spring.at].potable, SPRING.potable);
});

test('the reach and the author\'s writ are distances, and a bigger world is a bigger world', () => {
  // The failure this pins: someone re-deriving these as a share of the world and
  // quietly stretching every leg and every author's writ when the level changes. A
  // person walks 8 m a step, so 24 steps is 192 m of walking for water at every level.
  const seen = [];
  for (const n of [8, 14, 32]) {
    const P = createPlanet({ seed: 2049, subdivisions: n });
    const camp = campsite(P);
    const b = budgetFor(P, camp);
    assert.ok(b.span > 4, 'the world is bigger than the camp');
    assert.ok(b.writ < b.reach, `writ ${b.writ} must sit inside reach ${b.reach}`);
    assert.ok(b.reach <= b.span && b.writ <= b.span, 'nobody reaches past the world');
    seen.push({ n, ...b });
  }
  const at14 = seen.find(s => s.n === 14);
  assert.equal(at14.reach, 24, 'the reach is the same 192 m it always was');
  assert.equal(at14.writ, 16, 'and so is the writ');
  // The rectangle's shares were 77% and 52% of a 31 step walk. The planet's land
  // more than doubled, so the same legs hold a smaller share of it.
  assert.ok(at14.reachShare > 0.25 && at14.reachShare < 0.45, `reach covers ${(at14.reachShare * 100).toFixed(0)}% of the walk out of camp`);
  assert.ok(at14.writShare < at14.reachShare, 'and the writ stays inside it');
  const small = seen.find(s => s.n === 8);
  assert.ok(small.reachShare > at14.reachShare, 'a smaller world is a bigger share of it');
  const big = seen.find(s => s.n === 32);
  assert.ok(big.span > at14.span * 2, 'a bigger level really is a bigger world');
  assert.ok(big.reachShare < at14.reachShare, `and the camp holds a smaller share of it (${big.reachShare.toFixed(2)} < ${at14.reachShare.toFixed(2)})`);
  // A camp can still live at the level the world is built at.
  const P = createPlanet({ seed: 2049, subdivisions: 14 });
  const camp = campsite(P);
  const b = budgetFor(P, camp);
  const insideReach = [...cellsWithin(P, camp, b.reach)].filter(([id, d]) => d > 0 && P.cells[id].potable > 0);
  assert.ok(insideReach.length > 0, 'water within reach');
  const insideWrit = [...cellsWithin(P, camp, b.writ)].filter(([id]) => P.cells[id].regionId !== 'sea');
  assert.ok(insideWrit.length > 8, 'an author has somewhere to build');
});

test('distance is steps over neighbours, and it agrees with itself', () => {
  const P = createPlanet({ subdivisions: 8 });
  const a = 0;
  assert.equal(cellDistance(P, a, a), 0);
  for (const j of P.neighbours[a]) assert.equal(cellDistance(P, a, j), 1);
  assert.equal(cellDistance(P, a, P.neighbours[a][0]), cellDistance(P, P.neighbours[a][0], a), 'symmetric');
  const near = cellsWithin(P, a, 4);
  for (const [id, d] of near) assert.equal(cellDistance(P, a, id), d, 'the ball and the distance agree');
  // A ball of radius r is 1 + 3r(r+1) cells on a hexagon, and 1 + 5r(r+1)/2 on a
  // pentagon, because the missing wedge is missing from every ring. A hexagon near a
  // pentagon loses wedge cells too, so pick one the pentagons cannot reach.
  assert.equal(cellsWithin(P, P.pentagons[0], 3).size, 31, 'a radius 3 ball at a pentagon');
  const far = P.cells.find(c => c.next.length === 6 && P.pentagons.every(p => cellDistance(P, p, c.id, 8) > 3));
  assert.ok(far, 'there is a hexagon out of the pentagons\' reach');
  assert.equal(cellsWithin(P, far.id, 3).size, 37, 'a radius 3 ball on a hexagon');
  assert.equal(cellsWithin(P, far.id, 1).size, 7, 'and the camp around it is seven cells, not nine');
});

test('the camp and the spring stand on the one landmass, so nobody lives on an islet', () => {
  // A rectangle's edge was a wall you could see coming. On a planet the land ends in
  // water, and a cell or two of land in the middle of the sea is a place a newborn
  // could be put with nowhere to walk. The rule is to stay on the camp's landmass.
  const P = createPlanet({ seed: 2049, subdivisions: 14 });
  const camp = campsite(P);
  const spring = springFor(P, camp);
  const masses = landmasses(P);
  const home = landmassOf(P, camp);
  assert.equal(masses[0].size, home.size, 'the camp is on the largest landmass');
  assert.ok(home.size > P.land * 0.9, 'and the land is one continent, as it is on every level measured');
  assert.equal(landmassOf(P, spring.at).size, home.size, 'the spring is on it too');
  assert.ok(cellsWithin(P, camp, 24).size > 100, 'the camp has somewhere to live and walk');
  assert.equal(landmassOf(P, P.cells.find(c => c.regionId === 'sea').id), null, 'the sea is not a landmass');
  // The islets exist, and nothing places anyone on them by accident.
  const islets = masses.slice(1);
  assert.ok(islets.every(m => m.size < 10), `islets are islets: ${islets.map(m => m.size).join(', ')}`);
});

test('the planet is small, and how small is arithmetic, not an opinion', () => {
  const s14 = scaleOf(createPlanet({ subdivisions: 14 }));
  const s64 = scaleOf(createPlanet({ subdivisions: 64 }));
  assert.ok(s14.acrossM > 150 && s14.acrossM < 220, `${s14.acrossM.toFixed(0)} m across at level 14`);
  assert.ok(s64.acrossM > 800 && s64.acrossM < 900, `${s64.acrossM.toFixed(0)} m across at level 64`);
  assert.equal(s14.cellM, 8);
});
