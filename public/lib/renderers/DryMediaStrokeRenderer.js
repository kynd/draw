import * as THREE from 'three';
import { ShaderStrokeRenderer } from './ShaderStrokeRenderer.js';

/**
 * Dry media: pencil, charcoal, and pastel are one renderer at different settings.
 *
 * The grain lives in screen space, because it belongs to the paper rather than to the
 * stroke. Pigment catches the tops of the paper's tooth, so coverage is the tooth
 * noise thresholded, and a light line breaks into speckle before it disappears. What
 * separates the media is scale: the tooth is finer than a pencil line and coarser than
 * a pastel one, so `tooth` is in pixels and the width is the stroke's own.
 *
 * Pressure is a low-frequency noise along the stroke that scales both darkness and the
 * drawn width, the way a hand lightens without meaning to.
 *
 * With a `colors` list the media turn multicolor, by `blend`: 'along' shifts the
 * color along the stroke, like a pencil with a rainbow lead, and 'grain' colors
 * each cell of the paper tooth from the list, so the flecks read as mixed pigment.
 */
export class DryMediaStrokeRenderer extends ShaderStrokeRenderer {
    /**
     * @param {object} opts
     * @param {string} [opts.color]
     * @param {string[]} [opts.colors]  Multicolor list (up to four are used).
     * @param {'along'|'grain'} [opts.blend]  How the list divides the mark.
     * @param {number} [opts.grain]     How much the tooth breaks the line.
     * @param {number} [opts.tooth]     Tooth scale in pixels.
     * @param {number} [opts.pressure]  How far pressure wanders from full.
     * @param {number} [opts.softness]  Edge falloff, as a fraction of the half-width.
     * @param {number} [opts.edge]      Boundary wobble, as a fraction of the half-width.
     * @param {number} [opts.opacity]
     */
    constructor({
        color = '#2c2c31',
        colors = null,
        blend = 'along',
        grain = 0.55,
        tooth = 2.0,
        pressure = 0.45,
        softness = 0.35,
        edge = 0.08,
        opacity = 1.0,
        rag = 0,
        grainSoft = 0.6,
        samplesPerUnit = 120,
        ...rest
    } = {}) {
        // Dry media is translucent, so a self-overlapping gesture would
        // composite twice and darken into creases; each pixel shades once.
        super({ inflate: 1.4, samplesPerUnit, singleCoverage: true, ...rest });
        this.color = color;
        this.colors = colors;
        this.blend = blend;
        this.grain = grain;
        this.tooth = tooth;
        this.pressure = pressure;
        this.softness = softness;
        this.edge = edge;
        this.opacity = opacity;
        this.rag = rag;
        this.grainSoft = grainSoft;
    }

    uniforms() {
        const cs = (this.colors ?? []).slice(0, 4).map(c => new THREE.Color(c));
        while (cs.length && cs.length < 4) cs.push(cs[cs.length - 1]);
        return {
            uColor: { value: new THREE.Color(this.color) },
            uC0: { value: cs[0] ?? new THREE.Color(this.color) },
            uC1: { value: cs[1] ?? new THREE.Color(this.color) },
            uC2: { value: cs[2] ?? new THREE.Color(this.color) },
            uC3: { value: cs[3] ?? new THREE.Color(this.color) },
            uColorMode: { value: this.colors ? (this.blend === 'grain' ? 2 : 1) : 0 },
            uColorCount: { value: Math.min(this.colors?.length ?? 0, 4) },
            uGrain: { value: this.grain },
            uTooth: { value: this.tooth },
            uPressure: { value: this.pressure },
            uSoftness: { value: this.softness },
            uEdgeWobble: { value: this.edge },
            uOpacity: { value: this.opacity },
            uRag: { value: this.rag },
            uGrainSoft: { value: this.grainSoft },
        };
    }

    fragmentShader() {
        return /* glsl */`
            uniform vec3 uColor;
            uniform vec3 uC0; uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3;
            uniform int uColorMode;
            uniform int uColorCount;
            uniform float uGrain;
            uniform float uTooth;
            uniform float uPressure;
            uniform float uSoftness;
            uniform float uEdgeWobble;
            uniform float uOpacity;
            uniform float uRag;
            uniform float uGrainSoft;

            vec3 listColor(int i) {
                return i == 0 ? uC0 : i == 1 ? uC1 : i == 2 ? uC2 : uC3;
            }

            void main() {
                float across = raggedCapDistance(uRag);

                // Pressure wanders along the stroke, thinning the line and lightening it.
                float wander = fbm(vec2(vUv.x * uLength * 1.3, uSeed * 23.0));
                float press = 1.0 - uPressure * wander;

                float wobble = (fbm(vec2(vUv.x * uLength * 3.0, vCross * 1.5 + uSeed * 7.0)) - 0.5);
                float boundary = mix(0.55, 1.0, press) + wobble * uEdgeWobble;
                // The edge falls from 1 in the interior to 0 past the boundary.
                float edgeLevel = smoothstep(boundary, boundary - uSoftness, across);
                if (edgeLevel <= 0.001) discard;

                // Paper tooth, in screen space: the high-frequency grain the pigment
                // catches on. fbm rather than one octave, so the finer octaves read as
                // grain dust rather than a bilinear lattice.
                float tooth = fbm(screenUv() * uScreen / uTooth);
                tooth = clamp((tooth - 0.5) * 1.4 + 0.5, 0.0, 1.0);

                // The mark takes where the tooth rises above a threshold that climbs from
                // the interior out past the edge, so the boundary dissolves into sparser
                // and sparser flecks instead of fading as a smooth feather. The interior
                // threshold is low, so it fills in as a grainy body; uGrain and a lighter
                // pressure lift it, catching on fewer tooth tops.
                float threshold = mix(0.9, uGrain * 0.14, edgeLevel) + (1.0 - press) * 0.2;
                float grainMask = smoothstep(threshold - uGrainSoft, threshold + uGrainSoft, tooth);

                // Multiply the grain mask by a continuous tonal noise, so the flecks vary
                // in darkness like real pigment settling rather than reading as one flat
                // value. Centred so the darkest flecks stay full and only some lighten.
                float dust = fbm(screenUv() * uScreen / (uTooth * 0.45) + uSeed * 41.0);
                dust = clamp((dust - 0.5) * 1.8 + 0.5, 0.0, 1.0);
                float alpha = grainMask * mix(0.5, 1.0, dust) * uOpacity;
                if (alpha <= 0.004) discard;

                vec3 color = uColor;
                if (uColorMode == 1) {
                    // The color shifts along the stroke, like a rainbow lead:
                    // the list cycles with arc length, blending at the joins.
                    float f = fract(vUv.x * uLength * 0.45 + uSeed * 0.17) * float(uColorCount);
                    int i0 = int(floor(f));
                    int i1 = int(mod(floor(f) + 1.0, float(uColorCount)));
                    color = mix(listColor(i0), listColor(i1), smoothstep(0.25, 0.75, fract(f)));
                } else if (uColorMode == 2) {
                    // Each patch of pigment takes its own color from a cellular (Worley)
                    // layout: the nearest of a set of jittered points, hashed to a color.
                    // Voronoi cells are organic, so the colors read as irregular flecks
                    // rather than the squares a floor grid gives.
                    vec2 sp = screenUv() * uScreen;
                    // A per-pixel jitter of the sample point, so pixels near a cell
                    // boundary fall either way and the colour separation reads fuzzy
                    // rather than a hard Voronoi edge.
                    vec2 jit = (vec2(hash21(sp + uSeed * 3.0), hash21(sp.yx + uSeed * 5.0)) - 0.5) * 0.55;
                    vec2 g = sp / (uTooth * 0.8) + jit;
                    vec2 gi = floor(g), gf = fract(g);
                    float best = 1e9;
                    vec2 bestCell = gi;
                    for (int y = -1; y <= 1; y++) {
                        for (int x = -1; x <= 1; x++) {
                            vec2 o = vec2(float(x), float(y));
                            vec2 fp = o + vec2(hash21(gi + o + uSeed), hash21(gi + o + uSeed + 7.13));
                            vec2 dd = fp - gf;
                            float dist = dot(dd, dd);
                            if (dist < best) { best = dist; bestCell = gi + o; }
                        }
                    }
                    float idx = floor(hash21(bestCell + uSeed * 31.0) * float(uColorCount));
                    color = listColor(int(idx));
                    float sparkle = fract(sin(dot(sp, vec2(12.9898, 78.233)) + uSeed * 3.0) * 43758.5453);
                    color *= 0.82 + 0.32 * sparkle;
                }
                gl_FragColor = vec4(color, alpha);
            }
        `;
    }
}
