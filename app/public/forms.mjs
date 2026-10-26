// The pixel forms, kept from v1.
//
// These are the 16x16 sprites the world has always drawn, plus the palette they
// use. They are *art*, not behaviour: the kernel does not care what a structure
// looks like beyond the width and height of the drawing. Inhabitants may name a
// form, or supply their own 16x16 drawing instead.

export const PALETTE = ['#000000', '#d7b880', '#aa7b50', '#624c39', '#8da17b', '#a3c0bf', '#e8dcc0', '#c2946a', '#778582'];

export function spriteFromShapes(shapes) {
  const rows = Array.from({ length: 16 }, () => Array(16).fill('0'));
  for (const [x, y, w, h, c] of shapes)
    for (let yy = y; yy < Math.min(16, y + h); yy++)
      for (let xx = x; xx < Math.min(16, x + w); xx++)
        if (xx >= 0 && yy >= 0) rows[yy][xx] = String(c);
  return rows.map(r => r.join(''));
}

export const hut = spriteFromShapes([[2,7,12,8,2],[4,4,8,3,7],[6,2,4,2,7],[1,7,14,2,3],[3,10,3,3,6],[7,11,3,4,3],[11,10,2,3,5],[2,15,12,1,3]]);
export const well = spriteFromShapes([[3,5,10,8,3],[4,6,8,6,5],[5,7,6,4,8],[2,13,12,2,2],[1,14,14,1,1],[3,3,1,4,7],[12,3,1,4,7],[3,2,10,2,6],[6,0,4,2,6],[7,4,2,2,1]]);
export const garden = spriteFromShapes([[1,11,14,4,2],[2,10,12,2,1],[3,8,2,4,4],[7,7,2,5,4],[11,9,2,3,4],[2,6,4,2,4],[6,5,4,2,4],[10,7,4,2,4],[7,3,2,2,6],[2,14,12,1,3]]);
export const solar = spriteFromShapes([[2,3,12,8,3],[3,4,10,6,8],[4,4,1,6,5],[7,4,1,6,5],[10,4,1,6,5],[3,6,10,1,5],[6,11,2,4,3],[9,11,2,4,3],[3,15,10,1,2]]);
export const hall = spriteFromShapes([[1,7,14,8,1],[2,6,12,2,7],[4,4,8,2,7],[6,2,4,2,6],[1,8,14,1,3],[3,10,2,5,3],[7,10,2,5,3],[11,10,2,5,3],[1,15,14,1,2]]);
export const workshop = spriteFromShapes([[2,6,12,9,1],[1,4,14,3,8],[3,3,10,1,8],[4,0,2,4,3],[3,10,4,4,3],[9,9,3,3,5],[10,13,2,2,3],[1,15,14,1,2]]);
// A plain cairn, used when a design names no form and draws nothing.
export const mark = spriteFromShapes([[7,1,2,2,6],[6,3,4,3,2],[5,6,6,4,3],[4,10,8,5,7]]);

export const FORMS = Object.freeze({ hut, well, garden, solar, hall, workshop, mark });

const SIZE = 16;
const DIGITS = new Set([...PALETTE.keys()].map(String));

// A drawing is 16 rows of 16 palette digits. Nothing else is accepted.
export function validSprite(sprite) {
  return Array.isArray(sprite) && sprite.length === SIZE &&
    sprite.every(row => typeof row === 'string' && row.length === SIZE && [...row].every(ch => DIGITS.has(ch)));
}
