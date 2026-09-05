import * as THREE from 'three';
import { PatternStrokeRenderer } from './PatternStrokeRenderer.js';

const TAPS = 8;

/**
 * The pattern stroke's elements as wet marks that drag the background.
 *
 * Placement, sizes, and rows come from PatternStrokeRenderer unchanged; only
 * the elements' surface differs. A dash or strip walks backward along its own
 * direction in screen space and averages what it finds, dragging harder toward
 * its tail, so each element reads as a short pull of wet paint. A dot pulls
 * the surrounding color inward, so it reads as a blot. The picked-up
 * background is tinted with the element's color by `pigment`.
 */
export class WetPatternStrokeRenderer extends PatternStrokeRenderer {
    /**
     * @param {object} opts
     * @param {THREE.Texture} [opts.background]
     * @param {number} [opts.drag]     Drag reach in pixels.
     * @param {number} [opts.pigment]  Ratio of the element's color over the drag.
     */
    constructor({ background = null, drag = 40, pigment = 0.55, ...rest } = {}) {
        super(rest);
        this.background = background;
        this.drag = drag;
        this.pigment = pigment;
    }

    _material() {
        return new THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            uniforms: {
                uMode: { value: this.mode === 'dots' ? 1 : this.mode === 'leaves' ? 2 : 0 },
                uBg: { value: this.background },
                uDrag: { value: this.drag },
                uPigment: { value: this.pigment },
                uScreen: { value: new THREE.Vector2(1, 1) },
                uWorldToUv: { value: new THREE.Vector2(1, 1) },
            },
            vertexShader: /* glsl */`
                attribute vec2 aLocal;
                attribute vec2 aDims;
                attribute float aSeed;
                attribute vec2 aDir;
                varying vec2 vLocal;
                varying vec2 vDims;
                varying float vSeed;
                varying vec3 vColor;
                varying vec2 vDir;
                void main() {
                    vLocal = aLocal;
                    vDims = aDims;
                    vSeed = aSeed;
                    vColor = color;
                    vDir = aDir;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: /* glsl */`
                uniform int uMode;
                uniform sampler2D uBg;
                uniform float uDrag;
                uniform float uPigment;
                uniform vec2 uScreen;
                uniform vec2 uWorldToUv;
                varying vec2 vLocal;
                varying vec2 vDims;
                varying float vSeed;
                varying vec3 vColor;
                varying vec2 vDir;
                void main() {
                    float d;
                    vec2 dragDirWorld;
                    if (uMode == 1) {
                        float ang = atan(vLocal.y, vLocal.x);
                        float wob = 1.0 + 0.10 * sin(ang * 3.0 + vSeed * 7.1)
                                        + 0.07 * sin(ang * 5.0 + vSeed * 13.7);
                        d = length(vLocal) - vDims.x * wob;
                        // A dot pulls the surrounding color inward, so the drag
                        // direction points away from its center.
                        vec2 perp = vec2(-vDir.y, vDir.x);
                        vec2 outward = vDir * vLocal.x + perp * vLocal.y;
                        dragDirWorld = length(outward) > 1e-6 ? normalize(outward) : vDir;
                    } else if (uMode == 2) {
                        float u = clamp(vLocal.x / max(vDims.x, 1e-5), -1.0, 1.0);
                        float bow = sin(u * 3.14159 + vSeed) * vDims.y * 0.3;
                        float prof = pow(max(1.0 - u * u, 0.0), 0.65);
                        d = abs(vLocal.y - bow) - vDims.y * prof;
                        dragDirWorld = vDir;
                    } else {
                        vec2 p = vec2(max(abs(vLocal.x) - max(vDims.x - vDims.y, 0.0), 0.0), vLocal.y);
                        d = length(p) - vDims.y;
                        d += sin(vLocal.x / max(vDims.x, 1e-5) * 3.14159 + vSeed * 9.3) * vDims.y * 0.12;
                        dragDirWorld = vDir;
                    }
                    float alpha = 1.0 - smoothstep(-0.004, 0.003, d);
                    if (alpha <= 0.01) discard;

                    vec2 suv = gl_FragCoord.xy / uScreen;
                    vec2 duv = dragDirWorld * uWorldToUv;
                    float len = length(duv);
                    vec2 dirUv = len > 1e-8 ? duv / len : vec2(1.0, 0.0);

                    // The tail of the element drags farther than its head, so
                    // each mark reads as one short pull.
                    float along = clamp(vLocal.x / max(vDims.x, 1e-5) * 0.5 + 0.5, 0.0, 1.0);
                    float reach = uDrag * (0.35 + 0.65 * along) * (0.7 + 0.6 * fract(vSeed * 0.731));
                    vec2 stepUv = dirUv * reach / uScreen / float(${TAPS});

                    vec3 acc = vec3(0.0);
                    float wsum = 0.0;
                    for (int i = 0; i < ${TAPS}; i++) {
                        float f = float(i) / float(${TAPS} - 1);
                        float w = 1.0 - f * 0.7;
                        acc += texture2D(uBg, suv - stepUv * float(i)).rgb * w;
                        wsum += w;
                    }
                    vec3 dragged = acc / wsum;

                    vec3 color = mix(dragged, vColor, uPigment * (0.7 + 0.3 * fract(vSeed * 0.377)));
                    gl_FragColor = vec4(color, alpha);
                }
            `,
            vertexColors: true,
        });
    }
}
