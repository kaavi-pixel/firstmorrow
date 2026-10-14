# Firstmorrow: Land Extension Hand-off

Updated: 2026-10-14. Current work: obstacle-aware M2 travel and M3 autonomous scouting pilot release.

This is the live progress record for the land-extension work. Scope, task definitions, dependencies, and acceptance scenarios live in `implementation-plan.md`; this document records what has actually been done and what the next implementer should do.

## Current state

- **Approved direction:** Kavi accepted all recommendations from the land-extension review: competing regional advantages, need-driven exploration, physical relocation, practical reasons to stay, survivable starting conditions, and causal environmental changes.
- **Planning complete:** The implementation plan and this progress tracker have been created. The original feature proposal remains unchanged.
- **Island direction added:** Plan a large Tasmania-inspired island and smaller boat-accessible islands. Some must be visible from the mainland, others only from neighboring islands; every island must have a mainland-rooted physical discovery path.
- **Implementation evidence:** 55 tests pass with no skips, including obstacle rerouting, safe camp migration, private provider context, typed decisions, stale/replayed responses, round-trip return, real Redis backup/restore, fresh API response clocks and previous regressions.
- **Available project files:** Planning documents plus the recovered and modified application source, package lock, tests, development notes, and recovery procedure. Dependencies and environment files are excluded from persistence.
- **Verified architecture:** Vercel entry point, Redis storage, QStash scheduler, QuickJS sandbox, plain JavaScript/Canvas frontend, one AI structure builder, and five modeled inhabitants. Existing characters had visual activity but no durable travel before this increment.
- **Implemented:** Shared movement obstacles, safe camp anchor, timestamped individual observations, typed autonomous stay/scout/return decisions, conserved supplies, automatic physical return and decision cards. The private preview makes no model calls and uses an isolated in-memory world.
- **Not implemented:** Regional resource production, permanent relocation/salvage, dynamic environmental effects, and boats. Island geometry and sighting validation are foundations only.
- **Release state:** Mainland geography and autonomous short scouting are live. The existing world was additively migrated, not reset; its pre-migration checkpoint is stored privately in Redis.
- **Repository:** Private `https://github.com/kaavi-pixel/firstmorrow`, default branch `main`, contains the source and tracking documents. Vercel deployment is currently CLI-driven; automatic deployments from GitHub have not been configured.
- **Release verification:** HTTP 200 health, geography v1, autonomous decisions enabled, migration checkpoint marker persisted, existing `b0-go` retained, continuing simulation, zero balance errors and no browser errors. Ada's first real model decision was to stay and help with the Shelter Hub, with its reason recorded.

## Resume here

Continue in the existing `application/` source. Do not download the old app again, create a separate simulation, or replace the live world.

1. Run `npm ci` and `npm test` with `redis-server` installed; read `application/README.md` for exact pilot boundaries.
2. Review natural-agent choices without forcing exploration. Current budget is 24 additional requests per real UTC day, one active scout and a 720-simulation-minute personal cooldown.
3. Make regional resource differences physical, not just observed ratings, before permanent migration. Preserve total stocks and the existing builder contract.
4. Continue M4 migration/salvage after establishing material/ownership accounting; weather and boats remain later milestones.
5. Keep the pre-exploration Redis checkpoint private. Disabling exploration stops new requests but lets active journeys return; restoration must reconcile later progress, not silently erase it.

Authoritative source baseline: Vercel deployment `dpl_GcAhTs1xsnpZ47zPsyRL4P81fUkK`, project `prj_SgYPXt92l6DGcoLanupudRiRsMuO`, team `firstmorrow`. The older Perplexity app identity is `5fde9033-a18b-4fe9-bc3d-94e0fe2b3abc`; its source download was unavailable, so the source was recovered through authenticated deployment-file reads instead.

## Milestone tracker

Allowed status values: `not_started`, `in_progress`, `blocked`, `done`. Only use `done` with evidence that the milestone’s exit gate passed.

| Milestone | Status | Tasks | Evidence / blocker |
|---|---|---|---|
| M0: Discovery | in_progress | LE-00A–LE-00D | A/B/D complete; remaining decisions and live recovery validation not approved |
| M1: Terrain and start | done | LE-10A–LE-10D | Documented mainland pilot migrated without changing original structures or stocks |
| M2: Travel and knowledge | done | LE-20A–LE-20D | Land routing, private model context, persistence, interruption and round-trip tests pass |
| M3: Autonomous decisions | done | LE-30A–LE-30D | Controlled stay/scout fixtures pass; natural-agent rollout remains separately verified below |
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
| LE-20A | done | Implementer | Shared obstacles, changed-route tests, safe anchor and construction reservations pass | Monitor production |
| LE-20D | done | Implementer | Provider-body regression verifies only private `decisionInput` is sent | Preserve boundary in later tools |
| LE-30A–D | done | Implementer | Typed decisions, known destinations, recorded reasons and physical returns pass | Observe natural choices |

## Integration map

Replace `unverified` with actual module/file references and a short explanation after inspection. These rows are discovery targets, not proposed filenames.

| System | Actual integration point | Findings |
|---|---|---|
| Source repository / app identity | `application/`; Vercel IDs above | Vercel project has no linked Git repository; source recovered from deployed files |
| World schema and migrations | `lib/sim.mjs`, `public/geography.js` | Core v1, world v3; additive geography v1, no reset |
| Simulation cadence / tick | `lib/sim.mjs`: `advance`, `minute` | One real second per simulation minute; bounded catch-up |
| Scheduler and retry handling | `api/index.js`, `lib/world.mjs` | QStash four-minute schedule; token-checked atomic commit added |
| Inhabitant context builder | `worldSnapshot`, `proposalInput`; `decisionInput`, `inhabitantView` | Builder unchanged; separate travel provider receives only personal observations and offered actions |
| Action validator / sandbox | `validation.mjs`, `lib/runner.mjs`, `public/exploration.js` | QuickJS limits retained; new internal journey validator rejects replay/load/route errors |
| Construction / physics | `public/core.js`, `public/physics.js` | Existing building model has capacities/costs, no mobility/salvage contract; carried stores now conserved |
| Persistence / authoritative writer | `lib/world.mjs`, `lib/redis-kv.mjs`, `lib/recovery.mjs` | Atomic Redis commit plus same-operation migration checkpoint; isolated restore test passes |
| Terrain and navigation | `public/geography.js`, `public/navigation.js`, `public/exploration.js` | Cardinal routes, shared fine occupancy, known-route filter, safe anchor and construction reservations |
| Coastal visibility / island generation | `validateIslandDiscovery`, `visibleIslands` | Rooted graph, lookout reachability, landmass occlusion; no marine feasibility validation yet |
| Vessel construction / marine travel | Not implemented | Must add validated buoyancy/load/propulsion before enabling islands |
| Renderer and timeline | `public/art.js`, `public/app.js`, `daySnapshot` | Existing Canvas appearance retained; historical exploration snapshots added |
| Tests and fixtures | `tests/*.test.mjs`, `tests/live-clone-pilot.mjs` | 55 pass, no skips; two-day live-state clone pilot, 6 scouts, 4 stays, 170 restarts, zero balance errors |

## Decision log

The approved design direction is settled. New technical defaults in the plan are subject to codebase discovery and the decision owners listed there.

| ID | Status | Decision / pending action |
|---|---|---|
| Direction | approved | Regional trade-offs; limited knowledge; autonomous exploration; physical relocation; causal environment |
| Delivery sequence | planned | Core settlement loop first; reports, outposts, portable structures, and local feedback follow |
| Island discoverability | required | Every island has a physical sighting chain from reachable mainland lookouts; include both mainland-visible and island-only-visible islands |
| Island rollout | planned | Reserve coastal compatibility during M1; enable islands and boats in M8 after core validation |
| D01 | resolved | 2026-10-14: source recovered and runtime mapped; see integration table |
| D02 | pilot default | Authorized batch uses existing 40×38 fixture preserving original 22×22; reserved islands stay disabled; final coast artwork remains later work |
| D03 | pilot default | 8 m tiles; two minutes/tile; 20 kg carry cap; one-day rations and explicit travel costs; maximum 40-tile outbound scout |
| D04 | open | Establish construction and salvage accounting |
| D05 | open | Confirm ownership/reuse rules; proposed safe default preserves ownership |
| D06 | open | Define weather parameters, schedule, and supported effects |
| D07 | pilot resolved | User authorized implementation/publication; 24 additional calls/real UTC day, one active scout; same-commit backup and tested isolated restore |
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
| V03: Private knowledge | pass | Actual provider request body tested; no global geography or other inhabitants' knowledge |
| V04: Travel and invalid actions | pass | Shared obstacles, changed-route stop/reroute, load, sequence and typed-decision validation |
| V05: Autonomous choices | pass | Controlled staying/scouting fixtures; separate natural-agent release check |
| V06: Salvage accounting | not_run | None |
| V07: Retained structures / ownership | not_run | None |
| V08: Retries and concurrent actions | pass | Land decisions and state commits tested for leases, concurrency, duplicate replies and restart; normal hosted commit verified, no destructive production fault injection |
| V09: Restart and cancellation | pass | Land journeys, cancellation and round-trip returns pass; sea/salvage interruptions belong to later milestones |
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
- **Knowledge leakage:** The travel provider now receives only the tested private view. Keep that boundary when adding reports, extraction or relocation.
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

### 2026-10-14: Repository, bug tracker, and conservative production release

- **Requested and completed:** Created private GitHub repository, added `bugtracker.md`, and deployed the tested source to the existing Vercel project and custom domain.
- **Fixes:** FM-006 proposal replay protection and FM-007 explicit planning resume. Added actual Redis integration tests for the earlier atomic persistence fix.
- **Evidence:** 37 passing tests, no skips. Production health HTTP 200; live browser had no page errors; structure ID `b0-go` retained; simulation advanced; all resource balances zero.
- **Deployed source:** `335ac632f729dc64d4d49fb3a91d613472d9dcab`.
- **Deployment:** `dpl_8xz2QzLsjVE18aL28htn83goou7V`, Ready, aliases `firstmorrow.world` and `www.firstmorrow.world`.
- **Scope:** `FM_GEOGRAPHY=0`; no new terrain, autonomous travel, or boats enabled. This is not completion of the full M6 land-extension release gate.
- **Next:** Continue fine obstacle routing and model-action integration. Enabling geography remains a separate migration/backup decision.

Append a new dated entry after each meaningful implementation session. Include task IDs, source/version references, tests and outcomes, decisions, unresolved problems, and the next exact action.

### 2026-10-14: Autonomous mainland scouting pilot

- **Completed:** LE-20A/D and LE-30A–D. Shared obstacle rules, safe legacy camp anchor, route revalidation, construction reservations, typed private-knowledge decisions, conserved round trips and observer decision cards.
- **Evidence:** 55 tests, zero skips. Two-day read-only live-state clone pilot: six controlled scouts, four stays, 170 persistence round-trips, zero resource discrepancies. Real Redis checkpoint and exact isolated restore passed.
- **Initial deployment:** `dpl_5hRmMu4eyuKGTFv5YKjuVQeXaB73`, source `d6b927504adcde625ad6b65d4922b3e125528c32`, Ready. Enabled `FM_GEOGRAPHY=1`, `FM_EXPLORATION=1`, `FM_MAINTENANCE=0`. Boats disabled.
- **Live evidence:** Additive migration at day index 5, minute 557; atomic checkpoint marker persisted. Structure `b0-go` retained. At day index 5, minute 719, all balances were zero and Ada had chosen to stay at camp using the live provider.
- **Browser evidence:** Desktop/mobile, decision cards, carried inventory, log, themes, rotation/pan/zoom and historical day 0 inspected. Historical pre-migration views omit geography/knowledge. No page errors or horizontal overflow.
- **QA follow-up:** Found pre-existing FM-008: cached commit time was reused as request time, restarting client prediction on polls. Added fresh no-store API clocks and a regression. Follow-up `dpl_2a8ySZ1fBgfbmb48shGwoRhDSibT`, source `aa7b5d5`, is Ready; live no-store headers and fresh response timestamps verified.
- **Natural behavior:** Ada chose to stay, citing the unfinished shelter. Ren's next provider reply failed the short-reason contract and was safely rejected without starting travel or spending provisions. Monitor invalid-response frequency before increasing the request budget; do not turn rejection into a forced scout.
- **Next:** Monitor natural choices and establish physical regional production before permanent migration. No claim that a naturally chosen scouting expedition has yet completed in production; controlled round trips are separately verified.

## Release record

The mainland exploration pilot is live. The complete land-extension roadmap remains unfinished; regional extraction, relocation, weather and boats are not enabled.

| Field | Current value |
|---|---|
| Source version | GitHub commit `aa7b5d5`; initial pilot was `d6b927504adcde625ad6b65d4922b3e125528c32` |
| Schema version / migration | World v3 retained; additive geography/exploration v1 migrated at day index 5, minute 557 |
| Deployment identity / environment | Production `dpl_2a8ySZ1fBgfbmb48shGwoRhDSibT`, project `prj_SgYPXt92l6DGcoLanupudRiRsMuO` |
| Enabled feature flags | `FM_GEOGRAPHY=1`, `FM_EXPLORATION=1`, `FM_MAINTENANCE=0`; islands disabled |
| Backup and restore verification | Private atomic pre-migration Redis checkpoint; isolated exact restore passes; no production restore performed |
| Core verification gate | This bounded scouting pilot passed; full M6 roadmap gate remains later work |
| Production authorization | User explicitly requested publication to firstmorrow.world |
| Rollout / rollback outcome | Ready and verified including fresh response clocks; no reset or rollback. Live advanced from day index 5/minute 719 to 954 with balanced resources |
