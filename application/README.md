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

Travel actions are implemented as internal functions and integrated into the simulation tick, but are not yet exposed through the model proposal contract or a visitor control. The public preview therefore shows regional terrain, not autonomous expeditions.

## Scenario defaults

The land fixture is 40×38 tiles with 8 m tiles, enclosing the original settlement. Three reserved islands establish a direct coast sighting and an island-to-island chain; their rectangular footprints are test geometry, not final coastline artwork.

Walking takes two simulated minutes per tile and charges an additional 0.02 L water and 2 kcal per tile. Carrying is capped at 20 kg, with food mass approximated at 3,500 kcal/kg; default departures pack one daily ration plus return-leg effort supplies. These are provisional game assumptions, not validated human-performance claims.

Daily consumption while away uses the inhabitant’s pack. Camp shelters and social building effects do not remotely benefit absent inhabitants. New camps, remote extraction, boats, and building relocation require later milestones.

## Known boundaries

- The production builder still proposes structures only, within coordinates 2–19. M3 must introduce a validated decision/action contract before inhabitants autonomously use travel.
- Current physical resource production remains tied to the existing settlement. Regional freshwater/material/soil ratings do not yet allocate or replenish physical stocks.
- Ground routes are cardinal and landmass-constrained. Fine collision against structure footprints and a shared obstacle map remain to be integrated before autonomous travel is enabled.
- M4 must replace immutable building location assumptions where relocation requires it. Preserve current IDs and timeline records.
- Geographic visibility uses a bounded, flat-grid line test and landmass occlusion, not a 3D horizon model.
- Legacy import explicitly rejects expanded worlds to prevent silently discarding carried resources and journeys.
- `FM_GEOGRAPHY=1` enables additive migration; disabling it does not remove geography already saved. It is not a rollback mechanism.

## Production migration and recovery gate

The user has authorized a production release. The conservative release keeps `FM_GEOGRAPHY=0`, preserving the current world schema and geography while shipping the tested source and reliability fixes; autonomous travel and boats are not exposed.

Enabling geography later remains a separate migration gate. Source recovery is not a live-data backup, and passing local Redis tests is not production certification.

Before a production migration:

1. Obtain approval for the specific project, code version, feature flags, and migration.
2. Run the Redis scripts on a separate staging store, including lease expiry, wrong key types, concurrent workers, interrupted requests, and all-or-nothing visibility of state and timeline records.
3. Pause scheduled and visitor-triggered writes through an explicit maintenance gate. Capture a consistent backup of `fm:core`, `fm:live`, `fm:b`, and `fm:days`; record key types and integrity hashes in private storage.
4. Test restoring that snapshot into staging. Apply the additive migration there and compare original coordinates, IDs, stocks, balances, time, and historical days.
5. Deploy first with migration off, verify the existing world, then enable only the approved feature set. Resume writers only after checks pass.
6. If recovery is needed before new progress, restore the verified backup while writes remain paused. After new progress exists, stop writes and reconcile that progress before any restore; do not silently discard it.

The maintenance/export/restore tooling and staging Redis validation are outstanding release work. Do not represent this procedure as already executed.
