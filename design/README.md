# Design notes kept from v1

These are the planning documents from the first attempt, kept because the *thinking* in
them is still the direction — even though the code they referred to is gone.

| File | Why it is kept |
|---|---|
| `features.md` | Caleb's original proposal: an Australia-inspired land, limited relocation, environmental change. |
| `features_reviewed.md` | The annotated review that produced the approved direction. Its core idea — the tension between improving what you have and leaving for something better — is still the point. |
| `islands-and-boats.md` | The Tasmania archipelago plan: a mainland-rooted discovery chain, sighted vs surveyed knowledge, boats as constructed vessels, and no region best at everything. |

## What carried over into the charter

- **No region is best at everything.** Contrasting regions with separate properties, not a
  single habitability score. `public/terrain.mjs` implements this: water, soil, material and
  exposure vary independently.
- **Discovery is physical.** A sighting is a timestamped observation with a bearing, not a
  revealed map tile. Nothing is discovered by rumour or by panning the camera.
- **Boats are built, not chosen.** A vessel must satisfy a capability contract; a labelled
  object is not a seaworthy one.
- **Causal, bounded environment.** Weather changes on its own schedule and inhabitants can
  alter their surroundings through specific acts, not by expanding a border.

## What did not carry over

The implementation plan's milestone machinery (LE-xx tasks, V01–V22 verification scenarios,
D01–D10 decision registers) belonged to a project that coded features *for* the inhabitants.
In v2 the features are the AI's job, so that scaffolding has no object. The verification
value in it — conservation, no duplication, no leaked hidden terrain, continuity across
restart — survives as the test suite in `../app/tests/`.
