import * as THREE from 'three';
import { ShaderStrokeRenderer } from './ShaderStrokeRenderer.js';

const TAPS = 16;

/**
 * Color dragged along the stroke, as a brush pulls wet paint across a surface.
 *
 * Each fragment walks backward along the stroke's own direction in screen space and
 * averages what it finds, so the background is streaked the way the mark travelled
 * rather than blurred evenly. The walk length varies with noise across and along the
 * mark, which is what stops the result reading as a uniform motion blur: a real brush
 * drags hard under some bristles and barely at all under others.
 */
export class SmearStrokeRenderer extends ShaderStrokeRenderer {
    constructor({
        color = '#202020',
        background = null,
        drag = 90,
        variation = 0.75,
        tint = 0.35,
        edge = 0.25,
        samplesPerUnit = 90,
    } = {}) {
        super({ inflate: 1.3, samplesPerUnit });
        this.color = color;
        this.background = background;
        this.drag = drag;
        this.variation = variation;
        this.tint = tint;
        this.edge = edge;
    }

    uniforms() {
        return {
            uColor: { value: new THREE.Color(this.color) },
            uBg: { value: this.background },
            uDrag: { value: this.drag },
            uVariation: { value: this.variation },
            uTint: { value: this.tint },
            uEdge: { value: this.edge },
        };
    }

    fragmentShader() {
        return /* glsl */`
            uniform vec3 uColor;
            uniform sampler2D uBg;
            uniform float uDrag;
            uniform float uVariation;
            uniform float uTint;
            uniform float uEdge;

            void main() {
                vec2 suv = screenUv();
                float across = abs(vCross);

                float wobble = (fbm(vec2(vUv.x * uLength * 2.6, vCross * 2.2 + uSeed * 9.0)) - 0.5);
                float boundary = 1.0 + wobble * uEdge;
                float body = smoothstep(boundary, boundary - 0.18, across);
                if (body <= 0.001) discard;

                // How far this fragment drags. Bristle lanes run along the mark, so the
                // noise is stretched along it and packed across it.
                float lane = fbm(vec2(vUv.x * uLength * 1.6, vCross * 7.0 + uSeed * 21.0));
                float reach = uDrag * mix(1.0 - uVariation, 1.0 + uVariation, lane);

                vec2 stepUv = tangentUv() * reach / uScreen / float(${TAPS});

                vec3 acc = vec3(0.0);
                float wsum = 0.0;
                for (int i = 0; i < ${TAPS}; i++) {
                    float f = float(i) / float(${TAPS} - 1);
                    // Weight the near end higher, so the smear fades behind the brush
                    // instead of ending abruptly.
                    float w = 1.0 - f * 0.75;
                    acc += texture2D(uBg, suv - stepUv * float(i)).rgb * w;
                    wsum += w;
                }
                vec3 dragged = acc / wsum;

                vec3 color = mix(dragged, uColor, uTint * (0.6 + 0.5 * lane));
                gl_FragColor = vec4(color, body);
            }
        `;
    }
}
