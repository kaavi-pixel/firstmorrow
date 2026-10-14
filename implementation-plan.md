# Firstmorrow: Land Extension Implementation Plan

Status: implementation in progress; isolated terrain preview and travel foundations. Updated: 2026-10-14.

This plan implements the approved land-extension review: an Australia-inspired arid landscape, meaningful regional trade-offs, need-driven exploration, physically constrained relocation, and causal environmental changes. It defines the intended behavior and delivery sequence; it does not claim that the application has been inspected or that any feature is already implemented.

Implementation update: the production source has now been recovered and inspected. Task checkboxes below reflect completed code-level work; milestone gates, Redis staging validation, model integration, and production authorization remain separate. See `hand-off.md` and `application/README.md` for current evidence and limitations.

## Problem and goals

The feature should create a genuine choice between improving a settlement, investigating alternatives, and migrating. A universally better destination, automatic exploration, or arbitrary climate changes would undermine that choice.

- **Regional choice:** Provide contrasting locations with no single best destination across all relevant needs.
- **Inhabitant autonomy:** Allow scouting, staying, and migration without mandatory exploration or a shared omniscient map.
- **Physical continuity:** Preserve travel duration, material accounting, existing structures, and in-progress work across simulation updates and restarts.
- **Causal environment:** Separate regional conditions, changing weather, and the effects of specific inhabitant actions.
- **Observer clarity:** Make discoveries and decisions understandable without exposing hidden map information to inhabitants.
- **Island discovery:** Make every island discoverable through a mainland-rooted chain of visible, boat-accessible islands, while keeping some islands invisible from the mainland.

Acceptance is measured by the verification scenarios below, not by forcing a particular percentage of inhabitants to migrate. Collect natural decision outcomes during a pilot before setting behavioral targets.

## Scope and boundaries

### Core release

- **Landscape:** A finite mainland extension with an arid starting area and several contrasting regions, designed to support a later boat-accessible archipelago; use geographic inspiration rather than a literal Australian reconstruction.
- **Starting conditions:** Resource-poor but survivable conditions that permit preparation and scouting.
- **Knowledge:** Individual observations, timestamps, and limited terrain knowledge.
- **Travel:** Durable journeys with route-dependent duration, energy or effort costs, and carrying limits.
- **Settlement:** Staying, moving possessions, salvaging materials, and rebuilding elsewhere.
- **Weather:** A small, bounded model of temperature, rainfall, and water availability.
- **Timeline:** Discoveries, plans, departures, arrivals, failures, and settlement changes with distinct intent and outcome events.

### Staged follow-up

- **Shared reports:** Add provenance and observation age after individual knowledge works.
- **Outposts:** Support maintaining more than one settlement after basic migration works.
- **Portable structures:** Allow transport only where an actual construction and transport capability supports it.
- **Local environmental feedback:** Add a small causal effect, such as vegetation removal affecting shade, after the core loop is stable.
- **Islands and boats:** Add a large Tasmania-inspired island and smaller surrounding islands, with mainland sightings, island-to-island discovery chains, and physical sea travel. M8 defines this work independently of the other follow-ups.

These follow-ups retain the approved direction but do not block the core release. General structure transport, broad climate feedback, unlimited procedural expansion, and a fully realistic climate model are out of scope.

## User stories

- **Inhabitant:** As an inhabitant, I want to compare what I know about nearby land with my current settlement so that I can choose whether exploration or relocation is worthwhile.
- **Inhabitant under pressure:** As an inhabitant with limited supplies, I want to estimate a journey's costs and retain the ability to stop or return where physically possible.
- **Established inhabitant:** As an inhabitant with shelter and useful infrastructure, I want those assets to retain practical value so that staying remains a viable strategy.
- **Coastal explorer:** As an inhabitant at a coastal lookout, I want to spot distant land and investigate it by boat without automatically knowing its resources.
- **Island explorer:** As an inhabitant on an island, I want to find lookouts that reveal further islands so that exploration can continue through observable clues rather than blind ocean searches.
- **Observer:** As an observer, I want to see what an inhabitant intended and what actually happened so that the world’s changes are understandable.
- **Operator:** As the world operator, I want simulation retries and interruptions to preserve resources and progress so that a continuously running world remains trustworthy.

## Implementation principles

- **Extend existing systems:** Reuse the current simulation, physics, sandbox, persistence, and rendering boundaries where they exist. Do not introduce a parallel world engine.
- **Separate authority from reasoning:** The simulation validates actions and updates state; an inhabitant proposes actions based only on its permitted observations.
- **Keep construction emergent:** Do not replace agent-designed structures with a fixed building catalogue. Derive salvage and mobility from supported construction data; reject unsupported operations explicitly.
- **Keep choices open:** No mandatory migration, automatic coast preference, or reward that overrides an inhabitant’s needs and values.
- **Use explicit units:** Record world distance, simulation time, quantities, carrying capacity, and effort or energy units. Do not equate game effort with physical energy unless the existing model supports that conversion.
- **Persist consequential state:** UI animation is not travel progress. Every consequential state transition must be durable, validated, and safe to retry.

The project context names Vercel, Upstash Redis/QStash, QuickJS, and a day timeline. Treat these as integration leads to verify during discovery, not evidence of current implementation details.

## Proposed state contracts

These are logical contracts, not final language types or storage keys. Final field names, units, and persistence layout must follow the inspected application.

| Contract | Minimum information | Boundary |
|---|---|---|
| Region and terrain | Stable IDs, bounds, traversability, water, soil, materials, exposure | Authoritative world state |
| Environmental conditions | Baseline parameters, current temperature/rainfall/water, simulation timestamp | Authoritative, with observable subset |
| Inhabitant knowledge | Observed cells/regions, observed values, observation time, provenance | Private agent input |
| Inventory and carrying | Item/material identity, quantity, mass or supported capacity units | Validated transfers |
| Journey | Action ID, actor, route, destination, progress, carried inventory, costs, status | Durable simulation action |
| Structure record | Stable ID, location, construction data, ownership, lifecycle, supported salvage | Existing construction system |
| Settlement association | Inhabitant and settlement IDs, status, retained assets | Does not erase world structures |
| Timeline event | Stable event ID, simulation time, actor, event type, outcome, related IDs | Observer projection |
| Island and landing | Stable island ID, coast geometry, traversable landing sites, reachable lookouts, region properties | Authoritative terrain; details revealed through observations |
| Visibility link | Source lookout, target land silhouette, bearing/range bounds, obstruction checks, eligible conditions | Generator validation; never exposed as a complete graph to agents |
| Vessel | Stable construction ID, supported buoyancy/load capacity, propulsion, condition, location, occupants, cargo | Existing construction/physics and validated boarding |
| Sea journey | Journey fields plus vessel ID, embark/disembark sites, marine route, weather limits, passenger/cargo reservations | Durable simulation action; shares existing retry guarantees |

Use the action lifecycle `planned → active → completed`, with explicit `cancelled` and `failed` exits. Define valid transitions and settlement semantics during discovery; never interpret a model’s statement of intention as successful execution.

## Island and boat design

### Landscape and discovery sequence

Add one large Tasmania-inspired island and a small archipelago with contrasting settlement opportunities. Do not copy real coastlines or make islands universally better than the mainland; water, soil, materials, exposure, and isolation should produce distinct trade-offs.

An illustrative first fixture is `mainland lookout → island A → island B → large island`, with another small island visible directly from a different mainland coast. This topology is a proposal, not a fixed island count or map scale; at least one island must be visible from the mainland and at least one must be visible only from another island.

“Always some way to see them” means every island has a physical discovery path, not that every island is visible from every location or through every weather condition. Discovery must not depend on rumors, hidden coordinates, a random encounter, or unrestricted camera panning.

### Visibility guarantee

Treat discovery as a directed graph rooted at accessible mainland coastal lookouts. An edge exists only when an inhabitant can physically reach its source lookout and see the target’s silhouette using the actual visibility model.

- **Geometry:** Validate sight range, lookout height where supported, target silhouette, terrain occlusion, and the same perception rules used by inhabitant tools. Decorative or camera-visible land alone does not count.
- **Connectivity:** Require a rooted path to every island. Require at least one island with no mainland sightline but a valid sightline from a preceding island.
- **Reachability:** Each source lookout must be reachable from a valid landing or mainland approach. Each discovery link must have an achievable boat route to a landing on its target.
- **Weather:** Validate the graph in normal clear conditions. If fog hides land, ensure clear observation windows recur within a configured bound; do not make discovery require a rare storm or exceptional technology.
- **Generation failure:** Reject or repair disconnected layouts before committing terrain. Revalidate when permanent terrain changes could break the last discovery path; do not silently relocate inhabited islands to fix it.

The graph is an internal validation structure, not an agent map. Inhabitants discover its links only by traveling to the corresponding vantage points.

### Observation and navigation

Use knowledge stages `unknown`, `sighted`, and `surveyed`. A sighting records time, observer position, bearing, estimated distance if supported, and an apparent outline; it does not reveal the island’s exact map, resources, safe landing, or settlement quality.

Allow a vessel to travel toward an observed bearing or coastal waypoint and reveal shoreline incrementally. Do not require exact destination coordinates or a pre-known landing to begin an expedition; validate disembarkation only after a suitable landing is observed and reached.

Some shorelines should reveal an island immediately, while others require walking to another part of the coast or a headland. Once an island is surveyed, its practical value enters the existing stay/migrate/outpost decision loop without a special island preference.

### Physical boat access

Inhabitants must design and build vessels through supported construction mechanics rather than selecting a free predefined boat. Establish a bounded marine capability contract: afloat under intended load, adequate carrying capacity, supported propulsion, launch/recovery, and operating limits for the modeled sea conditions.

For the first release, use a simple explicitly documented marine model rather than claiming a complete fluid simulation. If the construction engine cannot validate that contract, implement the necessary foundation before enabling sea travel; do not treat any labeled object as a seaworthy vessel.

Boarding transfers passengers and cargo into the vessel once; sailing advances their location together over simulation time. Reject walking across water, overloaded launches, conflicting use of one vessel, and land teleportation. Track food/water or the existing survival resources, effort, weather exposure, interruptions, and the possibility of waiting or returning.

Every discovery chain must be achievable with a defined early marine capability and expedition provisioning budget, including return or onward travel. Do not require inhabitants to find unobserved supplies on arrival to avoid being stranded, and do not supply free materials to rescue invalid map generation.

### Delivery boundary

Reserve compatible coastline and world bounds during M1, but do not expose unvisitable islands as actionable destinations before M8 passes. The island feature is a staged release after the core loop, independent of shared reports and outposts; choosing to sail remains optional.

## Delivery milestones

### M0: Inspect and map the current application

Dependencies: none. Priority: P0.

- [x] **LE-00A:** Locate and inspect the authorized application source, current tests, deployment configuration, and world schema. Source recovered; deployed bundle excluded tests, so a new regression suite was added.
- [x] **LE-00B:** Map the simulation tick, action validator, inhabitant context builder, construction model, persistence writer, scheduler, renderer, and timeline.
- [ ] **LE-00C:** Resolve the blocking decisions below; record actual integration points and existing gaps in the hand-off.
- [x] **LE-00D:** Capture baseline fixtures and define a versioned migration, backup, feature-gating, and rollback approach before editing live-world behavior. Defined and locally tested; production backup/restore execution remains a release gate.

Exit gate: actual modules and schema are documented, units and ownership rules are resolved, and implementation can proceed without guessing. Do not overwrite a live world to create the new terrain.

### M1: Add regional terrain and safe starting conditions

Dependencies: M0. Priority: P0.

- [x] **LE-10A:** Implement finite terrain extension with stable identifiers and repeatable generation or fixed fixtures; reserve compatible coastline and bounds for the M8 archipelago without enabling sea journeys yet.
- [x] **LE-10B:** Represent water, soil, material access, exposure, and traversal separately rather than a global habitability score. Scenario ratings are not new physical resource stocks.
- [x] **LE-10C:** Define a survival runway and scouting fixture using the existing need/resource model. Local fixture scouts the coast and returns with conserved supplies.
- [x] **LE-10D:** Add backward-compatible world loading and migration tests; preserve existing structures and IDs.

Exit gate: V01 and V02 pass, and the extension does not invalidate existing world coordinates or structure placement.

### M2: Add durable travel and individual observations

Dependencies: M1. Priority: P0.

- [ ] **LE-20A:** Implement route validation, duration, carrying limits, and incremental cost accounting. Implemented for landmass-constrained routes; fine obstacle validation remains.
- [x] **LE-20B:** Persist journey progress; define interruption, cancellation, and return behavior. Local restart/cancellation tests pass; Redis staging still required.
- [x] **LE-20C:** Add timestamped observations at actual arrival/visibility boundaries.
- [ ] **LE-20D:** Filter inhabitant context so unknown terrain and other inhabitants’ private observations do not leak through tool responses.

Exit gate: V03, V04, V08, and V09 pass. An observer’s global view must not become an inhabitant’s knowledge.

### M3: Integrate autonomous settlement decisions

Dependencies: M2. Priority: P0.

- [ ] **LE-30A:** Expose validated exploration and travel actions through the existing agent/sandbox interface.
- [ ] **LE-30B:** Include current needs, supplies, known destinations, journey estimates, and the practical value of existing assets in decision context.
- [ ] **LE-30C:** Allow staying and improving locally; do not inject a requirement to explore or migrate.
- [ ] **LE-30D:** Record short decision explanations as stated reasons, separate from observed facts and completed actions.

Exit gate: V05 passes with controlled fixtures. Pilot natural agents separately; model-dependent behavior is not a substitute for deterministic action tests.

### M4: Implement migration, salvage, and retained structures

Dependencies: M3 and construction/accounting findings from M0. Priority: P0.

- [ ] **LE-40A:** Support moving possessions and rebuilding through existing construction interfaces.
- [ ] **LE-40B:** Define partial salvage, labor, recoverable quantities, and losses from supported construction data.
- [ ] **LE-40C:** Preserve left-behind structures and their ownership; migration alone grants no right to claim another inhabitant’s property.
- [ ] **LE-40D:** Validate inventory and construction mutations together, preventing duplicate salvage, double spending, and free restoration after cancellation.

Exit gate: V06, V07, V08, and V09 pass. If the current construction model cannot support accounting, improve that contract before offering salvage.

### M5: Add bounded weather and observer integration

Dependencies: M1; observer events integrate with M2–M4. Priority: P0.

- [ ] **LE-50A:** Add regional baselines and a seeded or reproducible weather process driven by simulation time.
- [ ] **LE-50B:** Connect rainfall, water, and temperature to supported world mechanics with bounded values and explicit update intervals.
- [ ] **LE-50C:** Display region differences, travel progress, observations, and outcomes using the existing visual style and timeline.
- [ ] **LE-50D:** Ensure weather changes can make observations stale without silently updating an inhabitant’s knowledge.

Exit gate: V10 and V11 pass. Territory labels and ownership changes do not directly alter weather.

### M6: Validate and release the core extension

Dependencies: M1–M5. Priority: P0.

- [ ] **LE-60A:** Run all core verification scenarios, migration tests, regression tests, and cost/performance measurements.
- [ ] **LE-60B:** Run a staged continuous-simulation pilot with zero viewers, reloads, scheduler retries, and conflicting actions.
- [ ] **LE-60C:** Verify backups and a rollback path; get authorization for the specific production deployment or live-world migration.
- [ ] **LE-60D:** Release incrementally, record version and evidence, and monitor failed actions, resource discrepancies, and stalled journeys.

Exit gate: V01–V11 pass, no unresolved conservation or data-loss defect remains, and release evidence is recorded. If a rollback would discard newly created progress, stop writes and follow the agreed recovery procedure rather than restoring blindly.

### M7: Add approved follow-ups

Dependencies: M6. Priority: P1.

- [ ] **LE-70A:** Add shared reports with source and age; reports remain claims until independently observed.
- [ ] **LE-70B:** Add outposts without duplicating inhabitants, inventories, or structures.
- [ ] **LE-70C:** Add portable-structure transport only after mobility and transport capability are represented.
- [ ] **LE-70D:** Implement one bounded local environmental effect with a named cause, radius, timescale, and recorded consequences.

Exit gate: V12–V15 pass for the follow-ups being released. Larger climate feedback requires a separate plan.

### M8: Add discoverable islands and physical boat travel

Dependencies: M6 and verified marine construction capability. Does not require all of M7. Priority: P1.

- [ ] **LE-80A:** Choose a finite island topology and generate contrasting regions, coastlines, landing sites, and reachable lookouts.
- [ ] **LE-80B:** Implement and validate the mainland-rooted visibility graph; reject disconnected islands and include both direct mainland sightings and island-only sightings.
- [ ] **LE-80C:** Add sighted/surveyed knowledge, silhouette and bearing observations, recurring clear visibility windows, and incremental shoreline discovery.
- [ ] **LE-80D:** Implement the marine construction contract, launching, boarding, cargo/passenger accounting, and supported propulsion.
- [ ] **LE-80E:** Extend durable travel with boat routes, provisions, weather limits, interruption/return behavior, landing validation, and conservation safeguards.
- [ ] **LE-80F:** Integrate coastal sightings and boat expeditions with agent actions, the renderer, and timeline; run island tests and a staged rollout with the existing production authorization gate.

Exit gate: V16–V22 pass, and V03/V04/V07/V08/V09/V11 regressions pass with sea journeys. Every island has a verified discovery chain and feasible travel path; no island is revealed merely because it is rendered for observers.

## Verification scenarios

| ID | Given / When / Then |
|---|---|
| V01 | Given contrasting region fixtures, when their properties are compared, then no region dominates all others across every relevant dimension. |
| V02 | Given configured starting supplies and needs, when a baseline inhabitant prepares and completes the agreed scouting route, then the defined survival runway is sufficient without removing survival costs. |
| V03 | Given unknown terrain, when inhabitant context and action responses are generated, then unobserved terrain data and private observations are absent. |
| V04 | Given a valid journey, when one simulation interval advances, then location/progress and resource costs advance by the configured rules, not instantly; invalid routes and overweight loads are rejected without mutation. |
| V05 | Given controlled decision fixtures, when needs, supplies, asset value, or known opportunities change, then both staying and exploration/migration remain legal and can be justified; unknown land is not described as known fact. |
| V06 | Given a structure and supported salvage data, when partial and full salvage are performed, then recovered materials and remaining structure state match the recorded rules with no repeated recovery. |
| V07 | Given a settlement left behind, when its inhabitant migrates or a journey fails, then its structures and retained inventory persist; unauthorized reuse is rejected. |
| V08 | Given the same action/tick is delivered twice or two actors contend for one resource, when updates commit, then progress and costs apply once and resources cannot be spent twice. |
| V09 | Given an active journey or salvage operation, when the process restarts or the operation is cancelled, then progress resumes or terminates consistently without teleportation, duplication, or unexplained refunds. |
| V10 | Given unchanged environmental actions, when only a territory/ownership boundary changes, then environmental state is unaffected; weather advances on its configured simulation schedule. |
| V11 | Given intention, execution, and outcome events, when an observer reloads, then timeline entries remain ordered and deduplicated, and intentions are not displayed as completed work. |
| V12 | Given a shared report, when another inhabitant reads it, then source and age are retained and the report does not become a fresh firsthand observation. |
| V13 | Given an established settlement, when an outpost is created, then assets remain at their actual locations and the inhabitant is not duplicated. |
| V14 | Given fixed and portable constructions, when movement is requested, then fixed constructions are rejected and supported portable ones require time, effort, and capacity. |
| V15 | Given the selected environmental action, when its configured timescale elapses, then only its bounded documented effect occurs; an unrelated territory change produces no such effect. |
| V16 | Given each generated layout, when the directed visibility graph is traversed from accessible mainland lookouts, then every island is reachable; disconnected or out-of-range islands are rejected or repaired before commit. |
| V17 | Given the island fixture, when mainland and island lookouts are compared, then at least one island is directly visible from the mainland and at least one is not, but the latter is visible from a reachable lookout on a preceding island. |
| V18 | Given an inhabitant at a valid lookout, when it sights an island, then its knowledge gains a timestamped silhouette and bearing but no unobserved resource or landing data; when it later surveys the island, then only observed details are added. |
| V19 | Given fog or poor visibility, when the configured observation-window bound elapses, then normal clear conditions permit the guaranteed sightlines again; discovery never requires an exceptional event. |
| V20 | Given a proposed vessel, when launch and boarding are requested, then unsupported buoyancy/propulsion, excess load, walking on water, or double boarding are rejected without duplication; valid occupants and cargo move with the vessel. |
| V21 | Given a sighted but unsurveyed island, when a provisioned expedition follows its bearing, then it can approach and discover a landing without knowing hidden coordinates; each required link is feasible under the defined marine and provisioning budget. |
| V22 | Given an active sea journey, when weather blocks progress, cancellation is requested, or the process restarts, then vessel, passengers, cargo, costs, and progress remain consistent; return/wait behavior follows physical constraints and original settlements persist. |

## Measurement and release checks

- **Correctness:** Zero duplicated materials, unexplained structure loss, or leaked hidden terrain in the controlled suite. Check action logs and before/after state snapshots.
- **Continuity:** All interruption and retry fixtures pass. Verify progress across restart and zero-viewer simulation, not only an open browser.
- **Behavior:** Record scout, stay, migrate, and failed-action outcomes during the staged pilot. Inspect reasons for forced behavior; do not require a predetermined mix.
- **Performance and cost:** Measure tick latency, persisted state growth, event growth, and model calls against M0 baseline. Establish budgets before release rather than inventing targets now.
- **Operations:** Record source version, schema version, enabled flags, migration outcome, backup location, and rollback limitations in the hand-off.

## Open decisions

All owners below are roles to assign during M0, not assigned people.

| ID | Decision | Owner | Blocking point |
|---|---|---|---|
| D01 | Actual codebase, runtime boundaries, world schema, and authoritative writer | Implementer | M0 exit |
| D02 | Map dimensions, region count, distance units, and extension method | Implementer; Kavi approves visible scope | M1 |
| D03 | Simulation cadence, survival runway, travel costs, and capacity units | Implementer | M1/M2 |
| D04 | Construction metadata and recoverable-material accounting | Implementer | M4 |
| D05 | Ownership of left-behind structures and explicit reuse permissions | Kavi | M4; default: preserve ownership and reject unapproved claims |
| D06 | Weather update interval, variables, and measurable effects | Implementer | M5 |
| D07 | Performance budgets, pilot duration, production rollout, and recovery policy | Implementer; Kavi approves production action | M6 |
| D08 | Island count/topology, world scale, lookout/visibility model, and clear-window bound | Implementer; Kavi approves visible scope | M8; coastline constraints identified during M1 |
| D09 | Supported marine construction, propulsion, load and weather limits, and provisioning budget | Implementer | M8 boat integration |
| D10 | Failure at sea: waiting, return, damage, passenger survival, and recovery semantics | Implementer; Kavi approves irreversible outcomes | M8 sea-journey validation |

D01 is resolved by the recovered source and integration map. D02/D03 now have explicit provisional fixture values in `application/README.md`; final visible scale and production tuning remain unapproved. New internal travel APIs do not yet change the production model’s proposal contract.

## Progress protocol

Maintain execution status in `hand-off.md`, using the task and verification IDs here. Update this plan only when scope, dependencies, acceptance criteria, or an implementation decision changes.

After each meaningful implementation session, record tasks changed, code references, test commands and results, decisions, blockers, and the exact next action. A task is done only when its acceptance gate has evidence; document creation alone completes no implementation task.
