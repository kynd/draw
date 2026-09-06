// ThemedPaletteMaker — a palette from a key hue, a color count, and a theme.
// The theme decides everything past those three inputs: which hues are used,
// and how light and how saturated each color is. Every theme except black
// jitters the hue and lightness of the colors other than the key color, from
// a seed, so the same settings reproduce the same palette. Experimental; the
// Palette Maker's fromHues model is unchanged.

import { Palette } from './Palette.js';
import { oklchToHex, maxChromaAt, mostVibrantL } from './color.js';
import { seededRandom } from './random.js';

export const PALETTE_THEMES = [
    { id: 'mono',           label: 'Monochrome' },
    { id: 'vivid-dark',     label: 'Vivid & dark' },
    { id: 'pastel-cluster', label: 'Pastel cluster' },
    { id: 'dark-cluster',   label: 'Dark cluster' },
    { id: 'vivid-wheel',    label: 'Vivid wheel' },
    { id: 'black',          label: 'Black' },
];

function entry(L, C, H) {
    const h = ((H % 360) + 360) % 360;
    return { L, C, H: h, hex: oklchToHex(L, C, h) };
}

function clampL(L) { return Math.max(0.05, Math.min(0.97, L)); }

// Symmetric jitter: ±amount.
function jit(rng, amount) { return (rng() * 2 - 1) * amount; }

// Each hue's most prototypical color, the one people recognize by the
// simplest color term (red, green, pink), sits at a particular lightness,
// not at the hue's max-chroma point: yellow is only yellow when bright,
// while green and blue are their names well below their chroma peaks.
// Anchored per color term, interpolated around the wheel. The prototypes
// are cultural; the anchors are one such choice.
const REPR_ANCHORS = [
    [30, 0.58],   // red
    [65, 0.72],   // orange
    [100, 0.90],  // yellow
    [130, 0.82],  // yellow-green
    [145, 0.50],  // green
    [200, 0.70],  // cyan
    [265, 0.45],  // blue
    [305, 0.45],  // purple
    [340, 0.58],  // magenta
    [355, 0.78],  // pink
];

export function representativeL(H) {
    const h = ((H % 360) + 360) % 360;
    const n = REPR_ANCHORS.length;
    for (let i = 0; i < n; i++) {
        const [h0, l0] = REPR_ANCHORS[i];
        const [h1raw, l1] = REPR_ANCHORS[(i + 1) % n];
        const h1 = i === n - 1 ? h1raw + 360 : h1raw;
        const hh = h < h0 ? h + 360 : h;
        if (hh >= h0 && hh <= h1) {
            const t = (hh - h0) / (h1 - h0);
            return l0 + (l1 - l0) * t;
        }
    }
    return 0.6;
}

// Hues spread evenly around the whole wheel, starting at the key hue.
function wheelHues(hue, n) {
    return Array.from({ length: n }, (_, i) => hue + (i * 360) / n);
}

// Hues clustered around the key hue: the key first, then alternating steps to
// either side, out to span/2 at the farthest.
function clusteredHues(hue, n, span) {
    if (n === 1) return [hue];
    const reach = Math.floor(n / 2);
    const step = span / 2 / reach;
    const hues = [hue];
    for (let m = 1; hues.length < n; m++) {
        hues.push(hue + m * step);
        if (hues.length < n) hues.push(hue - m * step);
    }
    return hues;
}

// One hue, the most vibrant color first, the rest dividing L as evenly as the
// fixed first color allows, then jittered around their slots. C is the
// largest sRGB can show at each L.
function mono(hue, n, rng) {
    const { L: vibL } = mostVibrantL(hue);
    if (n === 1) return [entry(vibL, maxChromaAt(vibL, hue), hue)];
    const HI = 0.92, LO = 0.18;
    const pinned = Math.max(LO, Math.min(HI, vibL));
    let k = 0, minD = Infinity;
    for (let i = 0; i < n; i++) {
        const L = HI - (i * (HI - LO)) / (n - 1);
        const d = Math.abs(L - pinned);
        if (d < minD) { minD = d; k = i; }
    }
    const Ls = new Array(n);
    Ls[k] = pinned;
    for (let i = 0; i < k; i++) Ls[i] = pinned + ((HI - pinned) * (k - i)) / k;
    for (let i = k + 1; i < n; i++) Ls[i] = pinned - ((pinned - LO) * (i - k)) / (n - 1 - k);
    const gap = (HI - LO) / (n - 1);
    const order = [k, ...Ls.map((_, i) => i).filter(i => i !== k)];
    return order.map((i, o) => {
        if (o === 0) return entry(Ls[i], maxChromaAt(Ls[i], hue), hue);
        const L = clampL(Ls[i] + jit(rng, gap * 0.3));
        const h = hue + jit(rng, 6);
        return entry(L, maxChromaAt(L, h), h);
    });
}

// The whole wheel divided evenly; the half nearest the key hue vivid at each
// hue's representative lightness, the far half dark.
function vividDark(hue, n, rng) {
    const step = 360 / n;
    const dist = i => Math.min((i * step) % 360, 360 - ((i * step) % 360));
    const ranked = Array.from({ length: n }, (_, i) => i).sort((a, b) => dist(a) - dist(b));
    const vivid = new Set(ranked.slice(0, Math.ceil(n / 2)));
    return wheelHues(hue, n).map((h0, i) => {
        const h = i === 0 ? h0 : h0 + jit(rng, 12);
        if (vivid.has(i)) {
            const L = clampL(representativeL(h) + (i === 0 ? 0 : jit(rng, 0.04)));
            return entry(L, maxChromaAt(L, h) * 0.95, h);
        }
        const L = clampL(0.3 + jit(rng, 0.06));
        return entry(L, maxChromaAt(L, h) * 0.65, h);
    });
}

// Hues clustered near the key hue, all light and low in chroma.
function pastelCluster(hue, n, rng) {
    return clusteredHues(hue, n, 150).map((h0, i) => {
        const h = i === 0 ? h0 : h0 + jit(rng, 15);
        const L = clampL(0.86 + (i === 0 ? 0 : jit(rng, 0.045)));
        return entry(L, Math.min(maxChromaAt(L, h) * 0.5, 0.09), h);
    });
}

// Hues clustered near the key hue, all dark.
function darkCluster(hue, n, rng) {
    return clusteredHues(hue, n, 120).map((h0, i) => {
        const h = i === 0 ? h0 : h0 + jit(rng, 12);
        const L = clampL(0.28 + (i === 0 ? 0 : jit(rng, 0.05)));
        return entry(L, maxChromaAt(L, h) * 0.7, h);
    });
}

// The whole wheel divided evenly, every color near its hue's most vibrant
// point.
function vividWheel(hue, n, rng) {
    return wheelHues(hue, n).map((h0, i) => {
        const h = i === 0 ? h0 : h0 + jit(rng, 12);
        const { L: vibL } = mostVibrantL(h);
        const L = clampL(vibL + (i === 0 ? 0 : jit(rng, 0.05)));
        return entry(L, maxChromaAt(L, h) * 0.97, h);
    });
}

function black(hue, n) {
    return Array.from({ length: n }, () => entry(0, 0, hue));
}

const GENERATORS = {
    'mono': mono,
    'vivid-dark': vividDark,
    'pastel-cluster': pastelCluster,
    'dark-cluster': darkCluster,
    'vivid-wheel': vividWheel,
    'black': black,
};

// A near-white paper tint of a hue, for a demo's background behind a themed
// palette.
export function paperColor(hue, rng = Math.random) {
    const L = 0.9 + rng() * 0.05;
    const C = Math.min(maxChromaAt(L, hue) * 0.35, 0.03 + rng() * 0.03);
    return oklchToHex(L, C, hue);
}

// A themed palette at a random key hue and seed, for a demo's reroll button.
export function randomThemedPalette(theme, count = 5) {
    return new ThemedPaletteMaker({
        hue: Math.random() * 360, count, theme,
        seed: Math.floor(Math.random() * 1e9),
    }).generate();
}

export class ThemedPaletteMaker {
    /**
     * @param {object} opts
     * @param {number} [opts.hue]    The key hue, degrees.
     * @param {number} [opts.count]  How many colors.
     * @param {string} [opts.theme]  A theme id from PALETTE_THEMES.
     * @param {number} [opts.seed]   Drives the jitter; same seed, same palette.
     */
    constructor({ hue = 24, count = 5, theme = 'mono', seed = 1 } = {}) {
        this.hue = hue;
        this.count = count;
        this.theme = theme;
        this.seed = seed;
    }

    /** @returns {Palette} */
    generate() {
        const gen = GENERATORS[this.theme] ?? mono;
        const rng = seededRandom(this.seed);
        return Palette.fromEntries(gen(this.hue, Math.max(1, Math.round(this.count)), rng));
    }
}
