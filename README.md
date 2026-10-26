# Firstmorrow

A persistent pixel-art world. Five people on bare land, living as we do. An AI writes
the code that makes their lives better; the people build it by hand, so it takes days.
The world keeps going while you are away.

**This is a restart.** The first attempt had the shape right and the ratios wrong: we
coded the world's features *for* the inhabitants — an economy, a physics model, a travel
engine, a building catalogue — and nothing in it could hurt. The people could not starve,
weather could not destroy, and no one ever died.

v2 inverts it:

| | Who | Mortal? | What they do |
|---|---|---|---|
| **Us** | the builders of the world | — | write and own **reality** |
| **The people** | Ada, Ren, Mika, Sol, Ivo and their children | **yes** | live, eat, work, age, suffer, reproduce, die |
| **The AI** | the model that authors the world's features | **no** | write code that makes these lives better |

Reality is the boundary: finite matter, real weather that destroys, hunger, exposure,
ageing, death, birth. Nobody changes it. The AI may add anything reality permits.

Start with [`CHARTER.md`](CHARTER.md), then [`app/README.md`](app/README.md).

## Kept from the first attempt

- **The spritework** — `app/public/art.js` and `app/public/forms.mjs`. Pixels unchanged.
- **The purpose** — restated in the charter.
- **The island plan** — `design/`, including the Tasmania archipelago and its
  mainland-rooted discovery chain.

## Run it

```sh
cd app
npm install
npm test          # 41 tests: reality bites, the gate refuses, the sandbox holds
PORT=3000 node server.mjs
```

Left alone with no authored code, the five people look after their own water, eat through their
supplies in four days, weaken for a month, and are all dead by around day 44 — the real starvation
window, not a made-up one. That is the starting condition, not a bug.
