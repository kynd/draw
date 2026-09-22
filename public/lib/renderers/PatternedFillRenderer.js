import * as THREE from 'three';
import { BlobRenderer } from './BlobRenderer.js';

/**
 * A flat fill whose interior is a repeating pattern, evaluated in the shader over world
 * space so the pattern is the same wherever the shape lands. Three patterns:
 *
 *   dots     circles on a hexagonal lattice, each a random color from `colors`, with a
 *            small seeded offset from its lattice point; the gaps take `background`.
 *   squares  a grid turned 45 degrees, a colored square inset in each cell, no offset.
 *   waves    two colors of `colors` in alternating bands that undulate, after Bridget
 *            Riley.
 *
 * The shape and its antialiased edge come from the base class's `sdBlob`; the pattern
 * only chooses the interior color.
 */
export class PatternedFillRenderer extends BlobRenderer {
    /**
     * @param {object} opts
     * @param {'dots'|'squares'|'waves'} [opts.pattern]
     * @param {string[]} [opts.colors]      Palette the pattern draws from.
     * @param {string} [opts.background]    Gap color for dots and squares.
     * @param {number} [opts.scale]         Cell or band size, in world units.
     * @param {number} [opts.jitter]        Dot offset, as a fraction of the cell.
     * @param {number} [opts.inset]         Square inset, as a fraction of the cell.
     * @param {number} [opts.waveAmp]       Wave displacement, in world units.
     * @param {number} [opts.waveFreq]      Wave rate along the band.
     */
    constructor({
        pattern = 'dots',
        colors = ['#c22a4a', '#f0e6da', '#2a7a5a', '#f0c040'],
        background = '#efe9df',
        scale = 0.15,
        jitter = 0.15,
        inset = 0.12,
        waveAmp = 0.12,
        waveFreq = 6,
        ...rest
    } = {}) {
        super(rest);
        this.pattern = pattern;
        this.colors = colors;
        this.background = background;
        this.scale = scale;
        this.jitter = jitter;
        this.inset = inset;
        this.waveAmp = waveAmp;
        this.waveFreq = waveFreq;
    }

    uniforms() {
        const cs = this.colors.slice(0, 6).map(c => new THREE.Color(c));
        while (cs.length < 6) cs.push(cs[cs.length - 1] ?? new THREE.Color('#888888'));
        return {
            uPattern: { value: { dots: 0, squares: 1, waves: 2 }[this.pattern] ?? 0 },
            uC0: { value: cs[0] }, uC1: { value: cs[1] }, uC2: { value: cs[2] },
            uC3: { value: cs[3] }, uC4: { value: cs[4] }, uC5: { value: cs[5] },
            uColorCount: { value: Math.max(1, Math.min(this.colors.length, 6)) },
            uBg: { value: new THREE.Color(this.background) },
            uScale: { value: this.scale },
            uJitter: { value: this.jitter },
            uSquareInset: { value: this.inset },
            uWaveAmp: { value: this.waveAmp },
            uWaveFreq: { value: this.waveFreq },
        };
    }

    fragmentShader() {
        return /* glsl */`
            uniform int uPattern;
            uniform vec3 uC0; uniform vec3 uC1; uniform vec3 uC2;
            uniform vec3 uC3; uniform vec3 uC4; uniform vec3 uC5;
            uniform int uColorCount;
            uniform vec3 uBg;
            uniform float uScale;
            uniform float uJitter;
            uniform float uSquareInset;
            uniform float uWaveAmp;
            uniform float uWaveFreq;

            vec3 listColor(int i) {
                return i == 0 ? uC0 : i == 1 ? uC1 : i == 2 ? uC2
                     : i == 3 ? uC3 : i == 4 ? uC4 : uC5;
            }
            vec3 pickColor(vec2 cell) {
                int i = int(hash21(cell * 7.3 + uSeed * 3.1) * float(uColorCount));
                if (i >= uColorCount) i = uColorCount - 1;
                return listColor(i);
            }

            // Dots on a hexagonal lattice: the nearest of the surrounding lattice
            // points, each nudged by a small seeded offset, drawn as a disc.
            vec3 dots(vec2 p) {
                float s = uScale;
                float rowH = s * 0.8660254;
                int j0 = int(floor(p.y / rowH + 0.5));
                float best = 1e9; vec2 bestCell = vec2(0.0);
                for (int dj = -1; dj <= 1; dj++) {
                    int j = j0 + dj;
                    float xoff = mod(float(j), 2.0) * s * 0.5;
                    int i0 = int(floor((p.x - xoff) / s + 0.5));
                    for (int di = -1; di <= 1; di++) {
                        vec2 cell = vec2(float(i0 + di), float(j));
                        vec2 jit = (hash22(cell + uSeed * 1.7) - 0.5) * s * uJitter;
                        vec2 center = vec2(cell.x * s + xoff, cell.y * rowH) + jit;
                        float dd = distance(p, center);
                        if (dd < best) { best = dd; bestCell = cell; }
                    }
                }
                float aa = fwidth(best) + 1e-4;
                float t = 1.0 - smoothstep(s * 0.46 - aa, s * 0.46 + aa, best);
                return mix(uBg, pickColor(bestCell), t);
            }

            // Squares on a 45-degree grid, each inset inside its cell.
            vec3 squares(vec2 p) {
                float s = uScale;
                float c = 0.7071068;
                vec2 q = vec2(p.x * c - p.y * c, p.x * c + p.y * c);
                vec2 cell = floor(q / s);
                vec2 local = abs(fract(q / s) - 0.5);
                float dsq = max(local.x, local.y);
                float sqHalf = 0.5 - uSquareInset;
                float aa = fwidth(dsq) + 1e-4;
                float t = 1.0 - smoothstep(sqHalf - aa, sqHalf + aa, dsq);
                return mix(uBg, pickColor(cell), t);
            }

            // Two colors in undulating bands.
            vec3 waves(vec2 p) {
                float wave = p.x + uWaveAmp * sin(p.y * uWaveFreq);
                float sv = sin(3.14159265 * wave / uScale);
                // Analytic antialiasing of the band's sign, so the edges stay smooth.
                float t = clamp(0.5 * sv / (fwidth(sv) + 1e-4) + 0.5, 0.0, 1.0);
                return mix(uC0, uC1, t);
            }

            void main() {
                float arc;
                vec2 outward;
                float d = sdBlob(vWorld, arc, outward);
                float alpha = 1.0 - smoothstep(-0.006, 0.006, d);
                if (alpha <= 0.003) discard;
                vec3 col = uPattern == 0 ? dots(vWorld)
                         : uPattern == 1 ? squares(vWorld) : waves(vWorld);
                gl_FragColor = vec4(col, alpha);
            }
        `;
    }
}
