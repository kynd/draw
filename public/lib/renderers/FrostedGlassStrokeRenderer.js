import * as THREE from 'three';
import { HeightFieldStrokeRenderer } from './HeightFieldStrokeRenderer.js';

/**
 * Frosted glass: the clear-glass lens, roughened so it scatters instead of imaging.
 *
 * Where GlassStrokeRenderer bends the background along one sharp normal, this one takes
 * several taps around each lookup, offset in a per-fragment random direction, and
 * averages them. The scatter turns the refraction grainy and blurred, the way a
 * sandblasted surface diffuses what is behind it. `grain` sets the scatter radius: at
 * zero it collapses back to plain glass, wider and the surface reads more matte.
 */
export class FrostedGlassStrokeRenderer extends HeightFieldStrokeRenderer {
    /**
     * @param {object} opts
     * @param {THREE.Texture} [opts.background]
     * @param {number} [opts.refract]  Refraction offset, in screen fractions.
     * @param {number} [opts.reflect]  Reflection offset, in screen fractions.
     * @param {number} [opts.grain]    Scatter radius per tap, in screen fractions.
     * @param {number} [opts.fresnel]  Edge reflection falloff.
     */
    constructor({
        background = null,
        tint = '#e7f2f6',
        refract = 0.2,
        reflect = 0.1,
        grain = 0.022,
        fresnel = 3.0,
        specular = 0.5,
        shininess = 24,
        ...rest
    } = {}) {
        super(rest);
        this.background = background;
        this.tint = tint;
        this.refract = refract;
        this.reflect = reflect;
        this.grain = grain;
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
            uGrain: { value: this.grain },
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
            uniform float uGrain;
            uniform float uFresnel;
            uniform float uSpecular;
            uniform float uShininess;

            const int TAPS = 6;

            void main() {
                float height, body;
                vec3 n = surfaceNormal(height, body);
                if (body <= 0.001) discard;

                vec3 view = vec3(0.0, 0.0, 1.0);
                vec3 r = reflect(-view, n);
                vec2 base = screenUv();

                // Micro-roughness: each fragment scatters its lookup a little in a
                // per-pixel random direction, and several taps average into a grainy,
                // blurred refraction rather than a clean lens.
                float seed = hash21(gl_FragCoord.xy * 0.7 + uSeed * 11.0);
                vec3 through = vec3(0.0);
                vec3 back = vec3(0.0);
                for (int i = 0; i < TAPS; i++) {
                    float a = (float(i) + seed) / float(TAPS) * 6.2831853;
                    float rad = 0.35 + 0.65 * hash21(gl_FragCoord.xy + float(i) * 9.13 + uSeed);
                    vec2 jitter = vec2(cos(a), sin(a)) * rad * uGrain;
                    through += texture2D(uBg, clamp(base + n.xy * uRefract + jitter, 0.001, 0.999)).rgb;
                    back += texture2D(uBg, clamp(base + r.xy * uReflect + jitter, 0.001, 0.999)).rgb;
                }
                through *= uTint / float(TAPS);
                back /= float(TAPS);

                float f = pow(1.0 - clamp(dot(n, view), 0.0, 1.0), uFresnel);
                vec3 color = mix(through, back, clamp(f * 2.2, 0.0, 0.85));

                // A soft, broad sheen instead of a sharp highlight; frost scatters the
                // specular too.
                vec3 light = normalize(vec3(-0.35, -0.8, 0.5));
                vec3 halfVec = normalize(light + view);
                float spec = pow(max(dot(n, halfVec), 0.0), uShininess) * uSpecular;

                gl_FragColor = vec4(color + vec3(spec), body);
            }
        `;
    }
}
