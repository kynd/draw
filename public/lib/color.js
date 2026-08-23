// OKLCH ↔ sRGB color model utilities
// All functions operate in OKLCH space: L ∈ [0,1], C ∈ [0,~0.4], H ∈ [0,360).

// ── Core conversions ──────────────────────────────────────────────────────────

export function oklchToLinear(L, C, H) {
    const h = H * Math.PI / 180;
    const a = C * Math.cos(h);
    const b = C * Math.sin(h);
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
    const lc = l_ * l_ * l_;
    const mc = m_ * m_ * m_;
    const sc = s_ * s_ * s_;
    return [
         4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc,
        -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc,
        -0.0041960863 * lc - 0.7034186147 * mc + 1.7076147010 * sc,
    ];
}

function srgbByte(v) {
    if (v <= 0) return 0;
    if (v >= 1) return 255;
    return Math.round((v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055) * 255);
}

export function oklchToHex(L, C, H) {
    const [r, g, b] = oklchToLinear(L, C, H);
    return '#' + srgbByte(r).toString(16).padStart(2, '0')
               + srgbByte(g).toString(16).padStart(2, '0')
               + srgbByte(b).toString(16).padStart(2, '0');
}

// ── Gamut utilities ───────────────────────────────────────────────────────────

export function inGamut(L, C, H) {
    const [r, g, b] = oklchToLinear(L, C, H);
    return r >= -5e-4 && r <= 1.0005 && g >= -5e-4 && g <= 1.0005 && b >= -5e-4 && b <= 1.0005;
}

// Maximum sRGB-displayable chroma at given L and H (binary search, 24 iterations ≈ 0.00001 precision)
export function maxChromaAt(L, H) {
    if (!inGamut(L, 0, H)) return 0;
    let lo = 0, hi = 0.4;
    for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        if (inGamut(L, mid, H)) lo = mid; else hi = mid;
    }
    return lo;
}

// Lightness that maximises chroma for a given hue (scans 61 steps across L ∈ [0.05,0.95])
export function mostVibrantL(H) {
    let bestL = 0.5, bestC = 0;
    for (let i = 0; i <= 60; i++) {
        const L = 0.05 + i * 0.9 / 60;
        const C = maxChromaAt(L, H);
        if (C > bestC) { bestC = C; bestL = L; }
    }
    return { L: bestL, C: bestC };
}

// A perceptually vivid display color for hue H — useful for rings, chips, labels
export function hueSwatchColor(H) {
    const C = maxChromaAt(0.65, H) * 0.85;
    return oklchToHex(0.65, C, H);
}
