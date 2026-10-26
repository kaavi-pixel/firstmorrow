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
```

One real second is one simulation minute. The world starts bare: five people, four days
of supplies, no structures, no authored code. Left alone, they starve. That is the point.

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

- **The author loop.** `kernel/world.mjs` exposes the `onProgram` hook; wiring it to real model
  calls (and the daily budget) is not done. Today no code is authored at all, so the world is a
  demonstration of the pressure rather than of the response.
- **Persistence.** `kernel/store.mjs` is memory-only. Production needs the Redis token-checked
  atomic commit — port the v1 `COMMIT_SCRIPT` pattern, do not reinvent it.
- **People's inner lives.** Instinct handles water, food and shelter. Whether they get
  model-driven personas on top of that is open in the charter.
- **Islands and boats.** `../design/islands-and-boats.md` is kept as the plan.
