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
     * @param {number}  [opts.inflate]         Geometry width as a multiple of the mark.
     * @param {number}  [opts.samplesPerUnit]
     * @param {boolean} [opts.transparent]
     * @param {boolean} [opts.depthWrite]
     */
    constructor({ inflate = 1, samplesPerUnit = 120, transparent = true, depthWrite = true } = {}) {
        super();
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
        const tangentAttr = [];
        const indices = [];
        let maxWidth = 0;

        const push = (p, nrm, tan, offset, u, cross) => {
            positions.push(p.x + nrm.x * offset, p.y + nrm.y * offset, p.z + nrm.z * offset);
            uvs.push(u, (cross / this.inflate + 1) / 2);
            crosses.push(cross);
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

        // ── Caps, also inflated, always rounded so the margin wraps the end ───
        for (const end of [{ i: 0, t: 0, sign: -1 }, { i: n - 1, t: 1, sign: 1 }]) {
            const wL = def.widthLeftAt(end.t) * this.inflate;
            const wR = def.widthRightAt(end.t) * this.inflate;
            const center = samples[end.i];
            const nrm = normals[end.i];
            const tan = tangents[end.i];
            const base = positions.length / 3;

            positions.push(center.x, center.y, center.z);
            uvs.push(end.t, 0.5);
            crosses.push(0);
            tangentAttr.push(tan.x, tan.y, tan.z);

            for (let k = 0; k <= CAP_SEGMENTS; k++) {
                const f = k / CAP_SEGMENTS;
                const phi = f * Math.PI;
                const r = wL + (wR - wL) * f;
                const dx = nrm.x * Math.cos(phi) + tan.x * end.sign * Math.sin(phi);
                const dy = nrm.y * Math.cos(phi) + tan.y * end.sign * Math.sin(phi);
                const dz = nrm.z * Math.cos(phi) + tan.z * end.sign * Math.sin(phi);
                positions.push(center.x + dx * r, center.y + dy * r, center.z + dz * r);
                uvs.push(end.t, f);
                // Cap fragments read as the outer margin, so effects fade at the ends too.
                crosses.push(this.inflate * (1 - 2 * f));
                tangentAttr.push(tan.x, tan.y, tan.z);
            }
            for (let k = 0; k < CAP_SEGMENTS; k++) {
                indices.push(base, base + 1 + k, base + 2 + k);
            }
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setAttribute('aCross', new THREE.Float32BufferAttribute(crosses, 1));
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
    attribute vec3 aTangent;
    varying vec2 vUv;
    varying float vCross;
    varying vec3 vTangent;
    varying vec3 vWorld;

    void main() {
        vUv = uv;
        vCross = aCross;
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
    varying vec3 vTangent;
    varying vec3 vWorld;
    uniform vec2 uScreen;
    uniform vec2 uWorldToUv;
    uniform float uWidth;
    uniform float uInflate;
    uniform float uSeed;
    uniform float uLength;

    // Screen-space lookup for the background texture, matching the buffer's resolution.
    vec2 screenUv() { return gl_FragCoord.xy / uScreen; }

    // The stroke's own direction, expressed as a unit step in screen UV space.
    vec2 tangentUv() {
        vec2 d = vTangent.xy * uWorldToUv;
        float len = length(d);
        return len > 1e-8 ? d / len : vec2(1.0, 0.0);
    }

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
`;
