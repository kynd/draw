import * as THREE from 'three';
import { ShaderStrokeRenderer } from './ShaderStrokeRenderer.js';

/**
 * A broad stroke whose edge rises into sharp spikes.
 *
 * The boundary is pushed outward by a profile with a corner at each tip and a zero
 * derivative between them, so the tips stay sharp while the valleys stay rounded:
 * the profile is a power of a triangle wave, and the power is the sharpness.
 *
 * Each spike varies by a hash of its own index: height, lean (the tip's position
 * inside its cell), and spacing through a low-frequency warp of the phase. The two
 * sides hash independently, so the edges do not mirror each other.
 */
export class SpikeStrokeRenderer extends ShaderStrokeRenderer {
    /**
     * @param {object} opts
     * @param {string} [opts.color]
     * @param {number} [opts.spikes]  Spikes per world unit of arc length.
     * @param {number} [opts.amp]     Spike height, in half-widths.
     * @param {number} [opts.sharp]   Tip sharpness; higher is needler.
     */
    constructor({ color = '#33502e', spikes = 4, amp = 0.9, sharp = 5.0, samplesPerUnit = 120, ...rest } = {}) {
        super({ cap: 'rounded', samplesPerUnit, ...rest });
        this.color = color;
        this.spikes = spikes;
        this.amp = amp;
        this.sharp = sharp;
        this.inflate = 1 + amp * 1.25 + 0.2;
    }

    uniforms() {
        return {
            uColor: { value: new THREE.Color(this.color) },
            uSpikes: { value: this.spikes },
            uAmp: { value: this.amp },
            uSharp: { value: this.sharp },
        };
    }

    fragmentShader() {
        return /* glsl */`
            uniform vec3 uColor;
            uniform float uSpikes;
            uniform float uAmp;
            uniform float uSharp;

            void main() {
                // Triangle wave: 1 at each spike tip, 0 at each valley. Raising it to
                // a power sharpens the tip (the corner survives any power) while the
                // valley's derivative goes to zero, which is what rounds it.
                float phase = vUv.x * uLength * uSpikes;
                // Uneven spacing: a slow warp slides the cells apart and together.
                phase += (fbm(vec2(phase * 0.3, uSeed * 3.1)) - 0.5) * 2.2;

                // Each side hashes its spikes independently, so the edges don't mirror.
                float side = vCross > 0.0 ? 0.0 : 57.0;
                float cell = floor(phase);
                float f = fract(phase);
                float h = mix(0.35, 1.2, hash11(cell * 13.7 + side + uSeed * 91.0));
                float tip = mix(0.25, 0.75, hash11(cell * 7.3 + side + uSeed * 17.0));
                float tri = f < tip ? f / tip : (1.0 - f) / (1.0 - tip);
                float spike = pow(max(tri, 0.0), uSharp);

                float boundary = 1.0 + uAmp * h * spike;
                float d = capDistance() - boundary;
                float alpha = 1.0 - smoothstep(-0.015, 0.015, d);
                if (alpha <= 0.003) discard;
                gl_FragColor = vec4(uColor, alpha);
            }
        `;
    }
}
