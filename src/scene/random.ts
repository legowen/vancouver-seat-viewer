/** Deterministic pseudo-random numbers, so every visit to a seat looks the same. */

/** 32-bit FNV-1a hash of a string. */
export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Mulberry32: a tiny, fast generator with good enough statistics for scenery. Values in [0, 1). */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A generator seeded from any number of strings, e.g. `seededRandom(auditoriumId, seatId)`. */
export function seededRandom(...parts: string[]): () => number {
  return mulberry32(hashString(parts.join('\u0000')));
}

/** A value in [min, max) from a generator. */
export function between(random: () => number, min: number, max: number): number {
  return min + (max - min) * random();
}
