import * as THREE from 'three';
import { StrokeRenderer, resampleSpine, capExtent } from './StrokeRenderer.js';
import { seededRandom } from '../random.js';

/**
 * The mark rebuilt as square cells on a fixed grid.
 *
 * Cells are stamped from the spine outward rather than tested from a grid inward. A
 * grid over the bounding box would test far more empty cells than filled ones for a
 * thin diagonal mark, and the stamp only visits cells the stroke can actually reach.
 * A Set keyed by grid coordinate keeps overlapping stamps from emitting a cell twice.
 */
export class PixelStrokeRenderer extends StrokeRenderer {
    /**
     * @param {object} opts
     * @param {number} [opts.cell]     Cell size in world units.
     * @param {string[]} [opts.colors] Palette to draw cell colors from.
     * @param {number} [opts.jitter]   Chance a reachable cell is dropped, for a ragged edge.
     */
    constructor({ cell = 0.045, colors = ['#111111'], jitter = 0.12, cap = 'rounded', samplesPerUnit = 160 } = {}) {
        super();
        this.cap = cap;
        this.cell = cell;
        this.colors = colors;
        this.jitter = jitter;
        this.samplesPerUnit = samplesPerUnit;
    }

    build(def) {
        const { samples, normals, tangents, length, ts } = resampleSpine(def, this.samplesPerUnit, 8, 4096);
        const n = samples.length;
        const cell = this.cell;
        const rand = seededRandom(def.seed);

        const filled = new Map();
        for (let i = 0; i < n; i++) {
            const t = ts[i];
            const wL = def.widthLeftAt(t);
            const wR = def.widthRightAt(t);
            const w = Math.max(wL, wR);
            const p = samples[i];
            const nrm = normals[i];

            const reach = Math.ceil(w / cell) + 1;
            const cx = Math.round(p.x / cell);
            const cy = Math.round(p.y / cell);
            for (let gx = cx - reach; gx <= cx + reach; gx++) {
                for (let gy = cy - reach; gy <= cy + reach; gy++) {
                    const key = `${gx},${gy}`;
                    if (filled.has(key)) continue;
                    const wx = gx * cell, wy = gy * cell;
                    // Signed distance across the spine, so left and right widths differ.
                    const dx = wx - p.x, dy = wy - p.y;
                    const side = dx * nrm.x + dy * nrm.y;
                    const limit = side >= 0 ? wL : wR;

                    // At the two end samples the cap decides how far past the end a
                    // cell may sit. Interior samples cannot reach past the mark, so
                    // they need no test.
                    if (i === 0 || i === n - 1) {
                        const tan = tangents[i];
                        const along = (dx * tan.x + dy * tan.y) * (i === 0 ? -1 : 1);
                        if (along > 0) {
                            const reach = capExtent(this.cap, side / limit, def.seed) * limit;
                            if (along > reach) continue;
                        }
                    }
                    if (dx * dx + dy * dy <= limit * limit + 1e-9 || (i === 0 || i === n - 1)) {
                        const lateral = Math.abs(side);
                        if (lateral <= limit) filled.set(key, { gx, gy, z: p.z });
                    }
                }
            }
        }

        const positions = [];
        const colors = [];
        const indices = [];
        const color = new THREE.Color();
        let quads = 0;

        for (const { gx, gy, z } of filled.values()) {
            if (rand() < this.jitter) continue;
            const x0 = gx * cell - cell / 2, y0 = gy * cell - cell / 2;
            const x1 = x0 + cell, y1 = y0 + cell;
            const base = quads * 4;

            positions.push(x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z);
            color.set(this.colors[Math.floor(rand() * this.colors.length)]);
            for (let k = 0; k < 4; k++) colors.push(color.r, color.g, color.b);
            indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
            quads++;
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
