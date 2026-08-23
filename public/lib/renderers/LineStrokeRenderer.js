import * as THREE from 'three';
import { StrokeRenderer, resampleSpine } from './StrokeRenderer.js';
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
    constructor({ lanes = 7, duty = 0.45, colors = ['#111111'], samplesPerUnit = 120 } = {}) {
        super();
        this.lanes = lanes;
        this.duty = duty;
        this.colors = colors;
        this.samplesPerUnit = samplesPerUnit;
    }

    build(def) {
        const { samples, normals, length } = resampleSpine(def, this.samplesPerUnit, 8, 2048);
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
                const t = n === 1 ? 0 : i / (n - 1);
                const wL = def.widthLeftAt(t);
                const wR = def.widthRightAt(t);
                const p = samples[i], nrm = normals[i];

                // Map the lane bounds through the asymmetric widths.
                const at = f => (f >= 0 ? f * wL : f * wR);
                const outer = at(centre + halfLane);
                const inner = at(centre - halfLane);

                positions.push(p.x + nrm.x * outer, p.y + nrm.y * outer, p.z);
                positions.push(p.x + nrm.x * inner, p.y + nrm.y * inner, p.z);
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
