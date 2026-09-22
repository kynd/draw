import * as THREE from 'three';
import { seededRandom } from '../random.js';
import { Stroke3DRenderer, STROKE3D_GLSL, SHOW_NORMALS_GLSL } from './Stroke3DRenderer.js';

/**
 * The unit shapes, each as vertices (circumradius 1) and triangle faces. A face is a
 * list of vertex indices; the outward normal is fixed at build time from the winding.
 */
const R3 = 1 / Math.sqrt(3);
const SHAPES = {
    // Tetrahedron over alternating cube corners.
    tetra: {
        verts: [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].map(c => c.map(x => x * R3)),
        faces: [[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]],
    },
    // Cube: eight corners, six square faces as two triangles each.
    box: {
        verts: [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
                [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]].map(c => c.map(x => x * R3)),
        faces: [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4],
                [2, 3, 7], [2, 7, 6], [1, 2, 6], [1, 6, 5], [0, 4, 7], [0, 7, 3]],
    },
    // Cone: an apex, a base ring, and a base fan.
    cone: (() => {
        const N = 12, verts = [[0, 0, 1]], faces = [];
        for (let i = 0; i < N; i++) {
            const a = (i / N) * Math.PI * 2;
            verts.push([Math.cos(a) * 0.95, Math.sin(a) * 0.95, -0.55]);
        }
        const base = verts.length; verts.push([0, 0, -0.55]);
        for (let i = 0; i < N; i++) {
            const a = 1 + i, b = 1 + (i + 1) % N;
            faces.push([0, a, b]);         // side
            faces.push([base, b, a]);      // base
        }
        return { verts, faces };
    })(),
};

/**
 * A chain of flat-shaded 3D solids scattered along the spine, in one of three shapes:
 * tetrahedra, boxes, or cones. Every face takes one flat color from the `colors`
 * palette, so a solid reads as a cluster of colored facets.
 *
 * Placement, size, side, and orientation all derive from the stroke's seed, so the
 * same seed scatters the same solids. Sizes range from below the stroke width to past
 * it, each solid is thrown to one side of the spine, and the step between neighbors is
 * their two circumradii plus `spacing` of the sum, so tighter spacing packs more of
 * them. The rotation keys on distance from the tip, so the solids turn as the stroke
 * grows.
 */
export class SolidStrokeRenderer extends Stroke3DRenderer {
    /**
     * @param {object} opts
     * @param {'tetra'|'box'|'cone'} [opts.shape]
     * @param {string[]} [opts.colors]  Palette the faces draw from.
     * @param {number} [opts.spacing]   Gap between neighbors, as a fraction of their
     *                                  summed circumradii.
     * @param {number} [opts.spread]    How far solids are thrown to the side, in
     *                                  half-widths.
     */
    constructor({
        shape = 'tetra',
        colors = ['#c22a4a', '#f0e6da', '#2a7a5a', '#f0c040'],
        spacing = 0.05,
        spread = 1.6,
        ...rest
    } = {}) {
        // The solids turn as the stroke grows: the rotation keys on the tip.
        super({ spinFromTip: true, ...rest });
        this.shape = shape;
        this.colors = colors;
        this.spacing = spacing;
        this.spread = spread;
    }

    build(def) {
        const { centers, normals, tangents, ts, length, phaseAt, seed } = this.frames(def);
        const rand = seededRandom(seed * 17.3);
        const shape = SHAPES[this.shape] ?? SHAPES.tetra;

        const positions = [], normalsA = [], colors = [], along = [];
        const palette = this.colors.map(c => new THREE.Color(c));
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

        const bx = new THREE.Vector3(), by = new THREE.Vector3(), bz = new THREE.Vector3();
        const p2 = new THREE.Vector3();
        const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), fn = new THREE.Vector3();
        const solidCenter = new THREE.Vector3(), mid = new THREE.Vector3(), place = new THREE.Vector3();
        let s = 0, prevRadius = 0, k = 0;
        while (s <= length) {
            // Sizes range from below the width to well past it, skewed small.
            const roll = rand();
            const w = Math.max(def.widthLeftAt(Math.min(s / length, 1)), 0.01);
            const size = w * (0.3 + roll * roll * 2.6);
            if (k > 0) {
                // The step keeps the circumspheres apart: the two radii plus the gap.
                s += (prevRadius + size) * (1 + this.spacing);
                if (s > length) break;
            }
            const { t, center, normal, tangent } = atArc(s);
            // Thrown to one side of the spine, seeded, so the chain fills a band
            // rather than a single line.
            const side = (rand() * 2 - 1) * w * this.spread;
            place.copy(center).addScaledVector(normal, side);
            // The frame: one axis perpendicular to the spine, rotated around it by
            // the phase (so the chain turns as the stroke grows), one mostly along
            // the spine with a random tilt out of it, and their cross product.
            const rot = phaseAt(s) + rand() * Math.PI * 2;
            bx.copy(normal).multiplyScalar(Math.cos(rot)).setZ(Math.sin(rot));
            p2.copy(normal).multiplyScalar(-Math.sin(rot)).setZ(Math.cos(rot));
            const tilt = (rand() - 0.5) * 1.6;
            by.copy(tangent).multiplyScalar(Math.cos(tilt)).addScaledVector(p2, Math.sin(tilt));
            bz.copy(bx).cross(by).normalize();
            by.copy(bz).cross(bx).normalize();

            const jitter = size * (0.85 + rand() * 0.15);
            const verts = shape.verts.map(([x, y, z]) => new THREE.Vector3(
                place.x + (bx.x * x + by.x * y + bz.x * z) * jitter,
                place.y + (bx.y * x + by.y * y + bz.y * z) * jitter,
                place.z + (bx.z * x + by.z * y + bz.z * z) * jitter
            ));
            solidCenter.set(0, 0, 0);
            verts.forEach(v => solidCenter.add(v));
            solidCenter.multiplyScalar(1 / verts.length);

            for (const face of shape.faces) {
                const [a, b, c] = face;
                e1.copy(verts[b]).sub(verts[a]);
                e2.copy(verts[c]).sub(verts[a]);
                fn.copy(e1).cross(e2).normalize();
                mid.copy(verts[a]).add(verts[b]).add(verts[c]).multiplyScalar(1 / 3).sub(solidCenter);
                if (fn.dot(mid) < 0) fn.negate();
                faceColor.copy(palette[Math.floor(rand() * palette.length) % palette.length]);
                for (const j of face) {
                    positions.push(verts[j].x, verts[j].y, verts[j].z);
                    normalsA.push(fn.x, fn.y, fn.z);
                    colors.push(faceColor.r, faceColor.g, faceColor.b);
                    along.push(t);
                }
            }
            prevRadius = size;
            k++;
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
        return new THREE.ShaderMaterial({
            side: THREE.DoubleSide,
            vertexColors: true,
            uniforms: {
                uShowNormal: { value: this.showNormals ? 1 : 0 },
                uScreen: { value: new THREE.Vector2(1, 1) },
            },
            vertexShader: /* glsl */`
                attribute float aAlong;
                varying vec3 vNormal;
                varying vec3 vColor;
                void main() {
                    vNormal = normal;
                    vColor = color;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: /* glsl */`
                varying vec3 vNormal;
                varying vec3 vColor;
                uniform int uShowNormal;
                ${STROKE3D_GLSL}
                ${SHOW_NORMALS_GLSL}
                void main() {
                    if (uShowNormal == 1) { gl_FragColor = normalDebug(vNormal); return; }
                    vec3 n = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
                    float diff = diffuseAt(n);
                    // Flat palette color per face, plain lit, with a small highlight.
                    vec3 color = vColor * (0.3 + 0.85 * diff) + vec3(specularAt(n, 30.0)) * 0.25;
                    gl_FragColor = vec4(color, 1.0);
                }
            `,
        });
    }
}
