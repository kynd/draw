import * as THREE from 'three';
import { HeightFieldStrokeRenderer } from './HeightFieldStrokeRenderer.js';

/**
 * Glass or water: what is behind, bent, plus what is in front, reflected.
 *
 * Refraction offsets the background lookup along the surface normal, so the bead acts
 * as a lens and the displacement is largest where the surface tilts hardest, at the
 * edges. Reflection is mixed in by a Fresnel term, which is what stops the result
 * reading as a smudge: a transparent surface turns mirror-like at glancing angles, and
 * without that the edges look no different from the middle.
 */
export class GlassStrokeRenderer extends HeightFieldStrokeRenderer {
    constructor({
        background = null,
        tint = '#dff0f5',
        refract = 0.22,
        reflect = 0.10,
        fresnel = 3.0,
        specular = 0.9,
        shininess = 90,
        ...rest
    } = {}) {
        super(rest);
        this.background = background;
        this.tint = tint;
        this.refract = refract;
        this.reflect = reflect;
        this.fresnel = fresnel;
        this.specular = specular;
        this.shininess = shininess;
    }

    uniforms(def) {
        return {
            ...super.uniforms(def),
            uBg: { value: this.background },
            uTint: { value: new THREE.Color(this.tint) },
            uRefract: { value: this.refract },
            uReflect: { value: this.reflect },
            uFresnel: { value: this.fresnel },
            uSpecular: { value: this.specular },
            uShininess: { value: this.shininess },
        };
    }

    shading() {
        return /* glsl */`
            uniform sampler2D uBg;
            uniform vec3 uTint;
            uniform float uRefract;
            uniform float uReflect;
            uniform float uFresnel;
            uniform float uSpecular;
            uniform float uShininess;

            void main() {
                float height, body;
                vec3 n = surfaceNormal(height, body);
                if (body <= 0.001) discard;

                vec3 view = vec3(0.0, 0.0, 1.0);

                // The bead bends what is behind it, hardest where it tilts most.
                vec2 bent = clamp(screenUv() + n.xy * uRefract, 0.001, 0.999);
                vec3 through = texture2D(uBg, bent).rgb * uTint;

                vec3 r = reflect(-view, n);
                vec2 mirrored = clamp(screenUv() + r.xy * uReflect, 0.001, 0.999);
                vec3 back = texture2D(uBg, mirrored).rgb;

                float f = pow(1.0 - clamp(dot(n, view), 0.0, 1.0), uFresnel);
                vec3 color = mix(through, back, clamp(f * 2.2, 0.0, 0.85));

                vec3 light = normalize(vec3(-0.35, -0.8, 0.5));
                vec3 halfVec = normalize(light + view);
                float spec = pow(max(dot(n, halfVec), 0.0), uShininess) * uSpecular;

                gl_FragColor = vec4(color + vec3(spec), body);
            }
        `;
    }
}
