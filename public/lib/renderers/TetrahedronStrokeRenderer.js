import * as THREE from 'three';
import { seededRandom } from '../random.js';
import { Stroke3DRenderer, STROKE3D_GLSL, SHOW_NORMALS_GLSL } from './Stroke3DRenderer.js';

// A tetrahedron over alternating cube corners; each face's outward side is
// fixed by the orientation check at build time.
const CORNERS = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
const FACES = [[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]];

/**
 * A chain of 3D tetrahedrons along the spine, flat-shaded, in one of three
 * looks.
 *
 *   facets  every face takes a random color that keeps the base color's hue
 *           while its lightness and chroma vary.
 *   colors  every face takes one flat random color from the `colors` list.
 *   metal   every face reflects the current canvas, and the flat normals
 *           break the reflection per face.
 *
 * Placement, size, and orientation all derive from the stroke's seed, so the
 * same seed scatters the same tetrahedrons. Sizes range from far below the
 * stroke width to well past it, and the step between neighbors is their two
 * circumradii plus `spacing` of their sum, so they cannot touch.
 */
export class TetrahedronStrokeRenderer extends Stroke3DRenderer {
    /** @param {'facets'|'colors'|'metal'} [opts.mode] */
    constructor({
        mode = 'facets',
        colorA = '#46608a',
        colors = ['#c22a4a', '#f0e6da', '#2a7a5a', '#f0c040'],
        tint = '#d8d8e2',
        background = null,
        spacing = 0.15,    // the gap between neighbors, as a fraction of their summed circumradii
        bend = 0.4,
        ...rest
    } = {}) {
        super(rest);
        this.mode = mode;
        this.colorA = colorA;
        this.colors = colors;
        this.tint = tint;
        this.background = background;
        this.spacing = spacing;
        this.bend = bend;
    }

    build(def) {
        const { centers, normals, tangents, ts, length, phaseAt, seed } = this.frames(def);
        const rand = seededRandom(seed * 17.3);

        const positions = [], normalsA = [], colors = [], along = [];
        const baseColor = new THREE.Color(this.colorA);
        const hsl = {};
        baseColor.getHSL(hsl);
        const faceColor = new THREE.Color();
        const palette = this.colors.map(c => new THREE.Color(c));

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

        const bx = new THREE.Vector3(), by = new THREE.Vector3(), bz = new THREE.Vector3();
        const p2 = new THREE.Vector3();
        const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), fn = new THREE.Vector3();
        const tetCenter = new THREE.Vector3(), mid = new THREE.Vector3();
        let s = 0, prevRadius = 0, tet = 0;
        while (s <= length) {
            // Sizes range from far below the width to well past it, skewed
            // small.
            const roll = rand();
            const size = Math.max(def.widthLeftAt(Math.min(s / length, 1)), 0.01)
                * (0.3 + roll * roll * 2.6);
            if (tet > 0) {
                // The step keeps the circumspheres apart: the two radii plus
                // the spacing gap.
                s += (prevRadius + size) * (1 + this.spacing);
                if (s > length) break;
            }
            const { t, center, normal, tangent } = atArc(s);
            // The frame: one axis perpendicular to the spine, rotated around
            // it by the phase (so the chain turns as the stroke grows), one
            // mostly along the spine with a random tilt out of it, and their
            // cross product.
            const rot = phaseAt(s) + rand() * Math.PI * 2;
            bx.copy(normal).multiplyScalar(Math.cos(rot)).setZ(Math.sin(rot));
            p2.copy(normal).multiplyScalar(-Math.sin(rot)).setZ(Math.cos(rot));
            const tilt = (rand() - 0.5) * 1.6;
            by.copy(tangent).multiplyScalar(Math.cos(tilt)).addScaledVector(p2, Math.sin(tilt));
            bz.copy(bx).cross(by).normalize();
            by.copy(bz).cross(bx).normalize();
            // Corners jitter inward only, so the circumradius never exceeds
            // `size` and the spacing guarantee holds.
            const verts = CORNERS.map(([x, y, z]) => {
                const r = size * (0.75 + rand() * 0.25) / Math.sqrt(3);
                return new THREE.Vector3(
                    center.x + (bx.x * x + by.x * y + bz.x * z) * r,
                    center.y + (bx.y * x + by.y * y + bz.y * z) * r,
                    center.z + (bx.z * x + by.z * y + bz.z * z) * r
                );
            });
            tetCenter.set(0, 0, 0);
            verts.forEach(v => tetCenter.add(v));
            tetCenter.multiplyScalar(1 / 4);

            for (const [a, b, c] of FACES) {
                e1.copy(verts[b]).sub(verts[a]);
                e2.copy(verts[c]).sub(verts[a]);
                fn.copy(e1).cross(e2).normalize();
                mid.copy(verts[a]).add(verts[b]).add(verts[c]).multiplyScalar(1 / 3).sub(tetCenter);
                if (fn.dot(mid) < 0) fn.negate();
                // Two rolls per face whatever the mode, so the placement
                // sequence stays identical across the looks.
                const r1 = rand(), r2 = rand();
                if (this.mode === 'colors') {
                    faceColor.copy(palette[Math.floor(r1 * palette.length) % palette.length]);
                } else {
                    // Facets vary lightness and chroma but keep the hue.
                    faceColor.setHSL(hsl.h, Math.min(1, hsl.s * (0.6 + r1 * 0.8)),
                        Math.min(0.9, Math.max(0.12, hsl.l * (0.55 + r2 * 1.1))));
                }
                for (const j of [a, b, c]) {
                    positions.push(verts[j].x, verts[j].y, verts[j].z);
                    normalsA.push(fn.x, fn.y, fn.z);
                    colors.push(faceColor.r, faceColor.g, faceColor.b);
                    along.push(t);
                }
            }
            prevRadius = size;
            tet++;
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normalsA, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.setAttribute('aAlong', new THREE.Float32BufferAttribute(along, 1));
        geometry.computeBoundingSphere();

        const mesh = new THREE.Mesh(geometry, this._material());
        mesh.userData.samples = centers;
        mesh.userData.stats = {
            sampleCount: centers.length,
            vertexCount: positions.length / 3,
            triangleCount: positions.length / 9,
            length,
        };
        return mesh;
    }

    _material() {
        const modes = { facets: 0, colors: 1, metal: 2 };
        return new THREE.ShaderMaterial({
            side: THREE.DoubleSide,
            vertexColors: true,
            uniforms: {
                uMode: { value: modes[this.mode] ?? 0 },
                uTint: { value: new THREE.Color(this.tint) },
                uBg: { value: this.background },
                uBend: { value: this.bend },
                uShowNormal: { value: this.showNormals ? 1 : 0 },
                uScreen: { value: new THREE.Vector2(1, 1) },
            },
            vertexShader: /* glsl */`
                attribute float aAlong;
                varying vec3 vNormal;
                varying vec3 vColor;
                varying float vAlong;
                void main() {
                    vNormal = normal;
                    vColor = color;
                    vAlong = aAlong;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: /* glsl */`
                uniform int uMode;
                uniform vec3 uTint;
                uniform sampler2D uBg;
                uniform float uBend;
                varying vec3 vNormal;
                varying vec3 vColor;
                varying float vAlong;
                uniform int uShowNormal;
                ${STROKE3D_GLSL}
                ${SHOW_NORMALS_GLSL}
                void main() {
                    if (uShowNormal == 1) { gl_FragColor = normalDebug(vNormal); return; }
                    vec3 n = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
                    float diff = diffuseAt(n);
                    vec3 color;
                    if (uMode == 0) {
                        color = vColor * (0.25 + 0.9 * diff) + vec3(specularAt(n, 30.0)) * 0.4;
                    } else if (uMode == 1) {
                        // Flat palette colors, one per face.
                        color = vColor * (0.3 + 0.85 * diff) + vec3(specularAt(n, 30.0)) * 0.25;
                    } else {
                        // The canvas reflected a little blurred, so a sharp feature
                        // underneath does not read as pixels within each facet.
                        vec3 r = reflect(vec3(0.0, 0.0, -1.0), n);
                        vec2 suv = screenUv() + r.xy * uBend;
                        vec2 bp = 3.5 / uScreen;
                        vec3 env = (texture2D(uBg, clamp(suv, 0.001, 0.999)).rgb * 2.0
                            + texture2D(uBg, clamp(suv + bp, 0.001, 0.999)).rgb
                            + texture2D(uBg, clamp(suv - bp, 0.001, 0.999)).rgb
                            + texture2D(uBg, clamp(suv + vec2(bp.x, -bp.y), 0.001, 0.999)).rgb
                            + texture2D(uBg, clamp(suv + vec2(-bp.x, bp.y), 0.001, 0.999)).rgb) / 6.0;
                        color = env * uTint * (0.3 + 0.85 * diff)
                              + vec3(specularAt(n, 80.0)) * 1.0 + vec3(specularAt(n, 12.0)) * 0.3;
                    }
                    gl_FragColor = vec4(color, 1.0);
                }
            `,
        });
    }
}
