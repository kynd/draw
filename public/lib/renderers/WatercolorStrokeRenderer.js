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
 *
 * The background is picked up through a noise-bent lens: taps displaced by a 2D
 * noise field, with no relation to the stroke's direction, so what lies underneath
 * seeps into the wash in blotches the way wet paper carries pigment outward. Where
 * the blotch noise runs wet, the pigment thins and more background shows through.
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
        bleed = 0.6,
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
        this.bleed = bleed;
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
            uBleed: { value: this.bleed },
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
            uniform float uBleed;

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

                // The background is picked up through a noise-bent lens: taps
                // displaced by a 2D noise field, with no relation to the
                // stroke's direction, so what lies underneath seeps into the
                // wash in blotches rather than streaks. Wetter blotches bend
                // the lens farther, and one tap reads the sharp background, so
                // edges underneath grow warped tendrils instead of staying put.
                vec2 nuv = suv * uScreen / 48.0;
                float blot = fbm(nuv * 0.6 + uSeed * 11.0);
                float amp = uBleed * (0.35 + 1.0 * blot);
                vec2 disp1 = vec2(fbm(nuv + uSeed * 3.7) - 0.5,
                                  fbm(nuv + uSeed * 7.9 + 31.0) - 0.5);
                vec2 disp2 = vec2(fbm(nuv * 2.3 + uSeed * 5.1 + 63.0) - 0.5,
                                  fbm(nuv * 2.3 + uSeed * 9.3 + 17.0) - 0.5);
                vec2 px = 1.0 / uScreen;
                vec3 soft = (texture2D(uBlurred, suv).rgb
                    + texture2D(uBlurred, clamp(suv + disp1 * amp * 220.0 * px, 0.001, 0.999)).rgb
                    + texture2D(uBg, clamp(suv + disp2 * amp * 90.0 * px, 0.001, 0.999)).rgb * 1.2
                    + texture2D(uBg, clamp(suv + disp1 * amp * 110.0 * px, 0.001, 0.999)).rgb * 0.8) / 4.0;

                // Where the blotch noise runs wet, the pigment thins and more
                // of the picked-up background shows through.
                float strength = uPigment * (0.72 + 0.42 * grain);
                strength *= 1.0 - uBleed * 0.55 * smoothstep(0.35, 0.8, blot);
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
