import * as THREE from 'three';
import { ShaderStrokeRenderer } from './ShaderStrokeRenderer.js';

/**
 * A soft silhouette of the stroke: full color inside the mark, fading to nothing
 * across a feather that reaches past it.
 *
 * One class serves two effects. Offset down and drawn dark beneath a stroke it is a
 * drop shadow; drawn bright and additive around one it is a glow. The feather is the
 * inflate margin, so the fade uses the same capDistance the other shader strokes
 * measure against.
 */
export class HaloStrokeRenderer extends ShaderStrokeRenderer {
    /**
     * @param {object} opts
     * @param {string} [opts.color]
     * @param {number} [opts.feather]   How far the fade reaches, in half-widths.
     * @param {number} [opts.opacity]
     * @param {boolean} [opts.additive] Additive blending, for glows.
     */
    constructor({
        color = '#000000',
        feather = 0.8,
        opacity = 0.5,
        additive = false,
        samplesPerUnit = 90,
        ...rest
    } = {}) {
        super({ inflate: 1 + feather, samplesPerUnit, depthWrite: false, ...rest });
        this.color = color;
        this.feather = feather;
        this.opacity = opacity;
        this.additive = additive;
    }

    uniforms() {
        return {
            uColor: { value: new THREE.Color(this.color) },
            uOpacity: { value: this.opacity },
        };
    }

    build(def) {
        const mesh = super.build(def);
        if (this.additive) mesh.material.blending = THREE.AdditiveBlending;
        return mesh;
    }

    fragmentShader() {
        return /* glsl */`
            uniform vec3 uColor;
            uniform float uOpacity;

            void main() {
                float d = capDistance();
                // Squared falloff: dense against the mark, long soft tail.
                float fade = 1.0 - smoothstep(0.6, uInflate, d);
                float alpha = uOpacity * fade * fade;
                if (alpha <= 0.003) discard;
                gl_FragColor = vec4(uColor, alpha);
            }
        `;
    }
}
