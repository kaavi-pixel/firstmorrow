# Development progress

Original prompt: Continue with the Firstmorrow implementation plan, including mainland regional trade-offs and boat-accessible islands with guaranteed sighting chains.

## Current increment: obstacle-aware autonomous scouting

User authorized implementation and publication on 2026-10-14. Preserve the existing world and builder; enable mainland exploration only, not boats or resource extraction.

QA inventory for this increment:

- Routes avoid buildings and landmarks, permit empty access gaps, and revalidate obstacles before stepping.
- Migration chooses an unoccupied camp anchor without moving a legacy structure or changing stocks.
- The model receives only the deciding inhabitant's observations and offered frontier coordinates.
- Stay/scout/return contracts reject unknown destinations, extra fields, stale replies and replays.
- Scouting transfers conserved supplies, advances one tile at a time, and physically returns without another model call.
- Decision reasoning, outcome, observed tile count and carried supplies appear in person cards; events appear in the log.
- Real Redis creates a consistent, non-overwriting migration backup in the migration commit itself; restore is tested only on an isolated Redis child.
- Desktop 1440×900 and mobile 390×844: initial map, person card, World/physics balances, log, settings, light/dark, rotation, pan, zoom, timeline and dismiss actions.
- Off-happy paths: blocked routes, depleted camp reserve, expired requests, duplicate responses, private-knowledge isolation and occupied backup keys.
- Production signoff: health, retained building IDs, advancing time, geography/feature flags, balance discrepancies, browser errors, model-decision result when the next eligible window occurs.

## Baseline

Recovered the production source from deployment `dpl_GcAhTs1xsnpZ47zPsyRL4P81fUkK`, project `prj_SgYPXt92l6DGcoLanupudRiRsMuO`, on 2026-10-14. No production environment values or live-world data were downloaded. The deployed source excludes tests; baseline tests must be reconstructed rather than described as recovered.

Preserve the current pixel-art renderer and interface. Keep expanded geography disabled by default; do not mutate production storage or deploy without authorization.

## QA inventory

- Legacy state is unchanged when the feature is disabled.
- Existing structure IDs, coordinates, resources, balances, simulation time, and histories survive explicit geography migration.
- Regional trade-offs and traversable access are deterministic.
- Individual observations do not expose hidden geography.
- Journeys consume simulated time and tracked supplies, survive save/reload, and cannot be replayed or duplicated.
- Island sightlines form a mainland-rooted directed graph, including mainland-visible and island-only targets; sea travel remains unavailable until vessel validation is implemented.
- Desktop/mobile renderer preserves selection, pan, zoom, rotation, theme, and panels.
- Off-happy paths: unsupported saved schema, bad coordinates, disconnected islands, repeated actions, insufficient provisions, and interrupted persistence.

## Implementation increment

Added geography and exploration modules, feature-gated additive migration, regional rendering, carried-stock conservation, daily per-person consumption away from camp, persistent land journeys, cancellation/return semantics, local observations, and private inhabitant views. Added lease-checked atomic persistence adapters; actual Redis scripts still need staging execution.

`npm test` passes 29 tests. The browser preview is isolated, makes no model calls, and explicitly labels itself as a development preview. Desktop and mobile QA exercised rotation, zoom, people selection, panels, theme, and API rejection paths; no page errors were observed.

Outstanding: fine obstacle routing, model-action integration, regional physical stock allocation, relocation/salvage, weather feedback, and all vessel functionality. Do not deploy this increment to production or claim the complete implementation plan is finished.
