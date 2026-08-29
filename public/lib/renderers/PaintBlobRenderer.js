import * as THREE from 'three';
import { BlobRenderer } from './BlobRenderer.js';

/**
 * An opaque paint fill with relief.
 *
 * Height is an edge dome plus interior noise. The dome is a smoothstep of distance
 * whose slope is taken analytically, so the rise eases into the flat interior with no
 * crease. The noise mixes a low frequency for broad swell with a high one for
 * detail, and the high band can be folded into ridges (the fold of 1-|2n-1| has a
 * corner at each crest, which is what keeps thick paint's ridges sharp).
 *
 * `dry` breaks the fill the way a dry brush does: a streak noise stretched along a
 * seeded direction erodes both the edge and the interior, leaving rough transparent
 * scratches where the paint ran out.
 *
 * `split` sharpens the two-pigment mix: at 1 the colors meet on a hard boundary
 * shaped by low-frequency noise instead of mixing in smooth patches.
 *
 * `rag` tears the edge on a fine noise, by its amplitude in world units.
 *
 * `knife` shapes the fill as palette-knife work: the height becomes flat patches,
 * each with its own drag direction and striations along it, meeting at hard steps,
 * and the edge becomes straight cut segments, offset piecewise-linearly in arc.
 */
export class PaintBlobRenderer extends BlobRenderer {
    constructor({
        color = '#7a4a2f',
        colorB = null,
        fade = 0.1,        // pigment mottling
        relief = 0.3,      // noise height
        swell = 0.5,       // low-frequency share of the height
        ridged = false,
        gloss = 0.3,
        edgeSoft = 0.03,   // alpha feather width
        dry = 0,           // dry-brush erosion
        split = 0,         // sharpness of the two-pigment boundary
        rag = 0,           // edge tear amplitude in world units
        knife = false,     // palette-knife patches and a straight-cut edge
        noiseFreq = 5,
        ...rest
    } = {}) {
        super({ margin: 0.15, ...rest });
        this.color = color;
        this.colorB = colorB ?? color;
        this.fade = fade;
        this.relief = relief;
        this.swell = swell;
        this.ridged = ridged;
        this.gloss = gloss;
        this.edgeSoft = edgeSoft;
        this.dry = dry;
        this.split = split;
        this.rag = rag;
        this.knife = knife;
        this.noiseFreq = noiseFreq;
    }

    uniforms() {
        return {
            uColor: { value: new THREE.Color(this.color) },
            uColorB: { value: new THREE.Color(this.colorB) },
            uFade: { value: this.fade },
            uRelief: { value: this.relief },
            uSwell: { value: this.swell },
            uRidged: { value: this.ridged ? 1 : 0 },
            uGloss: { value: this.gloss },
            uEdgeSoft: { value: this.edgeSoft },
            uDry: { value: this.dry },
            uSplit: { value: this.split },
            uRag: { value: this.rag },
            uKnife: { value: this.knife ? 1 : 0 },
            uFreq: { value: this.noiseFreq },
        };
    }

    fragmentShader() {
        return /* glsl */`
            uniform vec3 uColor;
            uniform vec3 uColorB;
            uniform float uFade;
            uniform float uRelief;
            uniform float uSwell;
            uniform int uRidged;
            uniform float uGloss;
            uniform float uEdgeSoft;
            uniform float uDry;
            uniform float uSplit;
            uniform float uRag;
            uniform int uKnife;
            uniform float uFreq;

            float reliefAt(vec2 p) {
                float low = fbm(p * 1.6 + uSeed * 13.0);
                float high;
                if (uKnife == 1) {
                    // Knife patches: flat regions from a jittered grid, each with
                    // its own drag direction and striations along it. The hard
                    // borders between patches are the knife's ridges.
                    vec2 q = p + (vec2(fbm(p * 2.6 + uSeed * 47.0), fbm(p * 2.6 + uSeed * 59.0)) - 0.5) * 0.25;
                    vec2 cell = floor(q * 2.5 + uSeed * 3.0);
                    float theta = hash21(cell * 3.1 + uSeed * 23.0) * 3.1416;
                    vec2 dirK = vec2(cos(theta), sin(theta));
                    vec2 perpK = vec2(-dirK.y, dirK.x);
                    float striae = 1.0 - abs(2.0 * fbm(vec2(dot(p, dirK) * 1.2, dot(p, perpK) * 4.5)
                        + hash21(cell * 5.9 + uSeed) * 40.0) - 1.0);
                    striae = striae * striae * striae;
                    // Mostly the patch's own flat level; the striations stay faint,
                    // so the hard steps between patches carry the relief.
                    high = mix(hash21(cell * 7.7 + uSeed * 31.0), striae, 0.35);
                } else {
                    high = fbm(p * uFreq + uSeed * 29.0);
                    if (uRidged == 1) {
                        // The fold's crest keeps its corner; cubing widens the
                        // smooth valleys around the sharp ridges.
                        high = 1.0 - abs(2.0 * high - 1.0);
                        high = high * high * high;
                    }
                }
                return mix(high, low, uSwell);
            }

            void main() {
                float arc;
                vec2 outward;
                float d = sdBlob(vWorld, arc, outward);
                if (uRag > 0.0) {
                    // The edge tears on a fine noise instead of tracing the contour.
                    d += (fbm(vWorld * 8.0 + uSeed * 37.0) - 0.5) * uRag;
                }
                if (uKnife == 1) {
                    // A knife edge: straight cut segments, offset piecewise-linearly
                    // in arc so the boundary is chords, not a wavering line. The
                    // last segment wraps to the first, so the loop closes.
                    float segs = 14.0;
                    float phase = arc / uPerimeter * segs;
                    float cellE = floor(phase);
                    float o0 = hash11(mod(cellE, segs) * 9.3 + uSeed * 53.0) - 0.5;
                    float o1 = hash11(mod(cellE + 1.0, segs) * 9.3 + uSeed * 53.0) - 0.5;
                    d += mix(o0, o1, fract(phase)) * 0.16;
                }
                float alpha = 1.0 - smoothstep(-uEdgeSoft, 0.0, d);
                if (alpha <= 0.003) discard;

                // Dry brush: streaks stretched along a seeded direction erode the
                // edge and scratch the interior open.
                if (uDry > 0.0) {
                    // A tooth like the dry media's, only denser: mostly isotropic
                    // grain with a gentle stretch, thresholded so the fill breaks
                    // into speckle rather than fading.
                    float angle = hash11(uSeed * 3.7) * 6.2832;
                    vec2 dir = vec2(cos(angle), sin(angle));
                    vec2 perp = vec2(-dir.y, dir.x);
                    float tooth = fbm(vec2(dot(vWorld, dir) * 7.0, dot(vWorld, perp) * 10.0) + uSeed * 7.0);
                    // The tooth also bites the boundary, so the edge tears instead
                    // of tracing the contour.
                    alpha = 1.0 - smoothstep(-0.015, 0.005, d + (0.5 - tooth) * 0.11 * uDry);
                    float cover = smoothstep(uDry * 0.6 - 0.22, uDry * 0.6 + 0.2, tooth + 0.24);
                    alpha *= mix(1.0, cover, uDry * 0.8);
                    if (alpha <= 0.004) discard;
                }

                // Height: a wide quintic dome. The quintic's second derivative is
                // also zero at both ends, so neither the rim nor the junction with
                // the flat interior shows a corner in the shading.
                float domeW = 0.3;
                float rimVar = 1.0;
                if (uKnife == 1) {
                    // Knife paint's rim does not trace the edge: a noise varies it
                    // around the boundary, tall and steep in some stretches,
                    // scraped nearly flat in others.
                    float rimN = fbm(vWorld * 1.4 + uSeed * 61.0);
                    domeW = mix(0.3, 0.06, rimN);
                    rimVar = smoothstep(0.25, 0.65, rimN);
                }
                float t = clamp(-d / domeW, 0.0, 1.0);
                float dome = t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
                float domeSlope = 30.0 * t * t * (t - 1.0) * (t - 1.0) / domeW;
                float n = reliefAt(vWorld);

                float e = 0.01;
                vec2 gradN = vec2(
                    reliefAt(vWorld + vec2(e, 0.0)) - reliefAt(vWorld - vec2(e, 0.0)),
                    reliefAt(vWorld + vec2(0.0, e)) - reliefAt(vWorld - vec2(0.0, e))
                ) / (2.0 * e);
                vec2 slope = outward * domeSlope * (0.5 + uRelief * n) * 0.05 * rimVar
                           + gradN * dome * uRelief * 0.05;
                vec3 normal = normalize(vec3(-slope, 1.0));

                vec3 light = normalize(vec3(-0.4, -0.7, 0.6));
                vec3 view = vec3(0.0, 0.0, 1.0);
                float diff = max(dot(normal, light), 0.0);
                vec3 halfVec = normalize(light + view);
                float spec = pow(max(dot(normal, halfVec), 0.0), 40.0) * uGloss;

                // Split pulls the pigment boundary to a low frequency and narrows
                // its width, so the two colors meet on a sharp wandering line
                // instead of mixing in patches.
                float blend = fbm(vWorld * mix(uFreq * 0.45, 1.4, uSplit) + uSeed * 3.0);
                float blendW = mix(0.2, 0.008, uSplit);
                vec3 base = mix(uColor, uColorB, smoothstep(0.5 - blendW, 0.5 + blendW, blend));
                vec3 pigment = base * (1.0 - uFade * (fbm(vWorld * uFreq * 0.6 + uSeed * 5.0) - 0.25));
                vec3 color = pigment * (0.6 + 0.4 * diff) + vec3(spec);
                gl_FragColor = vec4(clamp(color, 0.0, 1.0), alpha);
            }
        `;
    }
}
