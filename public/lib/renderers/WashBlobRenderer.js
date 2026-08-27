import * as THREE from 'three';
import { BlobRenderer } from './BlobRenderer.js';

/**
 * A watercolor fill over the background, from watery to gouache by parameters.
 *
 * The wash reads a softened copy of the background by screen position and tints it
 * with the pigment. Water is the trade: more of it widens the feather, thins the
 * pigment, and lets the background bleed through; less of it sharpens the edge and
 * covers, until the fill reads as gouache.
 */
export class WashBlobRenderer extends BlobRenderer {
    constructor({
        color = '#3060a0',
        background = null,
        pigment = 0.5,      // pigment strength over the background
        feather = 0.06,     // edge softness in world units
        rim = 0.4,          // pigment collecting inside the boundary
        ...rest
    } = {}) {
        super({ margin: 0.15 + feather, ...rest });
        this.color = color;
        this.background = background;
        this.pigment = pigment;
        this.feather = feather;
        this.rim = rim;
    }

    uniforms() {
        return {
            uColor: { value: new THREE.Color(this.color) },
            uBg: { value: this.background },
            uPigment: { value: this.pigment },
            uFeather: { value: this.feather },
            uRim: { value: this.rim },
        };
    }

    fragmentShader() {
        return /* glsl */`
            uniform vec3 uColor;
            uniform sampler2D uBg;
            uniform float uPigment;
            uniform float uFeather;
            uniform float uRim;

            void main() {
                float arc;
                vec2 outward;
                float d = sdBlob(vWorld, arc, outward);

                // The boundary itself wanders a little, as a wet edge does.
                float wobble = (fbm(vWorld * 5.0 + uSeed * 7.0) - 0.5) * uFeather * 1.5;
                float alpha = 1.0 - smoothstep(-uFeather, uFeather * 0.4, d + wobble);
                if (alpha <= 0.003) discard;

                float grain = fbm(screenUv() * uScreen / 26.0 + uSeed * 13.0);
                vec3 soft = texture2D(uBg, screenUv()).rgb;
                float strength = uPigment * (0.75 + 0.4 * grain);
                vec3 wash = mix(soft, uColor, clamp(strength, 0.0, 1.0));

                // Pigment collects just inside the boundary as the water dries back.
                float rimBand = smoothstep(-uFeather * 4.0, -uFeather, d)
                              * smoothstep(uFeather * 0.4, -uFeather * 0.5, d);
                wash = mix(wash, uColor * 0.6, rimBand * uRim);

                gl_FragColor = vec4(wash, alpha);
            }
        `;
    }
}
