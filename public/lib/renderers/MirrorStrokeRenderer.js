import * as THREE from 'three';
import { HeightFieldStrokeRenderer } from './HeightFieldStrokeRenderer.js';

/**
 * Metal that reflects what is actually behind it.
 *
 * The reflected direction is used as a screen-space offset into the background rather
 * than as a ray into a cube map. It is not a correct reflection and it cannot show
 * anything outside the frame, but for a flat mark lying on a surface the difference is
 * invisible, and it costs one texture read.
 */
export class MirrorStrokeRenderer extends HeightFieldStrokeRenderer {
    constructor({
        background = null,
        tint = '#e8e8e8',
        strength = 0.16,
        specular = 0.7,
        shininess = 60,
        contrast = 1.35,
        ...rest
    } = {}) {
        super(rest);
        this.background = background;
        this.tint = tint;
        this.strength = strength;
        this.specular = specular;
        this.shininess = shininess;
        this.contrast = contrast;
    }

    uniforms(def) {
        return {
            ...super.uniforms(def),
            uBg: { value: this.background },
            uTint: { value: new THREE.Color(this.tint) },
            uStrength: { value: this.strength },
            uSpecular: { value: this.specular },
            uShininess: { value: this.shininess },
            uContrast: { value: this.contrast },
        };
    }

    shading() {
        return /* glsl */`
            uniform sampler2D uBg;
            uniform vec3 uTint;
            uniform float uStrength;
            uniform float uSpecular;
            uniform float uShininess;
            uniform float uContrast;

            void main() {
                float height, body;
                vec3 n = surfaceNormal(height, body);
                if (body <= 0.001) discard;

                vec3 view = vec3(0.0, 0.0, 1.0);
                vec3 r = reflect(-view, n);

                vec2 suv = clamp(screenUv() + r.xy * uStrength, 0.001, 0.999);
                vec3 env = texture2D(uBg, suv).rgb;

                // Metal pushes contrast: a mirror does not return a muted copy.
                env = clamp((env - 0.5) * uContrast + 0.5, 0.0, 1.0);

                vec3 light = normalize(vec3(-0.4, 0.8, 0.45));
                vec3 halfVec = normalize(light + view);
                float spec = pow(max(dot(n, halfVec), 0.0), uShininess) * uSpecular;

                gl_FragColor = vec4(env * uTint + vec3(spec), body);
            }
        `;
    }
}
