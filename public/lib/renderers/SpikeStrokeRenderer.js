import * as THREE from 'three';
import { ShaderStrokeRenderer } from './ShaderStrokeRenderer.js';

// The half-width (world units) at which the spike rate equals `spikes`;
// wider strokes get proportionally fewer spikes per length.
const WIDTH_REF = 0.12;

/**
 * A broad stroke whose edge rises into sharp spikes.
 *
 * The boundary is pushed outward by a blade profile: a straight-sided (linear)
 * component keeps each blade broad and the valleys narrow, and a power of a
 * triangle wave draws the tip to a point. The corner at the tip survives any power,
 * so the tip stays sharp while `sharp` only bends the sides toward it. The spikes
 * rise along the body alone; over the caps they fade, so each end closes on a plain
 * rounded curve rather than a fan of spikes.
 *
 * Each spike varies by a hash of its own index: height, lean (the tip's position
 * inside its cell), and spacing through a low-frequency warp of the phase. The two
 * sides hash independently, so the edges do not mirror each other.
 */
export class SpikeStrokeRenderer extends ShaderStrokeRenderer {
    /**
     * @param {object} opts
     * @param {string} [opts.color]
     * @param {number} [opts.spikes]  Spike rate at the reference width; the
     *                                rate scales with width so spikes-per-width
     *                                holds, keeping the spike shape steady.
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

    uniforms(def) {
        // Spikes-per-width, not per world length: the rate rises for a thin
        // stroke and falls for a wide one, so a wide edge is not left with a
        // few spikes spaced far apart relative to its width.
        const rate = this.spikes * WIDTH_REF / Math.max(def.maxWidth(), 1e-3);
        return {
            uColor: { value: new THREE.Color(this.color) },
            uSpikes: { value: rate },
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
                // Broaden each blade and pinch the valleys: a straight-sided
                // (linear) component keeps the body thick, while the power
                // sharpens only the tip. The tip is a corner in both terms, so
                // the point survives.
                float spike = mix(pow(max(tri, 0.0), uSharp), max(tri, 0.0), 0.28);

                // Spikes belong to the body edge, not the rounded caps: fade
                // them out onto the cap so each end closes on a plain curve.
                float body = 1.0 - smoothstep(0.0, 0.35, abs(vBeyond));
                float boundary = 1.0 + uAmp * h * spike * body;
                float d = capDistance() - boundary;
                float alpha = 1.0 - smoothstep(-0.015, 0.015, d);
                if (alpha <= 0.003) discard;
                gl_FragColor = vec4(uColor, alpha);
            }
        `;
    }
}
