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
        samplesPerUnit = 120,
        ...rest
    } = {}) {
        super({ inflate: 1.4, samplesPerUnit, ...rest });
        this.color = color;
        this.colors = colors;
        this.blend = blend;
        this.grain = grain;
        this.tooth = tooth;
        this.pressure = pressure;
        this.softness = softness;
        this.edge = edge;
        this.opacity = opacity;
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

            vec3 listColor(int i) {
                return i == 0 ? uC0 : i == 1 ? uC1 : i == 2 ? uC2 : uC3;
            }

            void main() {
                float across = capDistance();

                // Pressure wanders along the stroke, thinning the line and lightening it.
                float wander = fbm(vec2(vUv.x * uLength * 1.3, uSeed * 23.0));
                float press = 1.0 - uPressure * wander;

                float wobble = (fbm(vec2(vUv.x * uLength * 3.0, vCross * 1.5 + uSeed * 7.0)) - 0.5);
                float boundary = mix(0.55, 1.0, press) + wobble * uEdgeWobble;
                float body = smoothstep(boundary, boundary - uSoftness, across);
                if (body <= 0.001) discard;

                // Paper tooth, in screen space. Pigment catches its tops, so light
                // coverage breaks into speckle instead of fading evenly.
                // fbm rather than one octave: a single octave at pastel scale shows
                // its bilinear lattice, and the finer octaves read as grain dust.
                float tooth = fbm(screenUv() * uScreen / uTooth);
                tooth = (tooth - 0.5) * 1.6 + 0.5;
                float catchLevel = press * body;
                float cover = smoothstep(uGrain * (1.0 - catchLevel), 1.0, tooth * 0.6 + catchLevel * 0.55);

                float alpha = body * press * mix(1.0, cover, uGrain) * uOpacity;
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
                    // Each cell of the paper tooth takes its own color from the
                    // list, so the flecks read as mixed pigment.
                    vec2 cell = floor(screenUv() * uScreen / (uTooth * 1.5));
                    float h = fract(sin(dot(cell, vec2(127.1, 311.7)) + uSeed * 13.0) * 43758.5453);
                    color = listColor(int(h * float(uColorCount)));
                    color *= 0.85 + 0.3 * fract(h * 7.31);
                }
                gl_FragColor = vec4(color, alpha);
            }
        `;
    }
}
