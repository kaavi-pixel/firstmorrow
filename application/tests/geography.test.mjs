import test from 'node:test';
import assert from 'node:assert/strict';
import { freshWorld, settleDay, worldSnapshot } from '../public/core.js';
import { conservationErrors } from '../public/physics.js';
import {
  createGeography, migrateGeography, terrainAt, findLandRoute,
  validateIslandDiscovery, visibleIslands, visibilityAt, CLEAR_WINDOW_MINUTES
} from '../public/geography.js';
import { freshState, splitState, joinState, advance, daySnapshot } from '../lib/sim.mjs';
import { createWorldService, memoryKv } from '../lib/world.mjs';
import { runBehavior } from '../lib/runner.mjs';

test('feature off preserves legacy object and bytes', () => {
  const w = freshWorld(), before = JSON.stringify(w);
  assert.equal(migrateGeography(w), w);
  assert.equal(JSON.stringify(w), before);
});
test('migration is additive, immutable, idempotent and round-trips', () => {
  const w = freshWorld();
  w.buildings.push({ id: 'existing', x: 8, y: 12, built: false, progressHours: 7,
    laborHours: 20, sprite: [], physical: {}, code: 'return {};' });
  const before = structuredClone(w), migrated = migrateGeography(w, { enabled: true });
  const { geography, exploration, extensionMigration, ...legacy } = migrated;
  assert.deepEqual(w, before); assert.deepEqual(legacy, before);
  assert.equal(migrateGeography(migrated, { enabled: true }), migrated);
  const state = { ...freshState(10), world: migrated, staticCount: 1 };
  const { core, statics } = splitState(state);
  assert.deepEqual(joinState(core, Object.fromEntries(statics.map(s => [s.id, s]))), state);
  assert.equal(exploration.positions.p0.x, 11);
});
test('unknown geography version fails closed', () => {
  assert.throws(() => migrateGeography({ geography: { version: 99 } }, { enabled: true }), /Unsupported/);
});
test('authored terrain is repeatable and all original tiles remain mainland', () => {
  const g = createGeography();
  assert.deepEqual(g, createGeography());
  for (let y = 0; y < 22; y++) for (let x = 0; x < 22; x++)
    assert.equal(terrainAt(g, x, y).landmass, 'mainland');
  assert.equal(terrainAt(g, 63, 2), null);
  assert.equal(terrainAt(g, NaN, 2), null);
  assert.equal(terrainAt(g, 32, 14).kind, 'sea');
});
test('V01 mainland has no universally dominant region', () => {
  const rs = createGeography().regions.slice(0, 4), positive = ['freshwater', 'soil', 'materials'];
  const dominates = (a, b) => Object.keys(a).every(k => positive.includes(k) ? a[k] >= b[k] : a[k] <= b[k])
    && Object.keys(a).some(k => a[k] !== b[k]);
  for (const r of rs) assert.equal(rs.filter(other => other !== r).every(other => dominates(r.properties, other.properties)), false);
});
test('mainland walking routes are cardinal and cannot cross sea', () => {
  const g = createGeography(), route = findLandRoute(g, { x: 11, y: 11 }, { x: 29, y: 14 });
  assert.equal(route.length, 22);
  for (let i = 1; i < route.length; i++)
    assert.equal(Math.abs(route[i].x-route[i-1].x)+Math.abs(route[i].y-route[i-1].y), 1);
  assert.equal(findLandRoute(g, { x: 11, y: 11 }, { x: 36, y: 14 }), null);
  assert.throws(() => findLandRoute(g, { x: .5, y: 1 }, { x: 2, y: 2 }), /Invalid/);
});
test('V16/V17 geometry: all islands connected and outer land cannot be seen from mainland', () => {
  const report = validateIslandDiscovery(createGeography());
  assert.equal(report.valid, true, report.errors.join('; '));
  assert.equal(report.reached.length, 4);
  assert.deepEqual(report.mainlandVisible, ['near-island']);
  assert.ok(report.edges.some(e => e.from === 'near-island' && e.to === 'outer-island'));
  assert.ok(report.edges.some(e => e.from === 'outer-island' && e.to === 'south-island'));
});
test('island graph rejects invalid lookouts and disconnected terrain', () => {
  const g = createGeography();
  g.islands[1].lookouts = [{ x: 0, y: 0 }];
  const report = validateIslandDiscovery(g);
  assert.equal(report.valid, false);
  assert.ok(report.errors.some(e => e.includes('Unreachable lookout')));
  assert.ok(report.errors.some(e => e.includes('no discovery chain')));
});
test('islands remain unavailable before marine release; sightings contain no resources', () => {
  const g = createGeography();
  assert.deepEqual(visibleIslands(g, { x: 29, y: 14 }, 0), []);
  g.islandsEnabled = true;
  const sightings = visibleIslands(g, { x: 29, y: 14 }, 0);
  assert.equal(sightings.length, 1);
  assert.deepEqual(Object.keys(sightings[0]).sort(), ['bearingDegrees', 'distanceTiles', 'id', 'silhouette']);
});
test('V19 clear conditions recur within six simulated hours', () => {
  for (let start = 0; start < 1440; start++) {
    let found = false;
    for (let d = 0; d < CLEAR_WINDOW_MINUTES; d++) if (visibilityAt(start+d).clear) { found = true; break; }
    assert.equal(found, true);
  }
});
test('legacy proposal snapshot does not leak reserved geography', () => {
  const w = migrateGeography(freshWorld(), { enabled: true });
  const input = worldSnapshot(w);
  assert.equal(input.geography, undefined);
  assert.equal(input.exploration, undefined);
});
test('baseline: ten daily water rations and 45 daily food rations, unchanged by migration', () => {
  const w = migrateGeography(freshWorld(), { enabled: true });
  for (let i = 0; i < 10; i++) settleDay(w, []);
  assert.equal(w.resources.water, 0);
  assert.equal(w.resources.food, 367500);
  for (const error of Object.values(conservationErrors(w))) assert.ok(Math.abs(error) < 1e-8);
});
test('baseline: repeating advance time does not apply simulation twice', async () => {
  const s = freshState(0), run = () => ({ actions: {}, needs: [] });
  await advance(s, 10000, run);
  const before = JSON.stringify(s);
  await advance(s, 10000, run);
  assert.equal(JSON.stringify(s), before);
});
test('world service persists extension and reloads without changing resources', async () => {
  const kv = memoryKv();
  const service = createWorldService({ kv, propose: null, clock: () => 100, geographyEnabled: true });
  await service.tick();
  const first = await service.load();
  assert.equal(first.world.geography.version, 1);
  const restarted = createWorldService({ kv, propose: null, clock: () => 100, geographyEnabled: true });
  assert.deepEqual(await restarted.load(), first);
  assert.equal(daySnapshot(first, 0).geographyVersion, 1);
  assert.equal(daySnapshot(freshState(0), 0).geographyVersion, null);
});
test('default world service remains legacy', async () => {
  const service = createWorldService({ kv: memoryKv(), propose: null, clock: () => 100 });
  await service.tick();
  assert.equal((await service.load()).world.geography, undefined);
});
test('baseline sandbox blocks host access and returns bounded effects', () => {
  assert.deepEqual(runBehavior('return {actions:{},needs:[]}', {}, {}), { actions: {}, needs: [] });
  assert.throws(() => runBehavior('return process.env;', {}, {}), /process/);
});
