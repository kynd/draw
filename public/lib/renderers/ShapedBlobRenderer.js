import * as THREE from 'three';
import { BlobRenderer } from './BlobRenderer.js';

/**
 * A flat fill whose boundary can grow spikes and bumps.
 *
 * Spikes follow the boundary's arc position with an integer count around the loop, so
 * the profile meets itself at the seam in a valley. Each spike hashes its height and
 * lean from its own index, and the tips keep their corner under any sharpness while
 * the valleys keep a zero derivative. The wobble is a noise of world position rather
 * than arc, so it cannot show a seam at all.
 */
export class ShapedBlobRenderer extends BlobRenderer {
    constructor({
        color = '#46608a',
        spikes = 0,          // spike count around the loop; 0 disables
        spikeAmp = 0.12,
        sharp = 5,
        wobble = 0,          // bump amplitude; 0 disables
        wobbleFreq = 4,
        ...rest
    } = {}) {
        super({ margin: 0.2 + spikeAmp + wobble, ...rest });
        this.color = color;
        this.spikes = spikes;
        this.spikeAmp = spikeAmp;
        this.sharp = sharp;
        this.wobble = wobble;
        this.wobbleFreq = wobbleFreq;
    }

    uniforms() {
        return {
            uColor: { value: new THREE.Color(this.color) },
            uSpikes: { value: this.spikes },
            uSpikeAmp: { value: this.spikeAmp },
            uSharp: { value: this.sharp },
            uWobble: { value: this.wobble },
            uWobbleFreq: { value: this.wobbleFreq },
        };
    }

    fragmentShader() {
        return /* glsl */`
            uniform vec3 uColor;
            uniform float uSpikes;
            uniform float uSpikeAmp;
            uniform float uSharp;
            uniform float uWobble;
            uniform float uWobbleFreq;

            void main() {
                float arc;
                vec2 outward;
                float d = sdBlob(vWorld, arc, outward);

                float offset = 0.0;
                if (uSpikes > 0.5) {
                    float phase = arc / uPerimeter * floor(uSpikes + 0.5);
                    float cell = floor(phase);
                    float f = fract(phase);
                    float h = mix(0.35, 1.2, hash11(cell * 13.7 + uSeed * 91.0));
                    float tip = mix(0.3, 0.7, hash11(cell * 7.3 + uSeed * 17.0));
                    float tri = f < tip ? f / tip : (1.0 - f) / (1.0 - tip);
                    offset += uSpikeAmp * h * pow(max(tri, 0.0), uSharp);
                }
                if (uWobble > 0.0) {
                    offset += (fbm(vWorld * uWobbleFreq + uSeed * 11.0) - 0.5) * 2.0 * uWobble;
                }

                float alpha = 1.0 - smoothstep(-0.006, 0.006, d - offset);
                if (alpha <= 0.003) discard;
                gl_FragColor = vec4(uColor, alpha);
            }
        `;
    }
}
