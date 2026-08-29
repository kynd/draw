import * as THREE from 'three';
import { BlobRenderer } from './BlobRenderer.js';

/**
 * A blob shaded as stone: rock, marble, or sand.
 *
 * Rock is a craggy fold of noise shaded matte, with color patches between the two
 * tones. Marble is a smooth glossy dome whose color carries thin veins: a stripe
 * field warped by noise, folded to a line and sharpened. Sand is a matte grain of
 * per-pixel normal jitter with occasional glints.
 */
export class StoneBlobRenderer extends BlobRenderer {
    /** @param {'rock'|'marble'|'sand'} [opts.mode] */
    constructor({
        mode = 'rock',
        color = '#8a8078',
        colorB = '#4a443e',
        relief = 0.6,
        ...rest
    } = {}) {
        super({ margin: 0.15, ...rest });
        this.mode = { rock: 0, marble: 1, sand: 2 }[mode] ?? 0;
        this.color = color;
        this.colorB = colorB;
        this.relief = relief;
    }

    uniforms() {
        return {
            uMode: { value: this.mode },
            uColor: { value: new THREE.Color(this.color) },
            uColorB: { value: new THREE.Color(this.colorB) },
            uRelief: { value: this.relief },
        };
    }

    fragmentShader() {
        return /* glsl */`
            uniform int uMode;
            uniform vec3 uColor;
            uniform vec3 uColorB;
            uniform float uRelief;

            // Crags: folded noise over a swell, matte and sharp-edged in shading.
            float rockRelief(vec2 p) {
                float low = fbm(p * 1.6 + uSeed * 13.0);
                float crag = abs(2.0 * fbm(p * 3.4 + uSeed * 29.0) - 1.0);
                return mix(crag, low, 0.4);
            }

            void main() {
                float arc;
                vec2 outward;
                float d = sdBlob(vWorld, arc, outward);
                if (uMode == 0) {
                    // The boundary breaks on the same crags as the surface.
                    d += (rockRelief(vWorld) - 0.5) * 0.14;
                } else if (uMode == 2) {
                    // The edge dissolves into loose grains: a per-pixel jitter over
                    // a low wander, so the boundary scatters instead of cutting.
                    vec2 cellE = floor(vWorld * 900.0);
                    d += (hash21(cellE * 2.3 + uSeed * 7.0) - 0.5) * 0.02
                       + (fbm(vWorld * 7.0 + uSeed * 43.0) - 0.5) * 0.04;
                }
                float alpha = 1.0 - smoothstep(-0.006, 0.0, d);
                if (alpha <= 0.003) discard;

                float domeW = 0.3;
                float t = clamp(-d / domeW, 0.0, 1.0);
                float dome = t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
                float domeSlope = 30.0 * t * t * (t - 1.0) * (t - 1.0) / domeW;

                vec2 slope = outward * domeSlope * 0.05;
                vec3 color;
                float gloss;

                if (uMode == 0) {
                    float e = 0.012;
                    slope += vec2(
                        rockRelief(vWorld + vec2(e, 0.0)) - rockRelief(vWorld - vec2(e, 0.0)),
                        rockRelief(vWorld + vec2(0.0, e)) - rockRelief(vWorld - vec2(0.0, e))
                    ) / (2.0 * e) * uRelief * 0.6;
                    float mottle = fbm(vWorld * 2.4 + uSeed * 5.0);
                    color = mix(uColorB, uColor, smoothstep(0.3, 0.7, mottle));
                    // Crevices darken with the fold.
                    color *= 0.75 + 0.25 * rockRelief(vWorld);
                    gloss = 0.05;
                } else if (uMode == 1) {
                    // Veins: a stripe field warped by noise, folded to a line and
                    // sharpened, over a smooth glossy dome.
                    float warp = fbm(vWorld * 2.0 + uSeed * 11.0);
                    float stripe = sin((vWorld.x + vWorld.y) * 4.0 + warp * 9.0 + uSeed);
                    float vein = pow(1.0 - abs(stripe), 9.0);
                    float wisp = fbm(vWorld * 5.0 + uSeed * 23.0);
                    vec3 base = mix(vec3(0.93), uColor, 0.12 + 0.1 * wisp);
                    color = mix(base, uColorB, clamp(vein * (0.5 + 0.7 * wisp), 0.0, 1.0));
                    gloss = 0.7;
                } else {
                    // Sand: per-pixel normal jitter as grain, with sparse glints.
                    vec2 cell = floor(vWorld * 900.0);
                    vec2 jitter = (hash22(cell + uSeed) - 0.5) * uRelief * 0.5;
                    slope += jitter;
                    float speck = hash21(cell * 1.7 + uSeed * 3.0);
                    color = mix(uColorB, uColor, 0.4 + 0.45 * speck);
                    if (speck > 0.985) color += vec3(0.35);
                    gloss = 0.0;
                }
                vec3 normal = normalize(vec3(-slope, 1.0));

                vec3 light = normalize(vec3(-0.4, -0.7, 0.6));
                vec3 view = vec3(0.0, 0.0, 1.0);
                float diff = max(dot(normal, light), 0.0);
                vec3 halfVec = normalize(light + view);
                float spec = pow(max(dot(normal, halfVec), 0.0), 50.0) * gloss;

                gl_FragColor = vec4(clamp(color * (0.55 + 0.45 * diff) + vec3(spec), 0.0, 1.0), alpha);
            }
        `;
    }
}
