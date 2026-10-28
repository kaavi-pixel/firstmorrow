// The three sprite painters, split out of art.js so that the observer can draw without
// importing the terrain.
//
// Why the split is not cosmetic: `public/terrain.mjs` is now the *world's* land module —
// it reads `process.env.FM_SUBDIVISIONS` at module scope and composes the planet — and
// `art.js` imports `terrainAt` from it. In a browser that import chain throws
// `process is not defined` before a single line of app.js runs, so the page renders
// nothing at all. The painters need none of that: they take an artifact or a person and
// draw pixels. Everything about the world stays out of the client's sprite path.

export function paintSprite(canvas, artifact) {
  canvas.width = 16; canvas.height = 16; const c = canvas.getContext('2d');
  c.clearRect(0, 0, 16, 16); c.imageSmoothingEnabled = false;
  artifact.sprite.forEach((row, y) => [...row].forEach((v, x) => {
    if (v !== '0') { c.fillStyle = artifact.palette[+v]; c.fillRect(x, y, 1, 1); }
  }));
}

export function paintPerson(canvas, person) {
  canvas.width = 8; canvas.height = 12; const c = canvas.getContext('2d');
  c.fillStyle = person.hair; c.fillRect(2, 0, 4, 3); c.fillStyle = '#dabd99'; c.fillRect(2, 2, 4, 3);
  c.fillStyle = person.color; c.fillRect(1, 5, 6, 4); c.fillRect(2, 4, 4, 2);
  c.fillStyle = '#d4b796'; c.fillRect(0, 6, 1, 3); c.fillRect(7, 6, 1, 3);
  c.fillStyle = '#4a4941'; c.fillRect(2, 9, 2, 3); c.fillRect(5, 9, 2, 3);
}

// AI inhabitants: pale robe and a floating marker so they read as different from the five people.
export function paintAgent(canvas, agent) {
  canvas.width = 8; canvas.height = 15; const c = canvas.getContext('2d');
  c.fillStyle = agent.color; c.fillRect(3, 0, 2, 1); c.fillRect(2, 1, 4, 1); c.fillRect(3, 2, 2, 1);
  c.fillStyle = '#3d4348'; c.fillRect(2, 3, 4, 3); c.fillStyle = '#c9b79e'; c.fillRect(2, 5, 4, 3);
  c.fillStyle = '#e8e4da'; c.fillRect(1, 8, 6, 5); c.fillRect(2, 7, 4, 2); c.fillStyle = agent.color; c.fillRect(3, 8, 2, 5);
  c.fillStyle = '#c9b79e'; c.fillRect(0, 9, 1, 3); c.fillRect(7, 9, 1, 3);
  c.fillStyle = '#4a4941'; c.fillRect(2, 13, 2, 2); c.fillRect(5, 13, 2, 2);
}
