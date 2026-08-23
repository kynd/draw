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
