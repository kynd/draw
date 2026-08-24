import * as THREE from 'three';
import { HeightFieldStrokeRenderer } from './HeightFieldStrokeRenderer.js';

const TAPS = 10;

/**
 * Thick oil paint: the smear's drag under a dominant paint color, lit through the
 * height field so the ridges read as thickness.
 *
 * The drag and the relief share one lane noise. The lanes that drag the background
 * furthest are also the lanes that ridge highest, which is what a loaded brush does:
 * where the most paint moved, the most paint sits.
 */
export class OilStrokeRenderer extends HeightFieldStrokeRenderer {
    /**
     * @param {object} opts
     * @param {string} [opts.color]       Paint color.
     * @param {THREE.Texture} [opts.background]
     * @param {number} [opts.drag]        Drag reach in pixels.
     * @param {number} [opts.paint]       Ratio of paint over dragged background.
     * @param {number} [opts.gloss]       Specular strength.
     * @param {number} [opts.shininess]
     */
    constructor({
        color = '#803020',
        background = null,
        drag = 60,
        paint = 0.85,
        gloss = 0.4,
        shininess = 48,
        noise = 0.45,
        stretch = 2.0,
        across = 4.0,
        dome = 0.8,
        ...rest
    } = {}) {
        super({ noise, stretch, across, dome, ...rest });
        this.color = color;
        this.background = background;
        this.drag = drag;
        this.paint = paint;
        this.gloss = gloss;
        this.shininess = shininess;
    }

    uniforms(def) {
        return {
            ...super.uniforms(def),
            uColor: { value: new THREE.Color(this.color) },
            uBg: { value: this.background },
            uDrag: { value: this.drag },
            uPaint: { value: this.paint },
            uGloss: { value: this.gloss },
            uShininess: { value: this.shininess },
        };
    }

    shading() {
        return /* glsl */`
            uniform vec3 uColor;
            uniform sampler2D uBg;
            uniform float uDrag;
            uniform float uPaint;
            uniform float uGloss;
            uniform float uShininess;

            void main() {
                float height, body;
                vec3 n = surfaceNormal(height, body);
                if (body <= 0.001) discard;

                // The same lane noise the height field streaks with, so drag and
                // relief follow the same bristles.
                float lane = fbm(vec2(vUv.x * uLength * uStretch, vCross * uAcross + uSeed * 19.0));
                float reach = uDrag * mix(0.35, 1.6, lane);
                vec2 stepUv = tangentUv() * reach / uScreen / float(${TAPS});

                vec3 acc = vec3(0.0);
                float wsum = 0.0;
                for (int i = 0; i < ${TAPS}; i++) {
                    float f = float(i) / float(${TAPS} - 1);
                    float w = 1.0 - f * 0.7;
                    acc += texture2D(uBg, screenUv() - stepUv * float(i)).rgb * w;
                    wsum += w;
                }
                vec3 dragged = acc / wsum;

                // Paint dominates. The dragged background survives only in the
                // crevices, where the layer is thinnest.
                float coat = clamp(uPaint * (0.88 + 0.18 * lane) - 0.15 * (1.0 - clamp(height, 0.0, 1.0)), 0.0, 1.0);
                vec3 pigment = mix(dragged, uColor, coat);

                vec3 light = normalize(vec3(-0.4, 0.75, 0.55));
                vec3 view = vec3(0.0, 0.0, 1.0);
                float diff = max(dot(n, light), 0.0);
                vec3 halfVec = normalize(light + view);
                float spec = pow(max(dot(n, halfVec), 0.0), uShininess) * uGloss;

                vec3 color = pigment * (0.55 + 0.45 * diff) + vec3(spec);
                gl_FragColor = vec4(color, body);
            }
        `;
    }
}
