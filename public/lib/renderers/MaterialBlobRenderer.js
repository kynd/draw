import * as THREE from 'three';
import { BlobRenderer } from './BlobRenderer.js';

/**
 * A blob shaded as a material, from a smooth height field.
 *
 * The base is a smoothstep dome with an analytic slope, so the surface eases from
 * the rim into the interior with no crease, and a low-frequency noise rolls broad
 * waves over it: metal shaded this way reads as mercury. Smooth glass shares the
 * same surface and bends the background through its normal. Faceted glass replaces
 * the smooth normal with one random tilt per triangle of a warped triangular
 * lattice, so it breaks into irregular panes.
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

                float domeW = 0.16;
                float t = clamp(-d / domeW, 0.0, 1.0);
                float dome = t * t * (3.0 - 2.0 * t);
                float domeSlope = (6.0 * t - 6.0 * t * t) / domeW;

                vec2 slope;
                if (uMode == 2) {
                    slope = (hash22(triangleId(vWorld) + uSeed * 3.0) - 0.5) * 2.0 * uRelief;
                } else {
                    float e = 0.012;
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
