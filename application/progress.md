# Development progress

Original prompt: Continue with the Firstmorrow implementation plan, including mainland regional trade-offs and boat-accessible islands with guaranteed sighting chains.

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
