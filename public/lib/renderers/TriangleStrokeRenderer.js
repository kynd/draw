import * as THREE from 'three';
import { seededRandom } from '../random.js';
import { Stroke3DRenderer, STROKE3D_GLSL } from './Stroke3DRenderer.js';

/**
 * A chain of 3D triangles along the spine, flat-shaded, in one of three looks.
 *
 *   facets  each triangle takes a random size and tilt, and a random color that
 *           keeps the base color's hue while its lightness and chroma vary.
 *   grain   the faces carry a wood-like band pattern: a stripe field of world
 *           position warped by noise, between two colors.
 *   metal   each face reflects the current canvas, and the flat normals break
 *           the reflection per triangle.
 *
 * Placement, size, and tilt all derive from the stroke's seed, so the same seed
 * scatters the same triangles.
 */
export class TriangleStrokeRenderer extends Stroke3DRenderer {
    /** @param {'facets'|'grain'|'metal'} [opts.mode] */
    constructor({
        mode = 'facets',
        colorA = '#46608a',
        colorB = '#8a6a46',
        tint = '#d8d8e2',
        background = null,
        spacing = 0.55,    // triangle spacing, in half-widths
        bend = 0.4,
        ...rest
    } = {}) {
        super(rest);
        this.mode = mode;
        this.colorA = colorA;
        this.colorB = colorB;
        this.tint = tint;
        this.background = background;
        this.spacing = spacing;
        this.bend = bend;
    }

    build(def) {
        const { centers, normals, tangents, ts, length, phaseAt, seed } = this.frames(def);
        const rand = seededRandom(seed * 17.3);
        const B = new THREE.Vector3(0, 0, 1);

        const positions = [], normalsA = [], colors = [], along = [];
        const baseColor = new THREE.Color(this.colorA);
        const hsl = {};
        baseColor.getHSL(hsl);
        const faceColor = new THREE.Color();

        // Interpolators over the sampled spine, by arc position.
        const atArc = s => {
            const t = Math.min(Math.max(s / length, 0), 1);
            let i = 0;
            while (i < ts.length - 2 && ts[i + 1] < t) i++;
            const span = ts[i + 1] - ts[i] || 1;
            const f = (t - ts[i]) / span;
            return {
                t,
                center: centers[i].clone().lerp(centers[i + 1], f),
                normal: normals[i].clone().lerp(normals[i + 1], f).normalize(),
                tangent: tangents[i].clone().lerp(tangents[i + 1], f).normalize(),
            };
        };

        const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), fn = new THREE.Vector3();
        const p1 = new THREE.Vector3(), p2 = new THREE.Vector3(), q = new THREE.Vector3();
        const width = Math.max(def.widthLeftAt(0.5), 0.02);
        const step = Math.max(width * this.spacing, 0.03);
        let face = 0;
        for (let s = 0; s <= length; s += step, face++) {
            const { t, center, normal, tangent } = atArc(s);
            const size = Math.max(def.widthLeftAt(t), 0.01) * (0.7 + rand() * 0.9);
            // The face's plane: one axis perpendicular to the spine, rotated
            // around it by the phase (so the chain turns as the stroke grows),
            // the other mostly along the spine with a random tilt out of it.
            const rot = phaseAt(s) + rand() * Math.PI * 2;
            p1.copy(normal).multiplyScalar(Math.cos(rot)).setZ(Math.sin(rot));
            p2.copy(normal).multiplyScalar(-Math.sin(rot)).setZ(Math.cos(rot));
            const tilt = (rand() - 0.5) * 1.6;
            q.copy(tangent).multiplyScalar(Math.cos(tilt)).addScaledVector(p2, Math.sin(tilt));
            const verts = [];
            for (let j = 0; j < 3; j++) {
                const a = (j / 3 + (rand() - 0.5) * 0.12) * Math.PI * 2;
                verts.push(new THREE.Vector3(
                    center.x + (p1.x * Math.cos(a) + q.x * Math.sin(a)) * size,
                    center.y + (p1.y * Math.cos(a) + q.y * Math.sin(a)) * size,
                    center.z + (p1.z * Math.cos(a) + q.z * Math.sin(a)) * size
                ));
            }
            e1.copy(verts[1]).sub(verts[0]);
            e2.copy(verts[2]).sub(verts[0]);
            fn.copy(e1).cross(e2).normalize();
            if (fn.z < 0) fn.negate();

            // Facets vary lightness and chroma but keep the hue.
            faceColor.setHSL(hsl.h, Math.min(1, hsl.s * (0.6 + rand() * 0.8)),
                Math.min(0.9, Math.max(0.12, hsl.l * (0.55 + rand() * 1.1))));
            for (const v of verts) {
                positions.push(v.x, v.y, v.z);
                normalsA.push(fn.x, fn.y, fn.z);
                colors.push(faceColor.r, faceColor.g, faceColor.b);
                along.push(t);
            }
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normalsA, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.setAttribute('aAlong', new THREE.Float32BufferAttribute(along, 1));
        geometry.computeBoundingSphere();

        const mesh = new THREE.Mesh(geometry, this._material(seed));
        mesh.userData.samples = centers;
        mesh.userData.stats = {
            sampleCount: centers.length,
            vertexCount: positions.length / 3,
            triangleCount: positions.length / 9,
            length,
        };
        return mesh;
    }

    _material(seed) {
        const modes = { facets: 0, grain: 1, metal: 2 };
        return new THREE.ShaderMaterial({
            side: THREE.DoubleSide,
            vertexColors: true,
            uniforms: {
                uMode: { value: modes[this.mode] ?? 0 },
                uColorA: { value: new THREE.Color(this.colorA) },
                uColorB: { value: new THREE.Color(this.colorB) },
                uTint: { value: new THREE.Color(this.tint) },
                uBg: { value: this.background },
                uBend: { value: this.bend },
                uSeed: { value: seed },
                uScreen: { value: new THREE.Vector2(1, 1) },
            },
            vertexShader: /* glsl */`
                attribute float aAlong;
                varying vec3 vNormal;
                varying vec3 vColor;
                varying vec3 vWorld;
                varying float vAlong;
                void main() {
                    vNormal = normal;
                    vColor = color;
                    vWorld = position;
                    vAlong = aAlong;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: /* glsl */`
                uniform int uMode;
                uniform vec3 uColorA;
                uniform vec3 uColorB;
                uniform vec3 uTint;
                uniform sampler2D uBg;
                uniform float uBend;
                uniform float uSeed;
                varying vec3 vNormal;
                varying vec3 vColor;
                varying vec3 vWorld;
                varying float vAlong;
                ${STROKE3D_GLSL}
                float hash21(vec2 p) {
                    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
                }
                float noise2(vec2 p) {
                    vec2 i = floor(p), f = fract(p);
                    vec2 u = f * f * (3.0 - 2.0 * f);
                    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
                               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
                }
                void main() {
                    vec3 n = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
                    float diff = diffuseAt(n);
                    vec3 color;
                    if (uMode == 0) {
                        color = vColor * (0.4 + 0.7 * diff) + vec3(specularAt(n, 30.0)) * 0.25;
                    } else if (uMode == 1) {
                        // Grain: a stripe field warped by noise, like cut wood.
                        float warp = noise2(vWorld.xy * 3.0 + uSeed);
                        float band = 0.5 + 0.5 * sin(vWorld.x * 26.0 + vWorld.y * 9.0 + warp * 10.0 + uSeed * 3.0);
                        band = pow(band, 1.6);
                        color = mix(uColorA, uColorB, band) * (0.4 + 0.7 * diff)
                              + vec3(specularAt(n, 20.0)) * 0.15;
                    } else {
                        vec3 r = reflect(vec3(0.0, 0.0, -1.0), n);
                        vec2 suv = clamp(screenUv() + r.xy * uBend, 0.001, 0.999);
                        vec3 env = texture2D(uBg, suv).rgb;
                        color = env * uTint * (0.45 + 0.65 * diff)
                              + vec3(specularAt(n, 80.0)) * 1.0;
                    }
                    gl_FragColor = vec4(color, 1.0);
                }
            `,
        });
    }
}
