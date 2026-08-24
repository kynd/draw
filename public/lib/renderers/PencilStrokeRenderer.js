import * as THREE from 'three';
import { ShaderStrokeRenderer } from './ShaderStrokeRenderer.js';

/**
 * A pencil line: thin, grainy, and uneven in pressure.
 *
 * The grain lives in screen space, because it belongs to the paper rather than to the
 * stroke. Graphite catches the tops of the paper's tooth, so coverage is the tooth
 * noise thresholded, and a light line breaks into speckle before it disappears.
 *
 * Pressure is a low-frequency noise along the stroke that scales both darkness and the
 * drawn width, the way a hand lightens without meaning to.
 */
export class PencilStrokeRenderer extends ShaderStrokeRenderer {
    /**
     * @param {object} opts
     * @param {string} [opts.color]
     * @param {number} [opts.grain]     How much the paper tooth breaks the line.
     * @param {number} [opts.pressure]  How far pressure wanders from full.
     */
    constructor({
        color = '#2c2c31',
        grain = 0.55,
        pressure = 0.45,
        samplesPerUnit = 120,
        ...rest
    } = {}) {
        super({ inflate: 1.3, samplesPerUnit, ...rest });
        this.color = color;
        this.grain = grain;
        this.pressure = pressure;
    }

    uniforms() {
        return {
            uColor: { value: new THREE.Color(this.color) },
            uGrain: { value: this.grain },
            uPressure: { value: this.pressure },
        };
    }

    fragmentShader() {
        return /* glsl */`
            uniform vec3 uColor;
            uniform float uGrain;
            uniform float uPressure;

            void main() {
                float across = capDistance();

                // Pressure wanders along the stroke, thinning the line and lightening it.
                float wander = fbm(vec2(vUv.x * uLength * 1.3, uSeed * 23.0));
                float press = 1.0 - uPressure * wander;

                float boundary = mix(0.55, 1.0, press);
                float body = smoothstep(boundary, boundary - 0.35, across);
                if (body <= 0.001) discard;

                // Paper tooth, in screen space. Graphite catches its tops, so light
                // coverage breaks into speckle instead of fading evenly.
                float tooth = valueNoise(screenUv() * uScreen / 2.0);
                float catchLevel = press * body;
                float cover = smoothstep(uGrain * (1.0 - catchLevel), 1.0, tooth * 0.6 + catchLevel * 0.55);

                float alpha = body * press * mix(1.0, cover, uGrain);
                if (alpha <= 0.004) discard;
                gl_FragColor = vec4(uColor, alpha);
            }
        `;
    }
}
