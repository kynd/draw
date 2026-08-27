import * as THREE from 'three';
import { BlobRenderer } from './BlobRenderer.js';

/**
 * An opaque paint fill with relief.
 *
 * Height is an edge dome plus interior noise. The dome is a smoothstep of distance
 * whose slope is taken analytically, so the rise eases into the flat interior with no
 * crease. The noise mixes a low frequency for broad swell with a high one for
 * detail, and the high band can be folded into ridges (the fold of 1-|2n-1| has a
 * corner at each crest, which is what keeps thick paint's ridges sharp).
 *
 * `dry` breaks the fill the way a dry brush does: a streak noise stretched along a
 * seeded direction erodes both the edge and the interior, leaving rough transparent
 * scratches where the paint ran out.
 */
export class PaintBlobRenderer extends BlobRenderer {
    constructor({
        color = '#7a4a2f',
        fade = 0.1,        // pigment mottling
        relief = 0.3,      // noise height
        swell = 0.5,       // low-frequency share of the height
        ridged = false,
        gloss = 0.3,
        edgeSoft = 0.03,   // alpha feather width
        dry = 0,           // dry-brush erosion
        noiseFreq = 5,
        ...rest
    } = {}) {
        super({ margin: 0.15, ...rest });
        this.color = color;
        this.fade = fade;
        this.relief = relief;
        this.swell = swell;
        this.ridged = ridged;
        this.gloss = gloss;
        this.edgeSoft = edgeSoft;
        this.dry = dry;
        this.noiseFreq = noiseFreq;
    }

    uniforms() {
        return {
            uColor: { value: new THREE.Color(this.color) },
            uFade: { value: this.fade },
            uRelief: { value: this.relief },
            uSwell: { value: this.swell },
            uRidged: { value: this.ridged ? 1 : 0 },
            uGloss: { value: this.gloss },
            uEdgeSoft: { value: this.edgeSoft },
            uDry: { value: this.dry },
            uFreq: { value: this.noiseFreq },
        };
    }

    fragmentShader() {
        return /* glsl */`
            uniform vec3 uColor;
            uniform float uFade;
            uniform float uRelief;
            uniform float uSwell;
            uniform int uRidged;
            uniform float uGloss;
            uniform float uEdgeSoft;
            uniform float uDry;
            uniform float uFreq;

            float reliefAt(vec2 p) {
                float low = fbm(p * 1.6 + uSeed * 13.0);
                float high = fbm(p * uFreq + uSeed * 29.0);
                if (uRidged == 1) {
                    high = 1.0 - abs(2.0 * high - 1.0);
                    high = high * high;
                }
                return mix(high, low, uSwell);
            }

            void main() {
                float arc;
                vec2 outward;
                float d = sdBlob(vWorld, arc, outward);
                float alpha = 1.0 - smoothstep(-uEdgeSoft, 0.0, d);
                if (alpha <= 0.003) discard;

                // Dry brush: streaks stretched along a seeded direction erode the
                // edge and scratch the interior open.
                if (uDry > 0.0) {
                    float angle = hash11(uSeed * 3.7) * 6.2832;
                    vec2 dir = vec2(cos(angle), sin(angle));
                    vec2 perp = vec2(-dir.y, dir.x);
                    float streak = fbm(vec2(dot(vWorld, dir) * 2.2, dot(vWorld, perp) * 16.0) + uSeed * 7.0);
                    float cover = smoothstep(uDry * 0.75 - 0.2, uDry * 0.75 + 0.18, streak + 0.28);
                    // The same streaks chew the boundary, so the edge is scratched
                    // rather than feathered.
                    float bite = smoothstep(-uEdgeSoft - 0.05, -0.05 * uDry, d);
                    alpha *= mix(1.0, cover, max(uDry * 0.85, bite * uDry));
                    if (alpha <= 0.004) discard;
                }

                // Height: a smoothstep dome whose slope is analytic, so the rise
                // eases into the interior with no crease, plus interior noise.
                float domeW = 0.12;
                float t = clamp(-d / domeW, 0.0, 1.0);
                float dome = t * t * (3.0 - 2.0 * t);
                float domeSlope = (6.0 * t - 6.0 * t * t) / domeW;
                float n = reliefAt(vWorld);

                float e = 0.01;
                vec2 gradN = vec2(
                    reliefAt(vWorld + vec2(e, 0.0)) - reliefAt(vWorld - vec2(e, 0.0)),
                    reliefAt(vWorld + vec2(0.0, e)) - reliefAt(vWorld - vec2(0.0, e))
                ) / (2.0 * e);
                vec2 slope = outward * domeSlope * (0.5 + uRelief * n) * 0.05
                           + gradN * dome * uRelief * 0.05;
                vec3 normal = normalize(vec3(-slope, 1.0));

                vec3 light = normalize(vec3(-0.4, 0.7, 0.6));
                vec3 view = vec3(0.0, 0.0, 1.0);
                float diff = max(dot(normal, light), 0.0);
                vec3 halfVec = normalize(light + view);
                float spec = pow(max(dot(normal, halfVec), 0.0), 40.0) * uGloss;

                vec3 pigment = uColor * (1.0 - uFade * (fbm(vWorld * uFreq * 0.6 + uSeed * 5.0) - 0.25));
                vec3 color = pigment * (0.6 + 0.4 * diff) + vec3(spec);
                gl_FragColor = vec4(clamp(color, 0.0, 1.0), alpha);
            }
        `;
    }
}
