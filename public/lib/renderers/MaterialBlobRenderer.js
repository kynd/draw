import * as THREE from 'three';
import { BlobRenderer } from './BlobRenderer.js';

/**
 * A blob shaded as a material, from a height field of edge dome plus noise.
 *
 * Three modes. Metal reflects an assumed two-tone environment. Smooth glass bends
 * the background through the height field's normal. Faceted glass takes its normal
 * from a value constant per grid cell, so the surface breaks into flat panes that
 * each displace the background their own way.
 */
export class MaterialBlobRenderer extends BlobRenderer {
    /** @param {'metal'|'glass'|'facet'} [opts.mode] */
    constructor({
        mode = 'metal',
        tint = '#e8e8e8',
        background = null,
        relief = 0.3,
        bend = 0.05,
        facets = 9,
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

            float reliefAt(vec2 p) { return fbm(p * 4.0 + uSeed * 13.0); }

            void main() {
                float arc;
                vec2 outward;
                float d = sdBlob(vWorld, arc, outward);
                float alpha = 1.0 - smoothstep(-0.006, 0.0, d);
                if (alpha <= 0.003) discard;

                float domeW = 0.1;
                float dome = smoothstep(0.0, -domeW, d);

                vec2 slope;
                if (uMode == 2) {
                    // One random tilt per grid cell: flat panes with hard breaks.
                    vec2 cell = floor(vWorld * uFacets);
                    slope = (hash22(cell + uSeed * 3.0) - 0.5) * 2.0 * uRelief;
                } else {
                    float e = 0.008;
                    slope = vec2(
                        reliefAt(vWorld + vec2(e, 0.0)) - reliefAt(vWorld - vec2(e, 0.0)),
                        reliefAt(vWorld + vec2(0.0, e)) - reliefAt(vWorld - vec2(0.0, e))
                    ) / (2.0 * e) * uRelief * (uMode == 0 ? 0.03 : 0.06);
                }
                float domeSlope = (d > -domeW && d < 0.0) ? 1.0 / domeW : 0.0;
                slope += outward * domeSlope * 0.06;
                vec3 normal = normalize(vec3(-slope, 1.0));

                vec3 view = vec3(0.0, 0.0, 1.0);
                vec3 light = normalize(vec3(-0.4, 0.75, 0.55));
                vec3 halfVec = normalize(light + view);
                float spec = pow(max(dot(normal, halfVec), 0.0), 60.0) * uSpecular;

                vec3 color;
                if (uMode == 0) {
                    vec3 r = reflect(-view, normal);
                    // A tilted, wide horizon: a flat face reads bright, and the noise
                    // sweeps the boundary across it instead of flickering around zero.
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
