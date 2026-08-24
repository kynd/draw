import * as THREE from 'three';
import { ShaderStrokeRenderer } from './ShaderStrokeRenderer.js';

/**
 * A loaded brush: bristle streaks along the mark, an eroded edge, and dry patches where
 * the brush ran out.
 *
 * The stroke carries two colors rather than one. A real brush picks up more than a
 * single pigment and lays them down unevenly, so the same noise that draws the bristles
 * also decides which of the two colors shows at each point. The result reads as one
 * mark made with a loaded brush rather than two marks blended.
 */
export class BrushStrokeRenderer extends ShaderStrokeRenderer {
    /**
     * @param {object} opts
     * @param {string} [opts.colorA]     First pigment.
     * @param {string} [opts.colorB]     Second pigment.
     * @param {number} [opts.bristles]   Bristle count across the width.
     * @param {number} [opts.streak]     How far streaks stretch along the mark.
     * @param {number} [opts.rough]      Edge erosion depth.
     * @param {number} [opts.dry]        How much of the mark drops out as dry patches.
     */
    constructor({
        colorA = '#1a1a1a',
        colorB = '#6a6a6a',
        bristles = 26,
        streak = 5.0,
        rough = 0.35,
        dry = 0.30,
        samplesPerUnit = 120,
        cap = 'rounded',
    } = {}) {
        super({ cap, inflate: 1.25, samplesPerUnit });
        this.colorA = colorA;
        this.colorB = colorB;
        this.bristles = bristles;
        this.streak = streak;
        this.rough = rough;
        this.dry = dry;
    }

    uniforms() {
        return {
            uColorA: { value: new THREE.Color(this.colorA) },
            uColorB: { value: new THREE.Color(this.colorB) },
            uBristles: { value: this.bristles },
            uStreak: { value: this.streak },
            uRough: { value: this.rough },
            uDry: { value: this.dry },
        };
    }

    fragmentShader() {
        return /* glsl */`
            uniform vec3 uColorA;
            uniform vec3 uColorB;
            uniform float uBristles;
            uniform float uStreak;
            uniform float uRough;
            uniform float uDry;

            void main() {
                float across = capDistance();

                // Bristles: noise stretched hard along the mark and packed across it.
                float along = vUv.x * uLength * uStreak;
                float lane = (vCross * 0.5 + 0.5) * uBristles;
                float bristle = fbm(vec2(along, lane + uSeed * 31.0));

                // The edge is eroded by the same noise, so bristle lanes reach past it
                // unevenly instead of the mark ending on a clean curve.
                float edge = 1.0 - across - (bristle - 0.5) * uRough;
                float alpha = smoothstep(0.0, 0.07, edge);

                // Dry patches: a slower noise that removes paint where the brush lifted.
                float dryNoise = fbm(vec2(along * 0.28, vCross * 1.4 + uSeed * 7.0));
                alpha *= smoothstep(uDry - 0.20, uDry + 0.22, dryNoise + 0.34);

                // The two pigments follow the bristles, with a slow drift along the mark
                // so one end is not simply a copy of the other.
                float mixAmount = clamp(bristle * 1.5 - 0.25 + (vUv.x - 0.5) * 0.5, 0.0, 1.0);
                vec3 color = mix(uColorA, uColorB, mixAmount);

                if (alpha <= 0.001) discard;
                gl_FragColor = vec4(color, alpha);
            }
        `;
    }
}
