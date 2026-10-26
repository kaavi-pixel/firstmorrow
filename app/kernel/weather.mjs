// Weather. This is reality, not a feature.
//
// Nothing here is authored or authorable. It runs on simulation time, is seeded
// so any replay agrees, and it is the thing that makes the world dangerous:
// storms destroy what was not built to stand, heat and cold take people who have
// no shelter, and drought empties the land.
//
// Deliberately simple and explicitly covered in game units — see RULES. It is
// not a climate model and does not claim to be one.

export const WEATHER = Object.freeze({
  yearDays: 365,
  // Seasonal swing, in degrees C, around each region's baseline.
  summerPeakC: 41,
  winterLowC: 7,
  // Storm probability per day, by season. Storms are the destructive event.
  stormChance: { summer: 0.045, autumn: 0.075, winter: 0.07, spring: 0.08 },
  stormSeverity: { min: 0.35, max: 1 },
  // A structure survives a storm if its mass beats severity × this figure.
  stormMassPerSeverity: 55,
  // Health lost per storm hour, outdoors, scaled by the tile's exposure.
  exposureDamagePerHour: 9,
  // People this close to a finished shelter are protected from a storm.
  shelterRadius: 2,
});

export const season = dayIndex => {
  const d = ((dayIndex % WEATHER.yearDays) + WEATHER.yearDays) % WEATHER.yearDays;
  return d < 92 ? 'summer' : d < 184 ? 'autumn' : d < 276 ? 'winter' : 'spring';
};

// Seeded, so the same world always lives through the same weather.
function roll(seed, dayIndex, salt) {
  let h = Math.imul(dayIndex | 0, 2246822519) ^ Math.imul(salt | 0, 3266489917) ^ Math.imul(seed | 0, 374761393);
  h = Math.imul(h ^ (h >>> 15), 668265263);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

export function createWeather(seed = 2049) {
  return { seed, day: -1, storms: [], log: [] };
}

// Advance to the given simulation day. Idempotent for a day already resolved.
export function advanceWeather(W, dayIndex) {
  while (W.day < dayIndex) {
    W.day++;
    const s = season(W.day);
    const tilt = { summer: 0, autumn: 1, winter: 2, spring: 3 }[s];
    const seasonal = [1, 0.35, 0, 0.6][tilt];
    // Baseline runs a slow multi-day wave so no two days are identical.
    const wave = Math.sin(W.day / 6.5 + W.seed * 0.001) * 0.5 + 0.5;
    const tempC = Math.round(WEATHER.winterLowC + (WEATHER.summerPeakC - WEATHER.winterLowC) * (0.72 * seasonal + 0.28 * wave));
    const humidity = Math.round(18 + roll(W.seed, W.day, 11) * 40 + (s === 'winter' ? 20 : 0));
    const rainMm = roll(W.seed, W.day, 29) < 0.18 ? Math.round(roll(W.seed, W.day, 31) * 26) : 0;

    let storm = null;
    if (roll(W.seed, W.day, 77) < WEATHER.stormChance[s]) {
      const severity = WEATHER.stormSeverity.min + roll(W.seed, W.day, 91) * (WEATHER.stormSeverity.max - WEATHER.stormSeverity.min);
      storm = { day: W.day, hour: Math.floor(roll(W.seed, W.day, 97) * 12) + 8, severity: Math.round(severity * 100) / 100, season: s };
    }
    W.storms.push(storm ? { ...storm } : null);
    if (rainMm > 0) W.log.push({ day: W.day, kind: 'rain', text: `${rainMm} mm of rain.` });
    if (storm) W.log.push({ day: W.day, kind: 'storm', text: `A ${s} storm (${Math.round(storm.severity * 100)}% severity) hit at ${String(storm.hour).padStart(2, '0')}:00.` });
    if (W.log.length > 400) W.log.splice(0, W.log.length - 400);
  }
  return W;
}

export function weatherOn(W, dayIndex) {
  const i = Math.max(0, Math.min(W.day, dayIndex));
  const s = season(i);
  const tilt = { summer: 0, autumn: 1, winter: 2, spring: 3 }[s];
  const seasonal = [1, 0.35, 0, 0.6][tilt];
  const wave = Math.sin(i / 6.5 + W.seed * 0.001) * 0.5 + 0.5;
  return {
    day: i, season: s,
    tempC: Math.round(WEATHER.winterLowC + (WEATHER.summerPeakC - WEATHER.winterLowC) * (0.72 * seasonal + 0.28 * wave)),
    humidity: Math.round(18 + roll(W.seed, i, 11) * 40 + (s === 'winter' ? 20 : 0)),
    storm: W.storms[i] || null,
  };
}

// A storm's severity against a structure's mass. Returns null if it stands.
export function stormEffect(storm, structure) {
  if (!storm) return null;
  const torn = storm.severity * WEATHER.stormMassPerSeverity - structure.mass;
  if (torn <= 0) return { survived: true };
  // Flimsy things are destroyed outright; heavier things are damaged or lose
  // whatever was unfinished.
  if (torn >= 22 || structure.mass < 12) return { destroyed: true };
  return { damaged: true, hoursLost: structure.built ? 0 : structure.progressHours };
}
