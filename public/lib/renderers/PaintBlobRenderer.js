import * as THREE from 'three';
import { BlobRenderer } from './BlobRenderer.js';

/**
 * An opaque paint fill with relief.
 *
 * Height is an edge dome falling off at the boundary plus noise over the interior,
 * optionally ridged (the fold of 1-|2n-1| has a corner at each crest, which is what
 * keeps thick paint's ridges sharp). The edge dome's slope comes analytically from
 * the outward direction, and the noise gradient from finite differences of the noise
 * alone, so no extra distance evaluations are needed.
 */
export class PaintBlobRenderer extends BlobRenderer {
    constructor({
        color = '#7a4a2f',
        fade = 0.1,        // pigment mottling
        relief = 0.3,      // noise height
        ridged = false,
        gloss = 0.3,
        edgeSoft = 0.03,   // alpha feather width
        noiseFreq = 5,
        ...rest
    } = {}) {
        super({ margin: 0.15, ...rest });
        this.color = color;
        this.fade = fade;
        this.relief = relief;
        this.ridged = ridged;
        this.gloss = gloss;
        this.edgeSoft = edgeSoft;
        this.noiseFreq = noiseFreq;
    }

    uniforms() {
        return {
            uColor: { value: new THREE.Color(this.color) },
            uFade: { value: this.fade },
            uRelief: { value: this.relief },
            uRidged: { value: this.ridged ? 1 : 0 },
            uGloss: { value: this.gloss },
            uEdgeSoft: { value: this.edgeSoft },
            uFreq: { value: this.noiseFreq },
        };
    }

    fragmentShader() {
        return /* glsl */`
            uniform vec3 uColor;
            uniform float uFade;
            uniform float uRelief;
            uniform int uRidged;
            uniform float uGloss;
            uniform float uEdgeSoft;
            uniform float uFreq;

            float reliefAt(vec2 p) {
                float n = fbm(p * uFreq + uSeed * 13.0);
                if (uRidged == 1) {
                    n = 1.0 - abs(2.0 * n - 1.0);
                    n = n * n;
                }
                return n;
            }

            void main() {
                float arc;
                vec2 outward;
                float d = sdBlob(vWorld, arc, outward);
                float alpha = 1.0 - smoothstep(-uEdgeSoft, 0.0, d);
                if (alpha <= 0.003) discard;

                // Height: an edge dome plus interior noise.
                float domeW = 0.08;
                float dome = smoothstep(0.0, -domeW, d);
                float n = reliefAt(vWorld);
                float height = dome * (0.5 + uRelief * n);

                // Edge slope analytically along the outward direction; noise gradient
                // from finite differences of the noise alone.
                float e = 0.008;
                vec2 gradN = vec2(
                    reliefAt(vWorld + vec2(e, 0.0)) - reliefAt(vWorld - vec2(e, 0.0)),
                    reliefAt(vWorld + vec2(0.0, e)) - reliefAt(vWorld - vec2(0.0, e))
                ) / (2.0 * e);
                float domeSlope = (d > -domeW && d < 0.0) ? 1.0 / domeW : 0.0;
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
