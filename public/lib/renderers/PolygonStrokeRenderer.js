import * as THREE from 'three';
import { StrokeRenderer, resampleSpine, capExtent } from './StrokeRenderer.js';
import { seededRandom } from '../random.js';

/**
 * The mark as a run of large flat triangles.
 *
 * The spine is resampled far more coarsely than a smooth ribbon would need, and each
 * triangle takes one flat color, so the facets stay legible as facets. Vertices are
 * jittered across the width, which is what stops the result reading as a low-resolution
 * ribbon: the silhouette has to break, not just the shading.
 */
export class PolygonStrokeRenderer extends StrokeRenderer {
    /**
     * @param {object} opts
     * @param {number} [opts.facets]   Segments along the whole stroke.
     * @param {string[]} [opts.colors]
     * @param {number} [opts.jitter]   Lateral vertex displacement, as a fraction of width.
     */
    constructor({ facets = 14, colors = ['#111111'], jitter = 0.45, cap = 'rounded' } = {}) {
        super();
        this.cap = cap;
        this.facets = facets;
        this.colors = colors;
        this.jitter = jitter;
    }

    build(def) {
        // Density chosen so the resample lands on roughly `facets` points, whatever the
        // stroke's length.
        const rough = { ...def, seed: def.seed };
        const { samples, normals, tangents, length } = resampleSpine(
            def, Math.max(1, this.facets / Math.max(def.polylineLength, 0.001)), this.facets + 1, 512
        );
        const n = samples.length;
        const rand = seededRandom(def.seed);

        const positions = [];
        const colors = [];
        const color = new THREE.Color();
        const pickColor = () => {
            color.set(this.colors[Math.floor(rand() * this.colors.length)]);
            return [color.r, color.g, color.b];
        };

        const edge = [];
        for (let i = 0; i < n; i++) {
            const t = n === 1 ? 0 : i / (n - 1);
            const wL = def.widthLeftAt(t) * (1 + (rand() - 0.5) * 2 * this.jitter);
            const wR = def.widthRightAt(t) * (1 + (rand() - 0.5) * 2 * this.jitter);
            const p = samples[i], nrm = normals[i], tan = tangents[i];
            // Only the two end rows are pushed outward, by the cap profile at their own
            // lateral position, so a rounded cap comes out of the facets themselves.
            const endSign = i === 0 ? -1 : (i === n - 1 ? 1 : 0);
            const outL = endSign * capExtent(this.cap, 1, def.seed) * wL;
            const outR = endSign * capExtent(this.cap, -1, def.seed + 0.5) * wR;
            edge.push({
                l: new THREE.Vector3(p.x + nrm.x * wL + tan.x * outL, p.y + nrm.y * wL + tan.y * outL, p.z),
                r: new THREE.Vector3(p.x - nrm.x * wR + tan.x * outR, p.y - nrm.y * wR + tan.y * outR, p.z),
            });
        }

        const pushTriangle = (a, b, c) => {
            const [r, g, bl] = pickColor();
            for (const v of [a, b, c]) {
                positions.push(v.x, v.y, v.z);
                colors.push(r, g, bl);
            }
        };

        for (let i = 0; i < n - 1; i++) {
            pushTriangle(edge[i].l, edge[i].r, edge[i + 1].r);
            pushTriangle(edge[i].l, edge[i + 1].r, edge[i + 1].l);
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.computeBoundingSphere();

        const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
            vertexColors: true, side: THREE.DoubleSide,
        }));
        mesh.userData.samples = samples;
        mesh.userData.stats = {
            sampleCount: n,
            vertexCount: positions.length / 3,
            triangleCount: positions.length / 9,
            length,
        };
        return mesh;
    }
}
