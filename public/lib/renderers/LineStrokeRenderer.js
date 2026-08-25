import * as THREE from 'three';
import { StrokeRenderer, resampleSpine, capExtent } from './StrokeRenderer.js';
import { seededRandom } from '../random.js';

/**
 * The mark as a set of parallel lines with gaps between them.
 *
 * Each lane is its own thin ribbon offset across the width, so the lanes follow the
 * curve rather than being clipped out of a solid mark. Clipping would leave the gaps
 * running straight while the stroke turned.
 */
export class LineStrokeRenderer extends StrokeRenderer {
    /**
     * @param {object} opts
     * @param {number} [opts.lanes]     Number of lines across the width.
     * @param {number} [opts.duty]      Fraction of each lane's slot that is drawn.
     * @param {string[]} [opts.colors]
     * @param {number} [opts.samplesPerUnit]
     */
    constructor({ lanes = 7, duty = 0.45, colors = ['#111111'], cap = 'rounded', samplesPerUnit = 120 } = {}) {
        super();
        this.cap = cap;
        this.lanes = lanes;
        this.duty = duty;
        this.colors = colors;
        this.samplesPerUnit = samplesPerUnit;
    }

    build(def) {
        const { samples, normals, tangents, length, ts } = resampleSpine(def, this.samplesPerUnit, 8, 2048);
        const n = samples.length;
        const rand = seededRandom(def.seed);

        const positions = [];
        const colors = [];
        const indices = [];
        const color = new THREE.Color();
        let vertexCount = 0;

        for (let lane = 0; lane < this.lanes; lane++) {
            // Lane centre as a fraction of the width, from -1 at the right edge to +1 at
            // the left, with each lane occupying an equal slot.
            const centre = this.lanes === 1 ? 0 : (lane / (this.lanes - 1)) * 2 - 1;
            const slot = 2 / this.lanes;
            const halfLane = (slot * this.duty) / 2;

            color.set(this.colors[Math.floor(rand() * this.colors.length)]);
            const start = vertexCount;

            for (let i = 0; i < n; i++) {
                const t = ts[i];
                const wL = def.widthLeftAt(t);
                const wR = def.widthRightAt(t);
                const p = samples[i], nrm = normals[i], tan = tangents[i];

                // Map the lane bounds through the asymmetric widths.
                const at = f => (f >= 0 ? f * wL : f * wR);
                const outer = at(centre + halfLane);
                const inner = at(centre - halfLane);

                // The lane runs past the end by the cap profile at its own position, so
                // the outer lanes of a rounded cap stop short of the middle ones.
                const endSign = i === 0 ? -1 : (i === n - 1 ? 1 : 0);
                const reach = endSign * capExtent(this.cap, centre, def.seed + lane * 0.37)
                            * Math.max(wL, wR);

                positions.push(p.x + nrm.x * outer + tan.x * reach,
                               p.y + nrm.y * outer + tan.y * reach, p.z);
                positions.push(p.x + nrm.x * inner + tan.x * reach,
                               p.y + nrm.y * inner + tan.y * reach, p.z);
                for (let k = 0; k < 2; k++) colors.push(color.r, color.g, color.b);
                vertexCount += 2;
            }
            for (let i = 0; i < n - 1; i++) {
                const a = start + 2 * i;
                indices.push(a, a + 1, a + 3, a, a + 3, a + 2);
            }
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.setIndex(indices);
        geometry.computeBoundingSphere();

        const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
            vertexColors: true, side: THREE.DoubleSide,
        }));
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
