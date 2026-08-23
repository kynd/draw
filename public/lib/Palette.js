// Palette — a collection of OKLCH colors with construction and selection helpers.
// Copied from the stroke_designer project; the OKLCH model and the luminosity-step
// distribution are unchanged. Used by the Palette Maker demo and directly by drawings.

import { oklchToHex, maxChromaAt, mostVibrantL } from './color.js';

// ── Internal: luminosity steps for a single hue ──────────────────────────────
// Distributes N lightness values across [lumLow, lumHigh] with the most-vibrant
// L snapped to the nearest step so maximum chroma is always represented.
function computeLuminosities(H, N, lumHigh, lumLow) {
    if (N === 1) {
        const { L } = mostVibrantL(H);
        return [Math.max(lumLow, Math.min(lumHigh, L))];
    }
    const { L: vibL } = mostVibrantL(H);
    let k = 0, minD = Infinity;
    for (let i = 0; i < N; i++) {
        const L = lumHigh - i * (lumHigh - lumLow) / (N - 1);
        const d = Math.abs(L - vibL);
        if (d < minD) { minD = d; k = i; }
    }
    const adjL = Math.max(lumLow, Math.min(lumHigh, vibL));
    const result = new Array(N);
    result[k] = adjL;
    for (let i = 0; i < k; i++)
        result[i] = adjL + (lumHigh - adjL) * (k - i) / k;
    for (let i = k + 1; i < N; i++)
        result[i] = adjL - (adjL - lumLow) * (i - k) / (N - 1 - k);
    return result;
}

// ── Palette class ─────────────────────────────────────────────────────────────

export class Palette {
    // entries: [{hex, L?, C?, H?}]
    constructor(entries) {
        this._entries = entries.slice();
    }

    get entries() { return this._entries; }
    get length()  { return this._entries.length; }

    // All hex strings
    toHexArray() { return this._entries.map(e => e.hex); }

    // Random entry
    pick() {
        return this._entries[Math.floor(Math.random() * this._entries.length)];
    }

    // Two entries for a gradient fill: one at slot i, one ~half-way around the palette
    pickPair(i = null) {
        const n   = this._entries.length;
        const idx = (i ?? Math.floor(Math.random() * n)) % n;
        const jdx = (idx + Math.floor(n / 2) + 1) % n;
        return [this._entries[idx], this._entries[jdx]];
    }

    // Entry at fractional position t ∈ [0,1]
    sample(t) {
        const idx = Math.min(this._entries.length - 1, Math.floor(t * this._entries.length));
        return this._entries[Math.max(0, idx)];
    }

    // n evenly distributed entries
    spread(n) {
        const len = this._entries.length;
        if (n >= len) return this._entries.slice();
        if (n <= 1)   return [this._entries[Math.floor(len / 2)]];
        return Array.from({ length: n }, (_, i) =>
            this._entries[Math.round((i / (n - 1)) * (len - 1))]
        );
    }

    // ── Factory methods ──────────────────────────────────────────────────────

    // From an array of {hex, L?, C?, H?} objects (e.g. palette-maker output)
    static fromEntries(entries) {
        return new Palette(entries);
    }

    // From plain hex strings (e.g. palettes.js presets)
    static fromHexArray(hexArr) {
        return new Palette(hexArr.map(hex => ({ hex })));
    }

    // Generate from hue angles using the OKLCH model.
    // Returns one entry per (hue × luminosity step) combination.
    // Options:
    //   nLum    — number of luminosity steps per hue (default 4)
    //   lumHigh — brightest L value (default 0.85)
    //   lumLow  — darkest L value (default 0.30)
    //   vibHigh — chroma multiplier at max chroma (default 0.95)
    //   vibLow  — chroma multiplier at min chroma (default 0.30)
    static fromHues(hues, {
        nLum    = 4,
        lumHigh = 0.85,
        lumLow  = 0.30,
        vibHigh = 0.95,
        vibLow  = 0.30,
    } = {}) {
        const entries = [];
        for (const H of hues) {
            for (const L of computeLuminosities(H, nLum, lumHigh, lumLow)) {
                const maxC = maxChromaAt(L, H);
                const mult = vibLow + (vibHigh - vibLow) * Math.min(1, maxC / 0.4);
                const C    = maxC * mult;
                entries.push({ L, C, H, hex: oklchToHex(L, C, H) });
            }
        }
        return new Palette(entries);
    }
}
