/**
 * A small seeded generator, so a drawing that looks random redraws identically.
 *
 * `Math.random` would make every rebuild a different picture, which means a change to
 * one control could never be compared against the frame before it.
 */
export function seededRandom(seed = 1) {
    let a = Math.floor(seed * 2654435761) >>> 0;
    return function next() {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * A bounded stand-in for a raw seed, for use as a shader's noise-coordinate offset.
 *
 * A drawing's seed counter climbs without bound across a session (each gesture
 * advances it by at least a hundred). Once that raw seed enters a noise coordinate
 * (`p + uSeed * k`) at a few thousand, float32 no longer holds the fractional part
 * the hashes need, so the noise quantizes into blocks — worst on the hard-edged
 * metal reflection, which magnifies the steps. Folding the seed onto [0, 64) with a
 * golden-ratio (low-discrepancy) hash keeps the sampled coordinate precise while
 * leaving consecutive seeds far apart, so marks still decorrelate. The map is
 * deterministic, so the same seed reproduces the same offset on replay.
 */
export function seedOffset(seed) {
    const f = (seed * 0.61803398875) % 1;
    return (f < 0 ? f + 1 : f) * 64;
}
