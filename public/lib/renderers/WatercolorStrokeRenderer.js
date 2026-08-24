import * as THREE from 'three';
import { ShaderStrokeRenderer } from './ShaderStrokeRenderer.js';

/**
 * A wet wash that lets the background through, softened and tinted.
 *
 * The blur comes from a pre-blurred copy of the background rather than a neighbourhood
 * gathered per fragment. A wide gather is the obvious implementation and the wrong one:
 * a 30 pixel radius costs hundreds of taps on every covered fragment, while the same
 * result is one texel read against a copy blurred once for the whole frame.
 *
 * The geometry runs wider than the mark so the wash can fade outward, and the edge is
 * eroded by noise with a darker rim just inside it, where pigment collects as water
 * dries at the boundary.
 */
export class WatercolorStrokeRenderer extends ShaderStrokeRenderer {
    constructor({
        color = '#3060a0',
        background = null,
        blurred = null,
        pigment = 0.55,
        rim = 0.45,
        granulation = 0.35,
        edge = 0.30,
        samplesPerUnit = 90,
        cap = 'rounded',
    } = {}) {
        super({ cap, inflate: 1.4, samplesPerUnit });
        this.color = color;
        this.background = background;
        this.blurred = blurred;
        this.pigment = pigment;
        this.rim = rim;
        this.granulation = granulation;
        this.edge = edge;
    }

    uniforms() {
        return {
            uColor: { value: new THREE.Color(this.color) },
            uBg: { value: this.background },
            uBlurred: { value: this.blurred },
            uPigment: { value: this.pigment },
            uRim: { value: this.rim },
            uGrain: { value: this.granulation },
            uEdge: { value: this.edge },
        };
    }

    fragmentShader() {
        return /* glsl */`
            uniform vec3 uColor;
            uniform sampler2D uBg;
            uniform sampler2D uBlurred;
            uniform float uPigment;
            uniform float uRim;
            uniform float uGrain;
            uniform float uEdge;

            void main() {
                vec2 suv = screenUv();
                float across = capDistance();

                // Paper grain, in screen space so it stays a paper property rather than
                // stretching with the stroke.
                float grain = fbm(suv * uScreen / 26.0 + uSeed * 13.0);

                // An irregular boundary: the edge position itself is pushed by noise.
                float wobble = (fbm(vec2(vUv.x * uLength * 2.2, vCross * 1.8 + uSeed * 5.0)) - 0.5);
                float boundary = 1.0 + wobble * uEdge;
                float body = smoothstep(boundary, boundary - 0.30, across);
                if (body <= 0.001) discard;

                // The wash reads the softened background, so edges underneath bleed.
                vec3 soft = texture2D(uBlurred, suv).rgb;
                float strength = uPigment * (0.72 + 0.42 * grain);
                vec3 wash = mix(soft, uColor, clamp(strength, 0.0, 1.0));

                // Pigment collects just inside the boundary as the water dries back.
                float rimBand = smoothstep(boundary - 0.42, boundary - 0.06, across)
                              * smoothstep(boundary, boundary - 0.10, across);
                wash = mix(wash, uColor * 0.62, rimBand * uRim);

                float alpha = body * (1.0 - uGrain * (1.0 - grain));
                gl_FragColor = vec4(wash, alpha);
            }
        `;
    }
}
