# Firstmorrow development source

This source was recovered from production deployment `dpl_GcAhTs1xsnpZ47zPsyRL4P81fUkK` in Vercel project `prj_SgYPXt92l6DGcoLanupudRiRsMuO` on 2026-10-14, then extended locally. No production keys, environment values, or live-world records are included.

## Run and test

Use Node 20 or later. Run `npm ci`, then `npm test`.

For an isolated terrain preview with no model calls or Redis connection:

```sh
FM_PREVIEW=1 FM_GEOGRAPHY=1 PORT=3000 node --watch server.mjs
```

This server uses in-memory storage. It is not the production world and does not survive a server restart.

## Current implementation

- **Geography:** A fixed, repeatable finite mainland fixture, preserving all original 22×22 settlement coordinates. Regions expose separate scenario ratings, not free extractable resources.
- **Migration:** Additive geography and exploration fields. Existing buildings, resources, balances, histories, and time are preserved; unsupported geography versions fail closed.
- **Travel engine:** Internal `startJourney`, `advanceJourneys`, and `cancelJourney` actions. Positions, routes, progress, supplies, and per-inhabitant action sequences persist in the world record.
- **Accounting:** Camp stock is transferred into carried supplies, consumed incrementally for travel and daily survival away from camp, and returned only after physically reaching camp. Conservation checks include carried stocks.
- **Knowledge:** `observe` records local terrain snapshots. `inhabitantView` returns one inhabitant’s observations without the full geography or another inhabitant’s knowledge.
- **Island foundations:** Reserved island footprints, landings, lookout connectivity, geometric sighting validation, and an illustrative recurring visibility cycle. Islands are disabled; sea routes, vessel physics, and boat rendering are not implemented.
- **Persistence:** Atomic state/timeline/static-data commit and token-checked lease release. In-memory behavior, adapter arguments, and actual Lua execution on isolated Redis are tested. Hosted-provider behavior is verified separately during release.

Travel decisions now use a separate typed model contract alongside the unchanged structure builder. `FM_EXPLORATION=1` enables decisions, provided geography and the existing server-side model connection are available. Visitors remain observers; there is no travel command in the public API. The private preview uses no model calls.

### Autonomous scouting pilot

The inhabitant receives their own profile/needs, up to 192 recent observed tiles, observed camp structures, their pack, camp stocks while at camp, and safe known-frontier destinations with round-trip estimates. Other inhabitants' observations and the global geography are omitted. Model output is restricted to `stay`, `scout`, or `return`, a short reason, and offered coordinates for scouting.

One expedition can be underway at once. New decisions are limited to 24 additional model calls per real UTC day, a 720-simulation-minute personal cooldown, and a daylight departure window. Outbound routes are at most 40 tiles. Scout trips include an automatic physical return, so model latency, errors, or a daily call cap cannot strand a normal expedition. Staying is valid and is not replaced with a forced exploration fallback.

Routes use shared landmark/building occupancy, revalidate against changes, and reject sea crossings. Construction preserves the camp, occupied tiles and active travel corridors. An occupied legacy camp anchor is moved to the nearest unoccupied camp tile during migration; structures and resources are never moved. Replayed, stale, invalid and unaffordable decisions fail without applying a journey.

## Scenario defaults

The land fixture is 40×38 tiles with 8 m tiles, enclosing the original settlement. Three reserved islands establish a direct coast sighting and an island-to-island chain; their rectangular footprints are test geometry, not final coastline artwork.

Walking takes two simulated minutes per tile and charges an additional 0.02 L water and 2 kcal per tile. Carrying is capped at 20 kg, with food mass approximated at 3,500 kcal/kg; default departures pack one daily ration plus return-leg effort supplies. These are provisional game assumptions, not validated human-performance claims.

Daily consumption while away uses the inhabitant’s pack. Camp shelters and social building effects do not remotely benefit absent inhabitants. New camps, remote extraction, boats, and building relocation require later milestones.

## Known boundaries

- The production builder still designs structures only, within coordinates 2–19. The additional personal decision contract does not replace it, execute model-supplied travel code, or support permanent relocation.
- Current physical resource production remains tied to the existing settlement. Regional freshwater/material/soil ratings do not yet allocate or replenish physical stocks.
- Ground routes are cardinal and landmass-constrained. Structures occupy their authoritative placement tile; cosmetic sprite overhangs do not create additional collision footprints.
- M4 must replace immutable building location assumptions where relocation requires it. Preserve current IDs and timeline records.
- Geographic visibility uses a bounded, flat-grid line test and landmass occlusion, not a 3D horizon model.
- Legacy import explicitly rejects expanded worlds to prevent silently discarding carried resources and journeys.
- `FM_GEOGRAPHY=1` enables additive migration; disabling it does not remove geography already saved. It is not a rollback mechanism.

## Production migration and recovery

On 2026-10-14, the user authorized the routing and AI exploration batch and publication to `firstmorrow.world`. The intended pilot flags are `FM_GEOGRAPHY=1` and `FM_EXPLORATION=1`; islands stay disabled. This enables the documented 40×38 mainland fixture and short scouting, not remote production, relocation, weather or boats.

The preceding foundation release was `dpl_8xz2QzLsjVE18aL28htn83goou7V`, source `335ac632f729dc64d4d49fb3a91d613472d9dcab`, with geography disabled. Consult the root hand-off and bug tracker for the latest deployment receipt.

The migration commit now captures the previous `fm:core`, `fm:live`, `fm:b` and `fm:days` in the private Redis string `fm:backup:pre-exploration-v1`, in the same lock-token-checked Lua operation. No other writer can intervene between backup and migration. Existing backup keys fail closed rather than being overwritten. The public API does not expose backups.

This atomic checkpoint supersedes the earlier pause/export procedure for this specific additive migration. It is a same-store rollback checkpoint, not an independent disaster-recovery backup. It is created only for an existing world; a new isolated preview has nothing to back up.

Release checks: run `npm test` with `redis-server` installed so actual Lua and isolated backup/restore tests do not skip. Run `node tests/live-clone-pilot.mjs /private/path/capture.json` on a read-only `{live,statics}` capture. That pilot performs two simulation days and repeated persistence round-trips, with controlled decisions and no production writes or model calls.

Recovery procedure:

1. Prefer disabling only new decisions with `FM_EXPLORATION=0`; existing journeys still advance and return. `FM_GEOGRAPHY=0` does not undo an existing migration.
2. If writes must stop, deploy this version with `FM_MAINTENANCE=1`. Both scheduler and visitor-triggered ticks become read-only. Wait for pre-maintenance requests to finish and confirm the lock is no longer held.
3. Privately read the backup through authenticated Redis administration. `validateMigrationBackup` in `lib/recovery.mjs` validates schema, static joins, timeline and live consistency, and computes a SHA-256 digest. Do not place the bundle in GitHub, project files or a public endpoint.
4. Restore into an isolated database first. The integration suite demonstrates exact state and timeline restoration using the same bundle format.
5. Production restoration is an operator action requiring a fresh review of the data to be replaced. Reconcile progress after the checkpoint first; never silently discard it. There is deliberately no publicly callable restore route.
