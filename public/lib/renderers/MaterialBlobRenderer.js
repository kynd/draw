import * as THREE from 'three';
import { BlobRenderer } from './BlobRenderer.js';

/**
 * A blob shaded as a material, from a quintic dome height field whose slope is
 * analytic and second-derivative-free at both ends, so no corner shows in the
 * shading. Metal and faceted glass share a surface of random triangular panes on a
 * noise-warped lattice: each pane throws the reflection its own way. Smooth glass
 * keeps a low-frequency wave surface and bends the background through its normal.
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

            // The thick oil's surface: a smooth swell carrying sharp ridges with
            // wide smooth valleys. On metal the ridges streak the reflection.
            float metalRelief(vec2 p) {
                float low = fbm(p * 1.4 + uSeed * 13.0);
                float high = 1.0 - abs(2.0 * fbm(p * 3.2 + uSeed * 29.0) - 1.0);
                high = high * high * high;
                return mix(high, low, 0.55);
            }

            // A triangle id on a lattice warped by low-frequency noise, so the panes
            // are triangular but not regular.
            vec2 triangleId(vec2 p) {
                vec2 w = p + (vec2(fbm(p * 1.3 + uSeed * 5.0), fbm(p * 1.3 + uSeed * 9.0)) - 0.5) * 0.5;
                vec2 g = vec2(w.x - w.y * 0.57735, w.y * 1.1547) * uFacets;
                vec2 cell = floor(g);
                float upper = step(1.0, fract(g).x + fract(g).y);
                return cell * 2.0 + vec2(upper, 0.0);
            }

            void main() {
                float arc;
                vec2 outward;
                float d = sdBlob(vWorld, arc, outward);
                float alpha = 1.0 - smoothstep(-0.006, 0.0, d);
                if (alpha <= 0.003) discard;

                float domeW = 0.3;
                float t = clamp(-d / domeW, 0.0, 1.0);
                float dome = t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
                float domeSlope = 30.0 * t * t * (t - 1.0) * (t - 1.0) / domeW;

                vec2 slope;
                float e = 0.012;
                if (uMode == 2) {
                    slope = (hash22(triangleId(vWorld) + uSeed * 3.0) - 0.5) * 2.0 * uRelief;
                } else if (uMode == 0) {
                    slope = vec2(
                        metalRelief(vWorld + vec2(e, 0.0)) - metalRelief(vWorld - vec2(e, 0.0)),
                        metalRelief(vWorld + vec2(0.0, e)) - metalRelief(vWorld - vec2(0.0, e))
                    ) / (2.0 * e) * uRelief * 0.35;
                } else {
                    slope = vec2(
                        reliefAt(vWorld + vec2(e, 0.0)) - reliefAt(vWorld - vec2(e, 0.0)),
                        reliefAt(vWorld + vec2(0.0, e)) - reliefAt(vWorld - vec2(0.0, e))
                    ) / (2.0 * e) * uRelief * 0.12;
                }
                slope += outward * domeSlope * 0.05;
                vec3 normal = normalize(vec3(-slope, 1.0));

                vec3 view = vec3(0.0, 0.0, 1.0);
                vec3 light = normalize(vec3(-0.4, 0.75, 0.55));
                vec3 halfVec = normalize(light + view);
                float spec = pow(max(dot(normal, halfVec), 0.0), 60.0) * uSpecular;

                vec3 color;
                if (uMode == 0) {
                    vec3 r = reflect(-view, normal);
                    // A tilted, wide horizon: a flat face reads bright, and the waves
                    // sweep the boundary across it.
                    float horizon = smoothstep(-0.35, 0.35, r.y + 0.25);
                    color = mix(vec3(0.08), vec3(0.95), horizon) * uTint;
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
