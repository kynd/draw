import * as THREE from 'three';
import { BlobRenderer } from './BlobRenderer.js';

/**
 * A blob shaded as a material, from a quintic dome height field whose slope is
 * analytic and second-derivative-free at both ends, so no corner shows in the
 * shading. Metal takes the thick oil's ridged relief and reflects a chrome
 * environment of hard-edged light bands, which the ridges streak into liquid
 * highlights. Smooth glass keeps a low-frequency wave surface and bends the
 * background through its normal. Faceted glass takes one random tilt per triangle of a
 * lightly jittered triangular lattice, so the panes are near-regular triangles with
 * slightly offset vertices and straight edges.
 */
export class MaterialBlobRenderer extends BlobRenderer {
    /** @param {'metal'|'glass'|'facet'} [opts.mode] */
    constructor({
        mode = 'metal',
        tint = '#e8e8e8',
        background = null,
        relief = 0.5,
        bend = 0.05,
        facets = 4,
        specular = 0.85,
        ...rest
    } = {}) {
        super({ margin: 0.15, ...rest });
        this.mode = { metal: 0, glass: 1, facet: 2 }[mode] ?? 0;
        this.tint = tint;
        this.background = background;
        this.relief = relief;
        this.bend = bend;
        this.facets = facets;
        this.specular = specular;
    }

    uniforms() {
        return {
            uMode: { value: this.mode },
            uTint: { value: new THREE.Color(this.tint) },
            uBg: { value: this.background },
            uRelief: { value: this.relief },
            uBend: { value: this.bend },
            uFacets: { value: this.facets },
            uSpecular: { value: this.specular },
        };
    }

    fragmentShader() {
        return /* glsl */`
            uniform int uMode;
            uniform vec3 uTint;
            uniform sampler2D uBg;
            uniform float uRelief;
            uniform float uBend;
            uniform float uFacets;
            uniform float uSpecular;

            // Broad waves only: the surface stays smooth, and the light rolls.
            float reliefAt(vec2 p) { return fbm(p * 1.5 + uSeed * 13.0); }

            // Gradient (Perlin-style) noise: smooth, and without the square grid that
            // value noise leaves, which the hard-edged reflection would otherwise show.
            float gnoise(vec2 p) {
                vec2 i = floor(p), f = fract(p);
                vec2 u = f * f * (3.0 - 2.0 * f);
                float a = dot(hash22(i) - 0.5, f);
                float b = dot(hash22(i + vec2(1.0, 0.0)) - 0.5, f - vec2(1.0, 0.0));
                float c = dot(hash22(i + vec2(0.0, 1.0)) - 0.5, f - vec2(0.0, 1.0));
                float d = dot(hash22(i + vec2(1.0, 1.0)) - 0.5, f - vec2(1.0, 1.0));
                return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) + 0.5;
            }
            // fbm over gradient noise, each octave rotated so no axis pattern builds up.
            float mfbm(vec2 p) {
                float v = 0.0, a = 0.5;
                mat2 R = mat2(0.8, -0.6, 0.6, 0.8);
                for (int i = 0; i < 5; i++) { v += a * gnoise(p); p = R * p * 2.0; a *= 0.5; }
                return v;
            }

            // The thick oil's surface: a smooth swell carrying sharp ridges with
            // wide smooth valleys. On metal the ridges streak the reflection.
            float metalRelief(vec2 p) {
                float low = mfbm(p * 0.4 + uSeed * 13.0);
                float high = 1.0 - abs(2.0 * mfbm(p * 0.8 + uSeed * 29.0) - 1.0);
                high = high * high * high;
                return mix(high, low, 0.65);
            }

            // A chrome environment: dark ground, mid sky, and narrow bright bands
            // with hard edges. Sharp features in the reflection are what read as
            // metal; a plain gradient shades like matte paint.
            vec3 metalEnv(vec3 r) {
                // The presented frame flips world y, so the sky side is -r.y. The bands
                // are soft-edged: hard edges over the ridged relief break into facets.
                float ry = -r.y;
                vec3 env = mix(vec3(0.05), vec3(0.4), smoothstep(-0.24, 0.28, ry));
                env = mix(env, vec3(1.0), smoothstep(0.08, 0.26, ry) - smoothstep(0.38, 0.62, ry));
                env = mix(env, vec3(0.82), smoothstep(-0.58, -0.4, ry) - smoothstep(-0.34, -0.16, ry));
                env = mix(env, vec3(0.88), (smoothstep(0.22, 0.42, r.x) - smoothstep(0.5, 0.7, r.x)) * 0.6);
                return env;
            }

            void main() {
                float arc;
                vec2 outward;
                float d = sdBlob(vWorld, arc, outward);
                if (uMode == 0) {
                    // The outline swells on the relief's low band, so the
                    // silhouette waves where the surface does.
                    d -= (mfbm(vWorld * 0.4 + uSeed * 13.0) - 0.5) * uRelief * 0.5;
                }
                float alpha = 1.0 - smoothstep(-0.006, 0.0, d);
                if (alpha <= 0.003) discard;

                float domeW = min(0.3, localInset(vWorld, d, outward));
                float t = clamp(-d / domeW, 0.0, 1.0);
                float dome = t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
                float domeSlope = 30.0 * t * t * (t - 1.0) * (t - 1.0) / domeW;

                vec2 slope;
                float e = 0.012;
                if (uMode == 2) {
                    // Near-regular triangular panes: the lattice vertices are only
                    // slightly offset, so the triangles stay close to regular with
                    // straight edges.
                    slope = (hash22(triFacetId(vWorld, uFacets, 0.22) + uSeed * 3.0) - 0.5) * 2.0 * uRelief;
                } else if (uMode == 0) {
                    // A wider step than the other modes, so the finite difference
                    // averages the sharp ridges into a smooth normal instead of
                    // aliasing them into facets under the hard-edged reflection.
                    float em = 0.03;
                    slope = vec2(
                        metalRelief(vWorld + vec2(em, 0.0)) - metalRelief(vWorld - vec2(em, 0.0)),
                        metalRelief(vWorld + vec2(0.0, em)) - metalRelief(vWorld - vec2(0.0, em))
                    ) / (2.0 * em) * uRelief * 0.25;
                } else {
                    slope = vec2(
                        reliefAt(vWorld + vec2(e, 0.0)) - reliefAt(vWorld - vec2(e, 0.0)),
                        reliefAt(vWorld + vec2(0.0, e)) - reliefAt(vWorld - vec2(0.0, e))
                    ) / (2.0 * e) * uRelief * 0.12;
                }
                slope += outward * domeSlope * 0.05;
                vec3 normal = normalize(vec3(-slope, 1.0));

                vec3 view = vec3(0.0, 0.0, 1.0);
                vec3 light = normalize(vec3(-0.4, -0.75, 0.55));
                vec3 halfVec = normalize(light + view);
                float spec = pow(max(dot(normal, halfVec), 0.0), 60.0) * uSpecular;

                vec3 color;
                if (uMode == 0) {
                    vec3 r = reflect(-view, normal);
                    color = metalEnv(r) * uTint;
                } else {
                    vec2 suv = clamp(screenUv() + normal.xy * uBend * 2.0, 0.001, 0.999);
                    color = texture2D(uBg, suv).rgb * uTint;
                    float f = pow(1.0 - max(dot(normal, view), 0.0), 3.0);
                    color = mix(color, vec3(0.9), clamp(f * 1.6, 0.0, 0.6));
                }
                gl_FragColor = vec4(color + vec3(spec), alpha);
            }
        `;
    }
}
