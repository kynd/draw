import * as THREE from 'three';
import { ShaderStrokeRenderer } from './ShaderStrokeRenderer.js';

/**
 * A flat fill with an inner shadow, so the stroke reads as cut out of the paper.
 *
 * A band inside the boundary darkens where its outward direction faces a fixed light,
 * the shadow the lit rim of a cutout casts onto its floor. There is no highlight: a
 * hole has nothing to catch the light with. The outward direction comes from the
 * stroke frame (the lateral normal weighted by vCross, the tangent weighted by
 * vBeyond), so the ends shade the same way the sides do.
 */
export class DebossStrokeRenderer extends ShaderStrokeRenderer {
    /**
     * @param {object} opts
     * @param {string} [opts.color]
     * @param {number} [opts.bevel]   Band width, as a fraction of the half-width.
     * @param {number} [opts.amount]  Shading strength.
     * @param {number} [opts.angle]   Light direction in radians.
     */
    constructor({
        color = '#606068',
        bevel = 0.55,
        amount = 0.9,
        angle = -2.2,
        samplesPerUnit = 90,
        ...rest
    } = {}) {
        super({ inflate: 1.15, samplesPerUnit, ...rest });
        this.color = color;
        this.bevel = bevel;
        this.amount = amount;
        this.angle = angle;
    }

    uniforms() {
        return {
            uColor: { value: new THREE.Color(this.color) },
            uBevel: { value: this.bevel },
            uAmount: { value: this.amount },
            uLightDir: { value: new THREE.Vector2(Math.cos(this.angle), Math.sin(this.angle)) },
        };
    }

    fragmentShader() {
        return /* glsl */`
            uniform vec3 uColor;
            uniform float uBevel;
            uniform float uAmount;
            uniform vec2 uLightDir;

            void main() {
                float d = capDistance();
                float body = smoothstep(1.0, 0.96, d);
                if (body <= 0.001) discard;

                vec2 T = normalize(vTangent.xy);
                vec2 N2 = vec2(-T.y, T.x);
                vec2 outward = N2 * vCross + T * vBeyond;
                float len = length(outward);
                outward = len > 1e-6 ? outward / len : N2;

                float band = smoothstep(1.0 - uBevel, 1.0, d);
                float facing = dot(outward, uLightDir);

                // Cut out: only the shadow the lit rim casts inward. No highlight.
                float shade = uAmount * band * max(facing, 0.0);
                vec3 color = uColor * (1.0 - shade);
                gl_FragColor = vec4(clamp(color, 0.0, 1.0), body);
            }
        `;
    }
}
