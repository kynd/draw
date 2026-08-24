import * as THREE from 'three';
import { StrokeRenderer, resampleSpine } from './StrokeRenderer.js';

const MIN_SAMPLES = 8;
const MAX_SAMPLES = 2048;
const CAP_SEGMENTS = 16;

/**
 * Base for renderers that shade the ribbon with their own fragment shader.
 *
 * Two things separate this from RibbonStrokeRenderer. The geometry can be built wider
 * than the mark it draws, and the shader is given enough information to find the visual
 * edge inside that margin. Effects that reach past the stroke, a watercolor bleed or a
 * dragged smear, need somewhere to land, and a fragment can only be shaded where a
 * triangle covers it.
 *
 * ── What every subclass shader receives ──────────────────────────────────────
 *
 *   vUv        u along the stroke by arc length, v across the inflated width.
 *   vCross     signed distance across the width in visual-edge units. |vCross| <= 1
 *              is inside the mark; between 1 and `inflate` is the margin.
 *   vTangent   unit tangent in world space at this fragment.
 *   vWorld     world position.
 *   uScreen    resolution in pixels, for turning gl_FragCoord into a texture lookup.
 *   uWidth     half-width of the mark at this point, in world units.
 *   uSeed      per-stroke seed, so noise varies between strokes without Math.random.
 */
export class ShaderStrokeRenderer extends StrokeRenderer {
    /**
     * @param {object}  opts
     * @param {'square'|'rounded'|'ragged'} [opts.cap]
     * @param {number}  [opts.inflate]         Geometry width as a multiple of the mark.
     * @param {number}  [opts.samplesPerUnit]
     * @param {boolean} [opts.transparent]
     * @param {boolean} [opts.depthWrite]
     */
    constructor({ cap = 'rounded', inflate = 1, samplesPerUnit = 120, transparent = true, depthWrite = true } = {}) {
        super();
        this.cap = cap;
        this.inflate = inflate;
        this.samplesPerUnit = samplesPerUnit;
        this.transparent = transparent;
        this.depthWrite = depthWrite;
    }

    /** Subclasses return their fragment shader body. */
    fragmentShader() {
        throw new Error(`${this.constructor.name} must implement fragmentShader().`);
    }

    /** Subclasses return their own uniforms, merged over the shared ones. */
    uniforms(def) { return {}; }

    build(def) {
        const { samples, normals, tangents, length } = resampleSpine(
            def, this.samplesPerUnit, MIN_SAMPLES, MAX_SAMPLES
        );
        const n = samples.length;

        const positions = [];
        const uvs = [];
        const crosses = [];
        const beyonds = [];
        const tangentAttr = [];
        const indices = [];
        let maxWidth = 0;

        const push = (p, nrm, tan, offset, u, cross) => {
            positions.push(p.x + nrm.x * offset, p.y + nrm.y * offset, p.z + nrm.z * offset);
            uvs.push(u, (cross / this.inflate + 1) / 2);
            crosses.push(cross);
            beyonds.push(0);
            tangentAttr.push(tan.x, tan.y, tan.z);
        };

        // ── Ribbon, inflated ─────────────────────────────────────────────────
        for (let i = 0; i < n; i++) {
            const t = n === 1 ? 0 : i / (n - 1);
            const wL = def.widthLeftAt(t);
            const wR = def.widthRightAt(t);
            maxWidth = Math.max(maxWidth, wL, wR);
            push(samples[i], normals[i], tangents[i], wL * this.inflate, t, this.inflate);
            push(samples[i], normals[i], tangents[i], -wR * this.inflate, t, -this.inflate);
        }
        for (let i = 0; i < n - 1; i++) {
            const l0 = 2 * i, r0 = 2 * i + 1, l1 = 2 * i + 2, r1 = 2 * i + 3;
            indices.push(l0, r0, r1);
            indices.push(l0, r1, l1);
        }

        // ── End extensions ───────────────────────────────────────────────────
        //
        // The cap is carved in the shader, not built as geometry, because the effects
        // have to reach past the mark and a fragment can only be shaded where a
        // triangle covers it. So each end gets a plain quad running beyond the last
        // sample, and `aBeyond` tells the shader how far past the end it is, in the
        // same half-width units as `aCross`. A square cap needs no room past the end,
        // so it gets no quad at all.
        if (this.cap !== 'square') {
            for (const end of [{ i: 0, t: 0, sign: -1 }, { i: n - 1, t: 1, sign: 1 }]) {
                const wL = def.widthLeftAt(end.t);
                const wR = def.widthRightAt(end.t);
                const reach = Math.max(wL, wR) * this.inflate;
                const p = samples[end.i];
                const nrm = normals[end.i];
                const tan = tangents[end.i];
                const base = positions.length / 3;

                const corner = (side, out) => {
                    const lateral = side > 0 ? wL * this.inflate : -wR * this.inflate;
                    const away = out * reach * end.sign;
                    positions.push(
                        p.x + nrm.x * lateral + tan.x * away,
                        p.y + nrm.y * lateral + tan.y * away,
                        p.z + nrm.z * lateral + tan.z * away
                    );
                    uvs.push(end.t, (side + 1) / 2);
                    crosses.push(side * this.inflate);
                    beyonds.push(out * this.inflate);
                    tangentAttr.push(tan.x, tan.y, tan.z);
                };
                corner(1, 0); corner(-1, 0); corner(-1, 1); corner(1, 1);
                indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
            }
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setAttribute('aCross', new THREE.Float32BufferAttribute(crosses, 1));
        geometry.setAttribute('aBeyond', new THREE.Float32BufferAttribute(beyonds, 1));
        geometry.setAttribute('aTangent', new THREE.Float32BufferAttribute(tangentAttr, 3));
        geometry.setIndex(indices);
        geometry.computeBoundingSphere();

        const material = new THREE.ShaderMaterial({
            uniforms: {
                uScreen: { value: new THREE.Vector2(1, 1) },
                uWorldToUv: { value: new THREE.Vector2(1, 1) },
                uWidth: { value: maxWidth },
                uInflate: { value: this.inflate },
                uSeed: { value: def.seed },
                uCap: { value: { square: 0, rounded: 1, ragged: 2 }[this.cap] ?? 1 },
                uLength: { value: length },
                ...this.uniforms(def),
            },
            vertexShader: VERTEX_SHADER,
            fragmentShader: FRAGMENT_PRELUDE + this.fragmentShader(),
            side: THREE.DoubleSide,
            transparent: this.transparent,
            depthWrite: this.depthWrite,
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData.samples = samples;
        mesh.userData.stats = {
            sampleCount: n,
            vertexCount: positions.length / 3,
            triangleCount: indices.length / 3,
            length,
        };
        return mesh;
    }
}

const VERTEX_SHADER = /* glsl */`
    attribute float aCross;
    attribute float aBeyond;
    attribute vec3 aTangent;
    varying vec2 vUv;
    varying float vCross;
    varying float vBeyond;
    varying vec3 vTangent;
    varying vec3 vWorld;

    void main() {
        vUv = uv;
        vCross = aCross;
        vBeyond = aBeyond;
        vTangent = aTangent;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
    }
`;

const FRAGMENT_PRELUDE = /* glsl */`
    precision highp float;
    varying vec2 vUv;
    varying float vCross;
    varying float vBeyond;
    varying vec3 vTangent;
    varying vec3 vWorld;
    uniform vec2 uScreen;
    uniform vec2 uWorldToUv;
    uniform float uWidth;
    uniform float uInflate;
    uniform float uSeed;
    uniform float uLength;
    uniform int uCap;

    // Screen-space lookup for the background texture, matching the buffer's resolution.
    vec2 screenUv() { return gl_FragCoord.xy / uScreen; }

    // The stroke's own direction, expressed as a unit step in screen UV space.
    vec2 tangentUv() {
        vec2 d = vTangent.xy * uWorldToUv;
        float len = length(d);
        return len > 1e-8 ? d / len : vec2(1.0, 0.0);
    }

    /**
     * Distance from the mark's centre line in visual-edge units, where 1.0 is the
     * boundary. Every effect measures against this instead of abs(vCross), so the
     * shape closes at the ends the same way it closes at the sides.
     *
     * Declared here and defined after the noise helpers it needs for the ragged case.
     */
    float capDistance();

    float hash11(float p) {
        p = fract(p * 0.1031);
        p *= p + 33.33;
        return fract(p * (p + p));
    }
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

    float capDistance() {
        float across = abs(vCross);
        float beyond = abs(vBeyond);
        // Square: no quad is built past the end, so beyond is always zero here.
        if (uCap == 0) return across;
        if (uCap == 2) {
            // Ragged: spikes of varying depth past a flat end. Dividing by the spike
            // depth normalises it, so 1.0 stays the boundary for every tooth.
            float spike = 0.10 + 0.90 * valueNoise(vec2(vCross * 5.5 + uSeed * 31.0, uSeed));
            return max(across, beyond / max(spike, 0.02));
        }
        // Rounded: the end closes on a circle of the same radius as the half-width.
        return length(vec2(beyond, vCross));
    }
`;
