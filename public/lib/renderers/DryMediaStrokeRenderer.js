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
 */
export class DryMediaStrokeRenderer extends ShaderStrokeRenderer {
    /**
     * @param {object} opts
     * @param {string} [opts.color]
     * @param {number} [opts.grain]     How much the tooth breaks the line.
     * @param {number} [opts.tooth]     Tooth scale in pixels.
     * @param {number} [opts.pressure]  How far pressure wanders from full.
     * @param {number} [opts.softness]  Edge falloff, as a fraction of the half-width.
     * @param {number} [opts.edge]      Boundary wobble, as a fraction of the half-width.
     * @param {number} [opts.opacity]
     */
    constructor({
        color = '#2c2c31',
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
        this.grain = grain;
        this.tooth = tooth;
        this.pressure = pressure;
        this.softness = softness;
        this.edge = edge;
        this.opacity = opacity;
    }

    uniforms() {
        return {
            uColor: { value: new THREE.Color(this.color) },
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
            uniform float uGrain;
            uniform float uTooth;
            uniform float uPressure;
            uniform float uSoftness;
            uniform float uEdgeWobble;
            uniform float uOpacity;

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
                float tooth = valueNoise(screenUv() * uScreen / uTooth);
                float catchLevel = press * body;
                float cover = smoothstep(uGrain * (1.0 - catchLevel), 1.0, tooth * 0.6 + catchLevel * 0.55);

                float alpha = body * press * mix(1.0, cover, uGrain) * uOpacity;
                if (alpha <= 0.004) discard;
                gl_FragColor = vec4(uColor, alpha);
            }
        `;
    }
}
