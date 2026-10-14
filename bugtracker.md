# Firstmorrow Bug Tracker

Updated: 2026-10-14. Repository: [kaavi-pixel/firstmorrow](https://github.com/kaavi-pixel/firstmorrow).

This tracker records reproducible defects, fixes, and release verification. Feature work remains in `implementation-plan.md`; a missing planned feature is not automatically a bug.

## Conventions

Statuses: `open`, `in_progress`, `fixed_local`, `released`, `verified_production`, `deferred`. `released` means the fix is deployed, but its specific failure case has not necessarily been reproduced safely on production. Severity: `critical` risks data loss or unavailable service; `high` breaks core behavior; `medium` affects a limited path; `low` is cosmetic.

Keep IDs stable. Every fix should include reproduction steps, changed modules, regression evidence, commit or release reference, and remaining verification. Do not close a production issue based only on a local test.

## Defects

| ID | Severity | Status | Summary | Release impact |
|---|---|---|---|---|
| FM-001 | critical | released | Expired simulation worker could commit after its lock lease, with separate state/history writes | Real Redis tests passed; production world advancement and reload verified |
| FM-002 | high | open | Land routing does not yet respect fine structure and landmark obstacles | Keep autonomous travel disabled |
| FM-003 | high | released | Legacy import would discard carried stores and exploration state | Expanded saves are explicitly rejected; no production save was imported |
| FM-004 | medium | fixed_local | Enlarged mainland did not fit the initial mobile viewport | Verify production only if geography is enabled |
| FM-005 | medium | released | Browser storage rejection could interrupt welcome/refresh behavior in isolated previews | Preview and live viewer checks passed; guarded storage accesses deployed |
| FM-006 | high | released | A repeated proposal result could count usage and speech twice while its plan still existed | Pending-plan guard and replay/late-response regressions pass; no deliberate duplicate model request on production |
| FM-007 | medium | released | Planning pause persisted when a service was reconfigured to allow planning | Explicit resume regression passes; no live pause/resume experiment performed |

### FM-001: Lock expiry and non-atomic persistence

- **Reproduction:** Let one worker's lease expire, let another acquire the lock, then have the original worker attempt its save or release.
- **Previous behavior:** Saving used separate hash and string writes; releasing compared the token separately from deletion.
- **Fix:** Token-checked atomic Redis commit and release scripts; preflight hash key types before writes. Cache updates occur only after a successful commit.
- **Modules:** `application/lib/world.mjs`, `application/lib/redis-kv.mjs`, `application/api/index.js`.
- **Evidence:** In-memory regressions and five actual Redis integration cases pass: valid commit/release, expired lease, wrong hash type without partial writes, malformed input, and service reload.
- **Production evidence:** After deployment, the live state advanced from simulation minute 1037 to 1275 on day index 3, retained structure `b0-go`, and reported balanced resource totals. No destructive lease-expiry experiment was run on production.

### FM-002: Fine obstacle routing

- **Reproduction:** Plan a same-landmass route across an occupied building or a legacy blocked landmark tile.
- **Current behavior:** Routing checks land versus sea and map bounds, but not fine collision with existing structures/landmarks.
- **Required fix:** Unify movement obstacles with authoritative terrain and structure geometry; validate the next step when the world changes during a journey.
- **Modules:** `application/public/geography.js`, `application/public/exploration.js`, `application/public/core.js`.
- **Mitigation:** Travel remains an internal tested engine, not exposed to model decisions or visitor commands.

### FM-003: Legacy import loses extension state

- **Reproduction:** Feed an expanded world with carried supplies and a journey to `importWorld`.
- **Fix:** Reject expanded saves rather than reconstructing a legacy world without their additional state.
- **Evidence:** `legacy import refuses to silently drop journeys and carried resources` regression passes.
- **Remaining:** A full versioned restore tool is later release work; rejection is not restore support.

### FM-004: Expanded-world mobile framing

- **Reproduction:** Open the enlarged terrain on a narrow viewport with the original 22×22 zoom assumptions.
- **Fix:** Expanded-world initial zoom fits the wider terrain and permits further zooming out.
- **Evidence:** Mobile viewport inspected at 390×844; desktop and mobile pan/rotation/zoom controls exercised.

### FM-005: Unavailable browser storage

- **Reproduction:** Open the viewer in an opaque-origin preview where browser storage access throws.
- **Fix:** Guard welcome-state reads and writes so a storage exception cannot abort the viewer.
- **Evidence:** Deployed private preview loaded with no page errors.

### FM-006: Duplicate proposal application

- **Reproduction:** Call `applyProposal` twice with the same still-existing plan ID before its construction delay elapses.
- **Expected:** The second response is ignored, without duplicate usage, speech, or history.
- **Fix/evidence:** `applyProposal` and `failPlan` now require a pending plan. The regression proves repeated results and late responses after timeout cannot alter usage/history again. The service reports the actual application result.

### FM-007: Stale planning pause

- **Reproduction:** Save a world through a service with planning disabled, then load it through a service with planning enabled.
- **Expected:** The explicit current service setting wins; planning resumes.
- **Fix/evidence:** The enabled service explicitly removes `planningPaused`. A persisted-world restart test confirms a new plan starts after re-enabling.

## Release checks and non-bug gaps

| Check | State | Notes |
|---|---|---|
| Local regression suite | pass | 37 tests pass, zero skipped; evidence in `application/tests/latest-results.tap` |
| Real Redis script execution | pass | Isolated Unix-socket Redis; no production credentials or data used |
| Production source drift | checked | Current production still matches recovered deployment `dpl_GcAhTs1xsnpZ47zPsyRL4P81fUkK` |
| GitHub source repository | pushed | Private `kaavi-pixel/firstmorrow`, default branch `main` |
| Production release | ready | `dpl_8xz2QzLsjVE18aL28htn83goou7V`; source `335ac632f729dc64d4d49fb3a91d613472d9dcab`; `FM_GEOGRAPHY=0` |
| Geography/travel/boat scope | incomplete | New AI actions, fine collision, migration, dynamic weather, and boats are unfinished features; do not advertise them as released |

## Fix and deployment history

- **2026-10-14:** Created tracker after source recovery and the first implementation increment. Recorded local fixes, travel-routing limitation, and release checks.
- **2026-10-14:** Fixed FM-006/FM-007 and passed 37 tests including real Redis integration. Preparing a conservative production release with geography migration disabled; model-driven travel and boats remain unavailable.
- **2026-10-14:** Published to [firstmorrow.world](https://firstmorrow.world), verified Vercel Ready status, HTTP 200 health, continuing live state, retained structure ID, and zero conservation discrepancies. Source commit `335ac632f729dc64d4d49fb3a91d613472d9dcab`; deployment `dpl_8xz2QzLsjVE18aL28htn83goou7V`. Geography remained disabled, with no world reset or explicit data migration.

Append dated entries with commit IDs, test evidence, deployment IDs, and whether the live world was migrated. Never include credentials, private environment values, or raw user data in this file.
