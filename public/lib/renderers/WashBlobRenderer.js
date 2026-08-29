import * as THREE from 'three';
import { BlobRenderer } from './BlobRenderer.js';

const FLOW_TAPS = 6;

/**
 * A watercolor fill over the background, from watery to gouache by parameters.
 *
 * The background is not read at one point but dragged along a noise flow: each
 * fragment averages a few samples along a direction that wanders with world position,
 * so the pigment looks carried by water, or by a brush when the drag is long. Water
 * is the trade: more of it widens the feather, thins the pigment, and lets the
 * background bleed; less sharpens the edge and covers, until the fill reads as
 * gouache, whose stronger drag is what implies the brush.
 *
 * `body` lights the fill as a thin relief so it reads as having thickness, and
 * `bristle` grows brush marks at the edge, streaks elongated along a direction that
 * wanders with position.
 */
export class WashBlobRenderer extends BlobRenderer {
    constructor({
        color = '#3060a0',
        background = null,
        pigment = 0.5,      // pigment strength over the background
        feather = 0.06,     // edge softness in world units
        rim = 0.4,          // pigment collecting inside the boundary
        flow = 0.04,        // drag length of the background sampling, in uv
        wet = 0.5,          // how much the paint multiplies into the background
        body = 0,           // paint thickness, lit as a thin relief
        bristle = 0,        // edge brush-mark amplitude in world units
        ...rest
    } = {}) {
        super({ margin: 0.15 + feather, ...rest });
        this.color = color;
        this.background = background;
        this.pigment = pigment;
        this.feather = feather;
        this.rim = rim;
        this.flow = flow;
        this.wet = wet;
        this.body = body;
        this.bristle = bristle;
    }

    uniforms() {
        return {
            uColor: { value: new THREE.Color(this.color) },
            uBg: { value: this.background },
            uPigment: { value: this.pigment },
            uFeather: { value: this.feather },
            uRim: { value: this.rim },
            uFlow: { value: this.flow },
            uWet: { value: this.wet },
            uBody: { value: this.body },
            uBristle: { value: this.bristle },
        };
    }

    fragmentShader() {
        return /* glsl */`
            uniform vec3 uColor;
            uniform sampler2D uBg;
            uniform float uPigment;
            uniform float uFeather;
            uniform float uRim;
            uniform float uFlow;
            uniform float uWet;
            uniform float uBody;
            uniform float uBristle;

            void main() {
                float arc;
                vec2 outward;
                float d = sdBlob(vWorld, arc, outward);

                if (uBristle > 0.0) {
                    // Brush marks at the edge: streaks elongated along a direction
                    // that wanders with position, so the boundary grows short
                    // finger-like marks rather than one combed fringe.
                    float thetaB = fbm(vWorld * 1.2 + uSeed * 29.0) * 6.2832;
                    vec2 dirB = vec2(cos(thetaB), sin(thetaB));
                    vec2 perpB = vec2(-dirB.y, dirB.x);
                    float streak = fbm(vec2(dot(vWorld, dirB) * 2.5, dot(vWorld, perpB) * 28.0) + uSeed * 41.0);
                    d += (streak - 0.5) * uBristle;
                }

                // The boundary itself wanders a little, as a wet edge does.
                float wobble = (fbm(vWorld * 5.0 + uSeed * 7.0) - 0.5) * uFeather * 1.5;
                float alpha = 1.0 - smoothstep(-uFeather, uFeather * 0.4, d + wobble);
                if (alpha <= 0.003) discard;

                // Water thins the coverage unevenly: the wetter the fill, the more
                // of it goes nearly transparent, edges included.
                float pool = fbm(vWorld * 2.2 + uSeed * 19.0);
                alpha *= mix(1.0, 0.2 + 0.8 * pool, uWet * 0.9);
                if (alpha <= 0.003) discard;

                // The flow direction wanders with position, so the drag reads as
                // currents in the wash rather than one motion blur.
                float theta = fbm(vWorld * 1.8 + uSeed * 11.0) * 6.2832;
                vec2 dir = vec2(cos(theta), sin(theta));
                vec3 acc = vec3(0.0);
                float wsum = 0.0;
                for (int i = 0; i < ${FLOW_TAPS}; i++) {
                    float f = float(i) / float(${FLOW_TAPS} - 1);
                    float w = 1.0 - f * 0.6;
                    acc += texture2D(uBg, screenUv() - dir * uFlow * f).rgb * w;
                    wsum += w;
                }
                vec3 soft = acc / wsum;

                float grain = fbm(screenUv() * uScreen / 26.0 + uSeed * 13.0);
                float strength = uPigment * (0.75 + 0.4 * grain);
                // Two ways paint can meet the background: the min darkens like
                // pigment layered over it, the mix covers like body. Water decides
                // the balance, and the more of it, the more the paint darkens.
                vec3 layered = min(uColor, soft);
                vec3 covered = mix(soft, uColor, clamp(strength, 0.0, 1.0));
                vec3 wash = mix(covered, layered, uWet);

                // Pigment collects just inside the boundary as the water dries back.
                float rimBand = smoothstep(-uFeather * 4.0, -uFeather, d)
                              * smoothstep(uFeather * 0.4, -uFeather * 0.5, d);
                wash = mix(wash, uColor * 0.6, rimBand * uRim);

                if (uBody > 0.0) {
                    // A thin body of paint: an edge dome plus pigment bumps, lit
                    // faintly so the fill reads as having thickness.
                    float domeW = 0.1;
                    float tB = clamp(-d / domeW, 0.0, 1.0);
                    float domeB = tB * tB * tB * (tB * (tB * 6.0 - 15.0) + 10.0);
                    float domeSlopeB = 30.0 * tB * tB * (tB - 1.0) * (tB - 1.0) / domeW;
                    float e = 0.01;
                    vec2 gradB = vec2(
                        fbm((vWorld + vec2(e, 0.0)) * 5.0 + uSeed * 31.0) - fbm((vWorld - vec2(e, 0.0)) * 5.0 + uSeed * 31.0),
                        fbm((vWorld + vec2(0.0, e)) * 5.0 + uSeed * 31.0) - fbm((vWorld - vec2(0.0, e)) * 5.0 + uSeed * 31.0)
                    ) / (2.0 * e);
                    vec2 slopeB = (outward * domeSlopeB * 0.03 + gradB * domeB * 0.03) * uBody;
                    vec3 nB = normalize(vec3(-slopeB, 1.0));
                    vec3 lightB = normalize(vec3(-0.4, -0.7, 0.6));
                    float diffB = max(dot(nB, lightB), 0.0);
                    vec3 halfB = normalize(lightB + vec3(0.0, 0.0, 1.0));
                    float specB = pow(max(dot(nB, halfB), 0.0), 35.0);
                    wash = wash * mix(1.0, 0.62 + 0.38 * diffB, uBody) + vec3(specB * 0.18 * uBody);
                }

                gl_FragColor = vec4(wash, alpha);
            }
        `;
    }
}
