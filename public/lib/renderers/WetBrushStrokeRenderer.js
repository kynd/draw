import * as THREE from 'three';
import { ShaderStrokeRenderer } from './ShaderStrokeRenderer.js';

const TAPS = 12;

/**
 * Watercolor with less water, pulled by a brush.
 *
 * The two effects are not simply added. The drag runs first, over a mix of the sharp
 * and softened background, and the wash then tints what the drag produced. Blending two
 * finished results instead would wash out the streaks, because an even blur and a
 * directional smear cancel each other where they disagree.
 */
export class WetBrushStrokeRenderer extends ShaderStrokeRenderer {
    constructor({
        color = '#7a3050',
        background = null,
        blurred = null,
        drag = 55,
        wet = 0.45,
        pigment = 0.45,
        rim = 0.35,
        edge = 0.28,
        samplesPerUnit = 90,
        cap = 'rounded',
    } = {}) {
        super({ cap, inflate: 1.35, samplesPerUnit });
        this.color = color;
        this.background = background;
        this.blurred = blurred;
        this.drag = drag;
        this.wet = wet;
        this.pigment = pigment;
        this.rim = rim;
        this.edge = edge;
    }

    uniforms() {
        return {
            uColor: { value: new THREE.Color(this.color) },
            uBg: { value: this.background },
            uBlurred: { value: this.blurred },
            uDrag: { value: this.drag },
            uWet: { value: this.wet },
            uPigment: { value: this.pigment },
            uRim: { value: this.rim },
            uEdge: { value: this.edge },
        };
    }

    fragmentShader() {
        return /* glsl */`
            uniform vec3 uColor;
            uniform sampler2D uBg;
            uniform sampler2D uBlurred;
            uniform float uDrag;
            uniform float uWet;
            uniform float uPigment;
            uniform float uRim;
            uniform float uEdge;

            void main() {
                vec2 suv = screenUv();
                float across = capDistance();

                float grain = fbm(suv * uScreen / 30.0 + uSeed * 11.0);
                float wobble = (fbm(vec2(vUv.x * uLength * 2.4, vCross * 2.0 + uSeed * 6.0)) - 0.5);
                float boundary = 1.0 + wobble * uEdge;
                float body = smoothstep(boundary, boundary - 0.24, across);
                if (body <= 0.001) discard;

                float lane = fbm(vec2(vUv.x * uLength * 1.4, vCross * 6.0 + uSeed * 17.0));
                float reach = uDrag * mix(0.35, 1.5, lane);
                vec2 stepUv = tangentUv() * reach / uScreen / float(${TAPS});

                // Drag over a partly softened source: the water spreads what the brush
                // then pulls, rather than the two effects fighting after the fact.
                vec3 acc = vec3(0.0);
                float wsum = 0.0;
                for (int i = 0; i < ${TAPS}; i++) {
                    float f = float(i) / float(${TAPS} - 1);
                    float w = 1.0 - f * 0.7;
                    vec2 at = suv - stepUv * float(i);
                    vec3 src = mix(texture2D(uBg, at).rgb, texture2D(uBlurred, at).rgb, uWet);
                    acc += src * w;
                    wsum += w;
                }
                vec3 pulled = acc / wsum;

                vec3 color = mix(pulled, uColor, clamp(uPigment * (0.7 + 0.5 * grain), 0.0, 1.0));

                float rimBand = smoothstep(boundary - 0.40, boundary - 0.05, across)
                              * smoothstep(boundary, boundary - 0.09, across);
                color = mix(color, uColor * 0.6, rimBand * uRim);

                gl_FragColor = vec4(color, body);
            }
        `;
    }
}
