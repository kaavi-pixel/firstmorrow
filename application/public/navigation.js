// Shared physical occupancy. Spacing around buildings is a construction rule,
// not a walking obstacle: people can use the empty access tiles.
export const LANDMARKS = Object.freeze([[4,8],[4,9],[5,8],[5,9],[3,4],[4,4],[2,5],[16,17],[17,17],[17,16],[17,3],[18,4],[18,5],[3,16],[4,17],[5,17]]);
export const pointKey = p => `${p.x},${p.y}`;
export function walkingObstacles(world) {
  return new Set([...LANDMARKS.map(([x,y]) => `${x},${y}`),
    ...world.buildings.map(pointKey)]);
}
export function safeCamp(world, preferred = {x:11,y:11}) {
  const blocked = walkingObstacles(world), candidates = [];
  for(let y=2;y<=19;y++)for(let x=2;x<=19;x++)
    if(!blocked.has(`${x},${y}`))candidates.push({x,y});
  candidates.sort((a,b)=>(Math.abs(a.x-preferred.x)+Math.abs(a.y-preferred.y))-
    (Math.abs(b.x-preferred.x)+Math.abs(b.y-preferred.y))||a.y-b.y||a.x-b.x);
  if(!candidates.length)throw new Error('No safe settlement anchor.');
  return candidates[0];
}
