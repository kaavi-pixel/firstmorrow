# Firstmorrow: Land Extension Hand-off

Updated: 2026-10-14. Current work: M0 release-safety decisions, M1 terrain foundations, and M2 internal travel.

This is the live progress record for the land-extension work. Scope, task definitions, dependencies, and acceptance scenarios live in `implementation-plan.md`; this document records what has actually been done and what the next implementer should do.

## Current state

- **Approved direction:** Kavi accepted all recommendations from the land-extension review: competing regional advantages, need-driven exploration, physical relocation, practical reasons to stay, survivable starting conditions, and causal environmental changes.
- **Planning complete:** The implementation plan and this progress tracker have been created. The original feature proposal remains unchanged.
- **Island direction added:** Plan a large Tasmania-inspired island and smaller boat-accessible islands. Some must be visible from the mainland, others only from neighboring islands; every island must have a mainland-rooted physical discovery path.
- **Implementation evidence:** Source inspected and recovered into `application/`. The new local suite has 29 passing tests covering geography, additive migration, travel, knowledge isolation, resource accounting, interruption, lock ownership, and sandbox baseline behavior.
- **Available project files:** Planning documents plus the recovered and modified application source, package lock, tests, development notes, and recovery procedure. Dependencies and environment files are excluded from persistence.
- **Verified architecture:** Vercel entry point, Redis storage, QStash scheduler, QuickJS sandbox, plain JavaScript/Canvas frontend, one AI structure builder, and five modeled inhabitants. Existing characters had visual activity but no durable travel before this increment.
- **Working locally:** Feature-gated regional terrain, carried supplies, internal land-journey actions, timestamped individual observations, and atomic persistence adapter. The preview makes no model calls and uses only an isolated in-memory world.
- **Not implemented:** AI travel decisions, fine obstacle collision, regional resource production, relocation/salvage, dynamic environmental effects, and actual boats. Island geometry and sighting validation are foundations only.
- **Release state:** No deployment or live-world migration has been performed or authorized by this planning task.
- **Release request update:** Kavi subsequently requested a GitHub repository, bug tracker, and publication to the existing domain. Private repository created at `https://github.com/kaavi-pixel/firstmorrow`; source push and conservative deployment are being prepared. Geography migration will remain disabled.

## Resume here

Continue in the existing `application/` source. Do not download the old app again, create a separate simulation, or replace the live world.

1. Run `npm ci` and `npm test`; read `application/README.md` for the exact implemented boundaries.
2. Finish LE-20A by unifying walking obstacles with the existing construction/terrain restrictions, including a safe camp origin when legacy buildings occupy its anchor.
3. Finish LE-20D by enforcing `inhabitantView` at the new model-action boundary; then implement M3 without replacing the existing structure-generation contract.
4. Real Redis Lua integration now passes locally, including expired leases and wrong key types. Verify hosted-provider behavior and continued world advancement during release.
5. Resolve remaining visible-map and migration policy choices before production. Follow the explicit backup/restore and authorization gate in the application README.

Authoritative source baseline: Vercel deployment `dpl_GcAhTs1xsnpZ47zPsyRL4P81fUkK`, project `prj_SgYPXt92l6DGcoLanupudRiRsMuO`, team `firstmorrow`. The older Perplexity app identity is `5fde9033-a18b-4fe9-bc3d-94e0fe2b3abc`; its source download was unavailable, so the source was recovered through authenticated deployment-file reads instead.

## Milestone tracker

Allowed status values: `not_started`, `in_progress`, `blocked`, `done`. Only use `done` with evidence that the milestone’s exit gate passed.

| Milestone | Status | Tasks | Evidence / blocker |
|---|---|---|---|
| M0: Discovery | in_progress | LE-00A–LE-00D | A/B/D complete; remaining decisions and live recovery validation not approved |
| M1: Terrain and start | in_progress | LE-10A–LE-10D | Code-level fixtures and V01/V02 pass; final visible scope/M0 gate outstanding |
| M2: Travel and knowledge | in_progress | LE-20A–LE-20D | Internal journey/observation engine tested; obstacles and model boundary outstanding |
| M3: Autonomous decisions | not_started | LE-30A–LE-30D | Depends on M2 |
| M4: Migration and salvage | not_started | LE-40A–LE-40D | Depends on M3 and construction contract |
| M5: Weather and observer UI | not_started | LE-50A–LE-50D | Depends on M1; observer integration needs M2–M4 |
| M6: Core validation/release | not_started | LE-60A–LE-60D | Depends on M1–M5 |
| M7: Follow-ups | not_started | LE-70A–LE-70D | Depends on M6 |
| M8: Islands and boats | in_progress | LE-80A–LE-80F | Geometry/visibility helpers tested early for coastal compatibility; no boat functionality enabled |

Use the plan’s checkboxes as the complete task list. Add active-task rows here as work starts rather than maintaining two competing copies of every checkbox.

## Active tasks

| Task | Status | Owner | Latest evidence | Next action |
|---|---|---|---|---|
| LE-00C | in_progress | Implementer / Kavi | D01 resolved; defaults recorded in README | Confirm remaining scope/recovery decisions before release |
| LE-20A | in_progress | Implementer | Route, load, duration and consumption tests pass | Add fine obstacle validation |
| LE-20D | in_progress | Implementer | Individual-view tests pass; legacy builder receives no geography | Enforce new model-action context boundary in M3 |

## Integration map

Replace `unverified` with actual module/file references and a short explanation after inspection. These rows are discovery targets, not proposed filenames.

| System | Actual integration point | Findings |
|---|---|---|
| Source repository / app identity | `application/`; Vercel IDs above | Vercel project has no linked Git repository; source recovered from deployed files |
| World schema and migrations | `lib/sim.mjs`, `public/geography.js` | Core v1, world v3; additive geography v1, no reset |
| Simulation cadence / tick | `lib/sim.mjs`: `advance`, `minute` | One real second per simulation minute; bounded catch-up |
| Scheduler and retry handling | `api/index.js`, `lib/world.mjs` | QStash four-minute schedule; token-checked atomic commit added |
| Inhabitant context builder | `worldSnapshot`, `proposalInput`; new `inhabitantView` | Existing structure builder unchanged; personal observation view not yet wired into model decisions |
| Action validator / sandbox | `validation.mjs`, `lib/runner.mjs`, `public/exploration.js` | QuickJS limits retained; new internal journey validator rejects replay/load/route errors |
| Construction / physics | `public/core.js`, `public/physics.js` | Existing building model has capacities/costs, no mobility/salvage contract; carried stores now conserved |
| Persistence / authoritative writer | `lib/world.mjs`, `lib/redis-kv.mjs` | `fm:core`, `fm:live`, `fm:b`, `fm:days`; staging Redis verification pending |
| Terrain and navigation | `public/geography.js` | Fixed finite fixture; cardinal land routing; fine obstacles pending |
| Coastal visibility / island generation | `validateIslandDiscovery`, `visibleIslands` | Rooted graph, lookout reachability, landmass occlusion; no marine feasibility validation yet |
| Vessel construction / marine travel | Not implemented | Must add validated buoyancy/load/propulsion before enabling islands |
| Renderer and timeline | `public/art.js`, `public/app.js`, `daySnapshot` | Existing Canvas appearance retained; historical exploration snapshots added |
| Tests and fixtures | `tests/*.test.mjs` | `npm test`: 29 pass; desktop/mobile preview exercised with Playwright |

## Decision log

The approved design direction is settled. New technical defaults in the plan are subject to codebase discovery and the decision owners listed there.

| ID | Status | Decision / pending action |
|---|---|---|
| Direction | approved | Regional trade-offs; limited knowledge; autonomous exploration; physical relocation; causal environment |
| Delivery sequence | planned | Core settlement loop first; reports, outposts, portable structures, and local feedback follow |
| Island discoverability | required | Every island has a physical sighting chain from reachable mainland lookouts; include both mainland-visible and island-only-visible islands |
| Island rollout | planned | Reserve coastal compatibility during M1; enable islands and boats in M8 after core validation |
| D01 | resolved | 2026-10-14: source recovered and runtime mapped; see integration table |
| D02 | proposed | 40×38 mainland fixture preserves original 22×22; three reserved islands. Final visible scope not approved |
| D03 | proposed | 8 m tiles; two minutes/tile; 20 kg carry cap; explicit extra food/water costs and one-day default supplies. Game assumptions in README |
| D04 | open | Establish construction and salvage accounting |
| D05 | open | Confirm ownership/reuse rules; proposed safe default preserves ownership |
| D06 | open | Define weather parameters, schedule, and supported effects |
| D07 | open | Set budgets, pilot duration, release authorization, and recovery policy |
| D08 | open | Choose island topology, scale, visibility rules, and recurring clear-window bound |
| D09 | open | Define vessel validation, marine limits, and expedition provisioning |
| D10 | open | Define physical failure/return/recovery behavior at sea |

For each resolution, add the date, owner, chosen behavior, rationale, and affected tasks. Do not silently convert an unresolved decision into a shipped default.

## Verification ledger

Allowed results: `not_run`, `pass`, `fail`, `blocked`. Record the command/scenario, code version, and evidence when the result changes.

| Scenario | Result | Evidence |
|---|---|---|
| V01: Regional trade-offs | pass | Mainland fixture has no universally dominant region; scenario ratings only |
| V02: Survival runway | pass | Coast-and-return internal journey conserves resources and fits starting supplies |
| V03: Private knowledge | blocked | Local observations and private-view tests pass; model-action boundary integration pending |
| V04: Travel and invalid actions | blocked | Gradual movement, replay/load/sea rejection pass; fine obstacle validation pending |
| V05: Autonomous choices | not_run | None |
| V06: Salvage accounting | not_run | None |
| V07: Retained structures / ownership | not_run | None |
| V08: Retries and concurrent actions | blocked | In-memory and actual local Redis lease/reload tests pass; hosted-provider release check and later action types remain |
| V09: Restart and cancellation | blocked | Land-journey restart/cancel tests pass; salvage and sea paths not yet implemented |
| V10: Causal weather | not_run | None |
| V11: Observer event accuracy | not_run | None |
| V12: Shared reports | not_run | Follow-up |
| V13: Outposts | not_run | Follow-up |
| V14: Portable structures | not_run | Follow-up |
| V15: Local environmental effects | not_run | Follow-up |
| V16: Rooted island discovery graph | pass | Geometric fixture reaches all three islands; does not certify boat feasibility |
| V17: Mainland and island-only sightings | pass | Full mainland scan sees near island only; other islands reached through island lookouts |
| V18: Sighting versus surveying | not_run | Island release |
| V19: Recurring visibility windows | blocked | Pure visibility-cycle test passes; runtime weather integration pending |
| V20: Vessel validation and accounting | not_run | Island release |
| V21: Bearing navigation and feasible routes | not_run | Island release |
| V22: Sea interruption and recovery | not_run | Island release |

## Blockers and risks

- **Source baseline:** Source is now durable in the project. Preserve the existing Vercel and app identities; do not reconstruct from screenshots or start a new app.
- **Persistence safety:** Atomic commit and lease ownership checks now pass actual local Redis integration cases. Hosted-provider release verification remains separate.
- **Construction compatibility:** Existing agent-designed structures may not expose enough material metadata for salvage. Do not invent recoverable quantities or replace the system with predefined buildings.
- **Knowledge leakage:** A private-view function is tested; M3 must use it rather than the global observer payload for new decision prompts and action responses.
- **Behavioral railroading:** Avoid requiring agents to explore or forcing a preferred region through a universal score. Use controlled fixtures to test capabilities, then inspect natural behavior.
- **Scope growth:** Stage reports, outposts, portability, and environmental feedback after the core release. Avoid turning this extension into a replacement physics or climate engine.
- **Island discoverability:** A coastline silhouette is insufficient if its lookout cannot be reached, its route cannot be sailed, or its landing is unusable. Validate visibility and physical access together; never repair this by leaking hidden coordinates.
- **Marine foundations:** Boats require supported construction and travel rules, not a label or animation. Preserve the existing agent-designed construction approach.

## Session log

### 2026-10-14: Planning baseline

- **Completed:** Converted the approved review into a phased implementation plan and an evidence-based hand-off.
- **Changed files:** Added `implementation-plan.md` and `hand-off.md`; preserved the proposal and review.
- **Implementation/test status:** No application code changes, tests, deployment, or live-world mutation.
- **Next:** LE-00A, then LE-00B.

### 2026-10-14: Island exploration planning

- **Requested:** Add Tasmania-like and surrounding islands accessible by boat, with mainland sightings and island-to-island sightings, but a way to see every island.
- **Completed:** Extended the plan with the rooted visibility guarantee, sighted/surveyed knowledge, reachable landings/lookouts, boat construction and travel contracts, M8 tasks, V16–V22, and D08–D10.
- **Proposed defaults:** Finite staged archipelago; an illustrative chain rather than a fixed count; recurring clear conditions rather than visibility through all weather. Exact scale, marine rules, and failure behavior remain open.
- **Implementation/test status:** Planning only. No island generation, vessel code, simulation tests, or deployment has been performed.
- **Next:** LE-00A remains the implementation starting point; identify visibility and marine integration gaps during discovery and reserve coastal compatibility in M1.

### 2026-10-14: Source recovery and first implementation increment

- **Completed:** Recovered deployed source; added feature-gated geography, migration tests, regional rendering, land journeys, carried-supply accounting, local observations, and island visibility helpers. Added atomic state commits with lease ownership checks.
- **Evidence:** `npm test` passes 29 tests. Playwright exercised desktop/mobile rendering, rotation, zoom, people cards, world/conservation panel, log, theme, and preview labeling without page errors. Backend AI calls are disabled in preview.
- **Corrections during testing:** Fixed the round-trip fixture’s expected static count and adjusted expanded-world mobile zoom. Actual Redis execution has not been tested.
- **Release state:** No production deployment, world reset, live-state migration, or model API call. Existing app preview is the intended review surface, not the Vercel production site.
- **Next:** Fine obstacle routing and model-context/action integration, then staged Redis validation before any live enablement. Do not mark all plan milestones complete based on this increment.

Append a new dated entry after each meaningful implementation session. Include task IDs, source/version references, tests and outcomes, decisions, unresolved problems, and the next exact action.

## Release record

No release exists for this work yet. Fill this section during M6 and each later rollout.

Release preparation: 37 tests pass with none skipped. `bugtracker.md` records FM-001–FM-007, including the two newly fixed proposal replay/resume defects. The requested production deployment uses geography disabled and does not reset or migrate the world.

| Field | Current value |
|---|---|
| Source version | Recovered baseline `dpl_GcAhTs1xsnpZ47zPsyRL4P81fUkK` plus local tracked modifications |
| Schema version / migration | Existing world v3; additive geography/exploration v1, tested locally |
| Deployment identity / environment | Vercel project verified; this increment runs only in an isolated local preview |
| Enabled feature flags | `FM_GEOGRAPHY=1`, `FM_PREVIEW=1` in preview only; production unchanged |
| Backup and restore verification | Not performed |
| Core verification gate | Not run |
| Production authorization | Not obtained |
| Rollout / rollback outcome | Not performed |
