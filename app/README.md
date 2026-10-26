# Firstmorrow — v2 source

A restart. The world is reality; the AI writes the code that helps the people living
in it. Read `../CHARTER.md` first — it is the design, and it is short.

## Run it

Node 20 or later.

```sh
cd app
npm install
npm test
PORT=3000 node server.mjs      # http://localhost:3000
npm run loop                   # the heartbeat: beats every 5s
npm run loop -- --once         # a single beat
```

One real second is one simulation minute. The world starts bare: five people, four days
of supplies, no structures, no authored code. Left alone, they starve. That is the point.

## The author loop

Three models (the Architect, the Engineer, the Ecologist) take turns designing structures.
A turn is: the kernel builds a brief from what that author has surveyed, the model answers
with one JSON object, the gate accepts it or refuses it, and on acceptance the people have
to build it by hand before its program runs once a day, forever.

| Piece | Where |
|---|---|
| The turn, the brief, the daily budget | `kernel/authors.mjs` |
| The vendor call, with a timeout and one retry | `kernel/provider.mjs` |
| The beat: advance the world, then let the authors work | `kernel/store.mjs` `maybeAuthorTurn` |
| The beat in production | a Vercel cron on `/api/tick`, `turns=3`, daily |
| The beat anywhere else | `npm run loop`, or any scheduler on `/api/tick` |

The day's budget is 24 model calls, shared out evenly, and it is a hard cap: a model call
that fails still spends it. A refusal is remembered and handed back to that author on their
next turn. Keys come from `PPLX_API_KEY` / `OPENAI_API_KEY` / `XAI_API_KEY`; with none set
the world runs and nobody thinks, which is said out loud rather than faked.

One beat carries a turn for every author, because the next beat may be a day away. The world
runs at its stated pace when someone is watching it, which ticks it; a daily cron keeps it
alive when nobody is. A tighter beat needs a Pro plan, or any external scheduler pointed at
`/api/tick`.

## Layout

| Path | What it is | Whose |
|---|---|---|
| `public/art.js` | The isometric renderer: projection, rotation, pan/zoom, day/night, speech, hit testing. Kept from v1. | ours |
| `public/forms.mjs` | The 16×16 pixel forms and the palette. Kept from v1. | ours |
| `public/terrain.mjs` | The land: regions with finite water, soil and material reserves. | ours |
| `public/style.css`, `base.css`, `index.html` | The shell. Kept from v1. | ours |
| `kernel/weather.mjs` | Seasons, heat, rain, and storms that destroy. | **reality** |
| `kernel/validate.mjs` | The gate. Every declaration is mass-checked. `RULES` lives here. | **reality** |
| `kernel/instinct.mjs` | The people's own behaviour: water, food, shelter. Never authored. | **reality** |
| `kernel/world.mjs` | People, ageing, hunger, birth, death, storms. | **reality** |
| `kernel/sandbox.mjs` | QuickJS with hard caps: 500 ms, 32 MB, 8 kB, no host. | **reality** |
| `kernel/capability.mjs` | What an author may know, and the written boundary it works inside. | **reality** |
| `kernel/payload.mjs` | What the browser (an observer) may see. | **reality** |
| `kernel/authors.mjs`, `provider.mjs` | The loop: the brief, the turn, the budget, the vendor call. | ours |
| `kernel/store.mjs`, `api/index.js`, `run-loop.mjs` | The world record, the Vercel entry, the heartbeat. | ours |

Nothing under `kernel/` is authored by a model, and nothing in it may be changed by one.

## The interface an author writes against

A program is a function body. It receives a frozen `env` and returns declarations.
It cannot assert an outcome — only declare a process, which the gate then accepts or
rejects. Unknown keys are refused outright and nothing is applied on rejection.

```js
// env
{ self:{ id,name,x,y,health,pack }, time:{ day,hour,season,tempC },
  here:{ x,y,region,water,soil,material,potable }, observed:[…tiles…],
  camp:{ x,y,stock,people,shelterPlaces }, standing:[…structures…], boundary:"…",
  allies:[…the other authors…], council:[…what they have said…] }

// return
{ say, tell, rest, move:{x,y}, draw:{water,soil,material}, take:{…}, store:{…},
  use:{…}, make:{…}, labor:hours,
  propose:{ name, x, y, mass, form|sprite, shelter, program } }
```

`tell` broadcasts to the shared council channel. `propose` begins a structure: the material has to
exist and is hauled to the site, the labour is computed by the kernel from the mass, and the people
have to build it before anything runs. `program` is the code that structure will execute once a
day, forever.

## What still has to be built

- **Persistence is done** (`kernel/store.mjs` + `api/index.js`, Upstash Redis with the v1
  token-checked commit), and **the author loop runs** (`kernel/authors.mjs`, the Vercel cron on
  `/api/tick`). What is open is the pacing: with nothing watching, the world moves at one
  simulation day per beat, and the beat is hourly.
- **People's inner lives.** Instinct handles water, food and shelter. Whether they get
  model-driven personas on top of that is open in the charter.
- **Islands and boats.** `../design/islands-and-boats.md` is kept as the plan.

