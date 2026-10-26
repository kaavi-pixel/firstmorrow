# Firstmorrow — charter

**Purpose.** Five people on bare land, living as we do. One persistent world that
keeps running while nobody is watching. An AI writes the code that makes their lives
better; the people build it by hand, so it takes days.

## Who is who

| | Who | Mortal? | What they do |
|---|---|---|---|
| **Us** | Caleb and the agent building the world | — | Write and own **reality**. Nobody may change it. |
| **The people** | Ada, Ren, Mika, Sol, Ivo — and their children | **Yes** | Live. Eat, drink, work, shelter, age, suffer, reproduce, die. |
| **The AI** | The model(s) that author the world's features | **No** | Write code — structures, systems, tools — to make these lives better. |

The people do not write code. The AI does not live or die. Reality belongs to neither.

## Reality — the boundary, ours, unchangeable

This is the list an author may never touch. Everything else is fair game.

- **Matter is finite.** Water, soil and material come out of a tile and do not come back.
- **Nothing from nothing.** Every process is mass-checked against what it actually took in.
- **Time.** One real second is one simulation minute. Labour is person-hours. Building takes days.
- **Weather is real and it can destroy.** Storms wreck what is not built to stand, and take the
  unfinished work with them. Heat, drought and exposure wear people down.
- **Bodies.** Hunger, thirst, injury, and age. Health falls when needs go unmet.
- **Death is permanent. Birth is real.** People die — of starvation, exposure, age, or a bad
  season. Children are born to living, healthy parents and depend on them.
- **The land does not care.** No rescue, no free materials, no repair, no rollback, no
  resurrection. A bad season kills people and there is no undo.

If a rule has to bend to make something work, the something is wrong — not the rule.

## The AI's side of the line

Inside reality, the AI writes **anything**: what to build, how it works, what it is made of,
how it is drawn. Its code runs in a sandbox with hard caps and no network, filesystem or host
access. Every effect it claims is checked against the rules above before it happens.

A program declares **processes, not outcomes**: what it takes, what it makes, what it costs.
The kernel accepts or rejects. Nobody gets to assert a result.

The AI is not punished for a failed attempt beyond the wasted day, the spent material, and the
people who went without. Its own survival is never at stake — theirs is.

## Kept from v1

- **The spritework** — `public/art.js` (the isometric renderer, rotation, pan/zoom, day/night,
  speech) and `public/forms.mjs` (the 16×16 pixel forms). Pixels unchanged.
- **The purpose**, restated above.
- **The island plan** — `design/islands-and-boats.md`: a mainland-rooted discovery chain,
  sighted vs surveyed knowledge, boats as *constructed vessels*, no region best at everything.

## Dropped from v1

The features we wrote *for* them: the economy, the physics model, the travel engine, the
building catalogue, the milestone paperwork. In v2 those are the AI's job, or they do not exist.

## Open, and deliberately undecided

- Whether the people's choices come from model-driven personas or from plain instinct.
- Whether one AI authors the world, or several compete.
- How much of the land is visible from where.
- Whether an author can read another author's code.
