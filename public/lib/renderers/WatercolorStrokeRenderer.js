import * as THREE from 'three';
import { ShaderStrokeRenderer } from './ShaderStrokeRenderer.js';

/**
 * A wet wash that lets the background through, softened and tinted.
 *
 * The mark is captured in two stages so a stroke that folds over itself never seams or
 * darkens. First a flat, uniform silhouette renders through the coverage layer: MAX
 * blending over a solid shape gives one clean union, whatever the overlap. Then a
 * post-process composite paints the wash from that mask: it blurs the coverage into a
 * soft feathered edge, breaks the edge up with noise (irregular but smooth, since it
 * comes from a blurred field rather than a hard geometry edge), collects a rim where the
 * coverage falls off, and mixes the background through a noise-bent lens so what lies
 * underneath seeps in as blotches.
 */
export class WatercolorStrokeRenderer extends ShaderStrokeRenderer {
    constructor({
        color = '#3060a0',
        background = null,
        pigment = 0.55,
        rim = 0.45,
        granulation = 0.35,
        edge = 0.30,
        bleed = 0.6,
        feather = 9.0,
        samplesPerUnit = 90,
        cap = 'rounded',
    } = {}) {
        // The silhouette is captured through the coverage layer as a single clean shape;
        // the wash is painted from it by the post-process below.
        super({ cap, inflate: 1.15, samplesPerUnit, singleCoverage: true });
        this.color = color;
        this.background = background;
        this.pigment = pigment;
        this.rim = rim;
        this.granulation = granulation;
        this.edge = edge;
        this.bleed = bleed;
        this.feather = feather;
    }

    /** The mask: a flat solid silhouette, alpha only. The coverage layer unions folds. */
    fragmentShader() {
        return /* glsl */`
            void main() {
                float body = smoothstep(1.0, 0.9, capDistance());
                if (body <= 0.001) discard;
                gl_FragColor = vec4(1.0, 1.0, 1.0, body);
            }
        `;
    }

    build(def) {
        const mesh = super.build(def);
        mesh.userData.coverageComposite = this._composite(def);
        return mesh;
    }

    dispose(mesh) {
        mesh.userData.coverageComposite?.dispose();
        super.dispose(mesh);
    }

    _composite(def) {
        return new THREE.ShaderMaterial({
            transparent: true,
            depthTest: false,
            depthWrite: false,
            blending: THREE.CustomBlending,
            blendEquation: THREE.AddEquation,
            blendSrc: THREE.SrcAlphaFactor,
            blendDst: THREE.OneMinusSrcAlphaFactor,
            blendSrcAlpha: THREE.OneFactor,
            blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
            uniforms: {
                uMap: { value: null },
                uTexel: { value: new THREE.Vector2(1, 1) },
                uScreen: { value: new THREE.Vector2(1, 1) },
                uBg: { value: this.background },
                uColor: { value: new THREE.Color(this.color) },
                uSeed: { value: def.seed ?? 1 },
                uPigment: { value: this.pigment },
                uRim: { value: this.rim },
                uGrain: { value: this.granulation },
                uEdge: { value: this.edge },
                uBleed: { value: this.bleed },
                uFeather: { value: this.feather },
            },
            vertexShader: /* glsl */`
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: /* glsl */`
                precision highp float;
                varying vec2 vUv;
                uniform sampler2D uMap;
                uniform sampler2D uBg;
                uniform vec2 uTexel;
                uniform vec2 uScreen;
                uniform vec3 uColor;
                uniform float uSeed;
                uniform float uPigment;
                uniform float uRim;
                uniform float uGrain;
                uniform float uEdge;
                uniform float uBleed;
                uniform float uFeather;

                float hash21(vec2 p) {
                    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
                    p3 += dot(p3, p3.yzx + 33.33);
                    return fract((p3.x + p3.y) * p3.z);
                }
                float valueNoise(vec2 p) {
                    vec2 i = floor(p), f = fract(p);
                    f = f * f * (3.0 - 2.0 * f);
                    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
                               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
                }
                float fbm(vec2 p) {
                    float v = 0.0, a = 0.5;
                    for (int i = 0; i < 4; i++) { v += a * valueNoise(p); p *= 2.0; a *= 0.5; }
                    return v;
                }

                void main() {
                    // Feather: blur the clean solid mask into a soft coverage field, so
                    // the wash has a gradient edge to break up instead of a hard one.
                    float cov = 0.0;
                    const int N = 16;
                    for (int i = 0; i < N; i++) {
                        float a = float(i) * 2.3999632;
                        float rad = sqrt((float(i) + 0.5) / float(N));
                        vec2 off = vec2(cos(a), sin(a)) * rad * uFeather * uTexel;
                        cov += texture2D(uMap, vUv + off).a;
                    }
                    cov /= float(N);
                    if (cov <= 0.002) discard;

                    vec2 sp = vUv * uScreen;
                    float grain = fbm(sp / 26.0 + uSeed * 13.0);
                    // Mostly low-frequency wander, so the boundary undulates in big soft
                    // lobes, with a little mid-frequency detail on top.
                    float edgeN = (fbm(sp / 64.0 + uSeed * 5.0) - 0.5) * 1.5
                                + (fbm(sp / 24.0 + uSeed * 8.0) - 0.5) * 0.5;

                    // Irregular but soft edge: the noise shifts the soft coverage
                    // threshold, so the boundary wanders without ever being a hard tooth.
                    float body = smoothstep(0.32, 0.62, cov + edgeN * uEdge);
                    if (body <= 0.002) discard;

                    // The background through a noise-bent lens: what lies underneath
                    // seeps in as blotches, then a wide disk gather blooms it soft so it
                    // reads as pigment bleeding into wet paper, not a displaced copy.
                    vec2 nuv = sp / 56.0;
                    float blot = fbm(nuv * 0.5 + uSeed * 11.0);
                    float amp = uBleed * (0.4 + 1.2 * blot);
                    vec2 disp = vec2(fbm(nuv * 0.7 + uSeed * 3.7) - 0.5, fbm(nuv * 0.7 + uSeed * 7.9 + 31.0) - 0.5);
                    vec2 buv = vUv + disp * amp * 300.0 * uTexel;
                    float bloom = 5.0 + uBleed * 16.0;
                    vec3 soft = vec3(0.0);
                    const int M = 12;
                    for (int i = 0; i < M; i++) {
                        float a = float(i) * 2.3999632;
                        float rad = sqrt((float(i) + 0.5) / float(M)) * bloom;
                        soft += texture2D(uBg, clamp(buv + vec2(cos(a), sin(a)) * rad * uTexel, 0.001, 0.999)).rgb;
                    }
                    soft /= float(M);

                    // Where the blotch noise runs wet, the pigment thins and more of the
                    // picked-up background shows through.
                    float strength = uPigment * (0.72 + 0.42 * grain);
                    strength *= 1.0 - uBleed * 0.55 * smoothstep(0.35, 0.8, blot);
                    vec3 wash = mix(soft, uColor, clamp(strength, 0.0, 1.0));

                    // Pigment collects just inside the boundary, where the water dries
                    // back. A wide band across the feathered coverage, broken up by noise,
                    // so it reads as soft settled pigment rather than a clean outline.
                    float rimBand = smoothstep(0.18, 0.5, cov) * (1.0 - smoothstep(0.5, 0.95, cov));
                    rimBand *= 0.45 + 0.9 * fbm(sp / 40.0 + uSeed * 17.0);
                    wash = mix(wash, uColor * 0.62, clamp(rimBand, 0.0, 1.0) * uRim);

                    float alpha = body * (1.0 - uGrain * (1.0 - grain));
                    gl_FragColor = vec4(wash, alpha);
                }
            `,
        });
    }
}
