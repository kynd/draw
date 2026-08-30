import * as THREE from 'three';
import { BlobRenderer } from './BlobRenderer.js';

/**
 * A flat fill whose boundary can grow spikes and bumps. With `colorB` and two
 * world points the fill becomes a linear gradient between them, so a caller can
 * run it along the drawn spine or across it.
 *
 * Spikes follow the boundary's arc position with an integer count around the loop, so
 * the profile meets itself at the seam in a valley. Each spike hashes its height and
 * lean from its own index, and each valley hashes its depth from the boundary the two
 * neighboring spikes share, dipping inside the shape. The tips keep their corner under
 * any sharpness. The wobble is a noise of world position rather than arc, so it cannot
 * show a seam at all.
 */
export class ShapedBlobRenderer extends BlobRenderer {
    constructor({
        color = '#46608a',
        colorB = null,       // gradient end color; null keeps the fill flat
        gradientFrom = null, // world point where the gradient starts, [x, y]
        gradientTo = null,   // world point where it ends
        spikes = 0,          // spike count around the loop; 0 disables
        spikeAmp = 0.12,
        sharp = 5,
        wobble = 0,          // bump amplitude; 0 disables
        wobbleFreq = 4,
        ...rest
    } = {}) {
        super({ margin: 0.2 + spikeAmp * 1.6 + wobble, ...rest });
        this.color = color;
        this.colorB = colorB;
        this.gradientFrom = gradientFrom;
        this.gradientTo = gradientTo;
        this.spikes = spikes;
        this.spikeAmp = spikeAmp;
        this.sharp = sharp;
        this.wobble = wobble;
        this.wobbleFreq = wobbleFreq;
    }

    uniforms() {
        const hasGrad = Boolean(this.colorB && this.gradientFrom && this.gradientTo);
        return {
            uColor: { value: new THREE.Color(this.color) },
            uColorB: { value: new THREE.Color(this.colorB ?? this.color) },
            uGradFrom: { value: new THREE.Vector2(...(this.gradientFrom ?? [0, 0])) },
            uGradTo: { value: new THREE.Vector2(...(this.gradientTo ?? [1, 0])) },
            uHasGrad: { value: hasGrad ? 1 : 0 },
            uSpikes: { value: this.spikes },
            uSpikeAmp: { value: this.spikeAmp },
            uSharp: { value: this.sharp },
            uWobble: { value: this.wobble },
            uWobbleFreq: { value: this.wobbleFreq },
        };
    }

    fragmentShader() {
        return /* glsl */`
            uniform vec3 uColor;
            uniform vec3 uColorB;
            uniform vec2 uGradFrom;
            uniform vec2 uGradTo;
            uniform int uHasGrad;
            uniform float uSpikes;
            uniform float uSpikeAmp;
            uniform float uSharp;
            uniform float uWobble;
            uniform float uWobbleFreq;

            void main() {
                float arc;
                vec2 outward;
                float d = sdBlob(vWorld, arc, outward);

                float offset = 0.0;
                if (uSpikes > 0.5) {
                    float phase = arc / uPerimeter * floor(uSpikes + 0.5);
                    float cell = floor(phase);
                    float f = fract(phase);
                    float h = mix(0.2, 1.6, hash11(cell * 13.7 + uSeed * 91.0));
                    float tip = mix(0.25, 0.75, hash11(cell * 7.3 + uSeed * 17.0));
                    float tri = f < tip ? f / tip : (1.0 - f) / (1.0 - tip);
                    float profile = pow(max(tri, 0.0), uSharp);
                    // Valleys dip inside the shape. Each depth is hashed from the
                    // boundary the two neighboring spikes share, so the profile
                    // stays continuous across cells.
                    float vd = mix(hash11(cell * 5.1 + uSeed * 37.0),
                                   hash11((cell + 1.0) * 5.1 + uSeed * 37.0), f);
                    offset += uSpikeAmp * (h * profile - mix(0.3, 1.0, vd) * (1.0 - profile));
                }
                if (uWobble > 0.0) {
                    offset += (fbm(vWorld * uWobbleFreq + uSeed * 11.0) - 0.5) * 2.0 * uWobble;
                }

                float alpha = 1.0 - smoothstep(-0.006, 0.006, d - offset);
                if (alpha <= 0.003) discard;
                // A linear gradient between two world points, so the fill can run
                // along the drawn spine or across it, as the caller lays it out.
                vec3 fill = uColor;
                if (uHasGrad == 1) {
                    vec2 g = uGradTo - uGradFrom;
                    float gt = clamp(dot(vWorld - uGradFrom, g) / max(dot(g, g), 1e-6), 0.0, 1.0);
                    fill = mix(uColor, uColorB, gt);
                }
                gl_FragColor = vec4(fill, alpha);
            }
        `;
    }
}
