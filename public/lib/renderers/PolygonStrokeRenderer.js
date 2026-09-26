import * as THREE from 'three';
import { StrokeRenderer, capExtent } from './StrokeRenderer.js';

/**
 * The mark as a run of large flat triangles.
 *
 * Facet boundaries sit at fixed arc-length steps from the start, taken straight from the
 * stroke's control polygon rather than a resampled spine. The control points are only
 * ever appended as the stroke is drawn, so a settled facet keeps its vertices and its
 * color for the life of the stroke: the newest facet grows at the tip until it reaches
 * `facet` long, then it is fixed and the next one begins. Each triangle takes one flat
 * color keyed to its index, so the facets stay legible as facets and never recolor as
 * the stroke grows. Vertices are jittered across the width, keyed to the boundary index,
 * which is what stops the result reading as a low-resolution ribbon: the silhouette has
 * to break, not just the shading.
 */
export class PolygonStrokeRenderer extends StrokeRenderer {
    /**
     * @param {object} opts
     * @param {number} [opts.facet]    Facet length in world units.
     * @param {string[]} [opts.colors]
     * @param {number} [opts.jitter]   Lateral vertex displacement, as a fraction of width.
     */
    constructor({ facet = 0.3, colors = ['#111111'], jitter = 0.45, cap = 'rounded' } = {}) {
        super();
        this.cap = cap;
        this.facet = facet;
        this.colors = colors;
        this.jitter = jitter;
    }

    build(def) {
        const seed = def.seed ?? 1;
        const hash = (i, salt) => {
            const v = Math.sin(i * 12.9898 + seed * 78.233 + salt) * 43758.5453;
            return v - Math.floor(v);
        };

        // Arc table over the raw control polygon. Points are only appended while drawing,
        // so a settled point keeps its arc position and the facets before the tip never
        // move.
        const pts = def.points;
        const segs = [];
        let total = 0;
        for (let i = 0; i < pts.length - 1; i++) {
            const a = pts[i], b = pts[i + 1];
            const dx = b.x - a.x, dy = b.y - a.y;
            const len = Math.hypot(dx, dy);
            if (len < 1e-9) continue;
            segs.push({ ax: a.x, ay: a.y, ux: dx / len, uy: dy / len, len, s0: total });
            total += len;
        }
        total = Math.max(total, 1e-6);
        // Point and unit tangent at an arc position, from the segment it lands in. Both
        // depend only on that segment, which is fixed once it is behind the tip, so a
        // boundary's frame never leans on the moving tip (a chord to a neighbor would).
        const frameAt = s => {
            s = Math.min(Math.max(s, 0), total);
            if (segs.length === 0) return { x: pts[0].x, y: pts[0].y, tx: 1, ty: 0 };
            let i = 0;
            while (i < segs.length - 1 && segs[i].s0 + segs[i].len < s) i++;
            const sg = segs[i];
            const local = Math.min(s - sg.s0, sg.len);
            return { x: sg.ax + sg.ux * local, y: sg.ay + sg.uy * local, tx: sg.ux, ty: sg.uy };
        };

        // Boundary arc positions: fixed multiples of the facet length, then the tip.
        const F = Math.max(this.facet, 1e-3);
        const bs = [];
        for (let s = 0; s < total - 1e-6; s += F) bs.push(s);
        bs.push(total);
        const n = bs.length;

        const edge = [];
        for (let j = 0; j < n; j++) {
            const s = bs[j];
            const t = Math.min(Math.max(s / total, 0), 1);
            // Jitter keys on the boundary's grid index, so a boundary keeps its jitter as
            // the stroke grows. The moving tip keys on the index it will take once it
            // reaches the next grid line, so its jitter does not jump when it is fixed.
            const onGrid = Math.abs(s - Math.round(s / F) * F) < 1e-6;
            const bi = onGrid ? Math.round(s / F) : Math.ceil(total / F);
            const wL = Math.max(def.widthLeftAt(t) * (1 + (hash(bi, 1.3) - 0.5) * 2 * this.jitter), 0);
            const wR = Math.max(def.widthRightAt(t) * (1 + (hash(bi, 7.7) - 0.5) * 2 * this.jitter), 0);
            const fr = frameAt(s);
            const tx = fr.tx, ty = fr.ty;
            const nx = -ty, ny = tx;
            // Only the two ends push outward, by the cap profile at their own lateral
            // position, so a rounded cap comes out of the facets themselves.
            const endSign = j === 0 ? -1 : (j === n - 1 ? 1 : 0);
            const outL = endSign * capExtent(this.cap, 1, seed) * wL;
            const outR = endSign * capExtent(this.cap, -1, seed + 0.5) * wR;
            const p = fr;
            edge.push({
                l: new THREE.Vector3(p.x + nx * wL + tx * outL, p.y + ny * wL + ty * outL, 0),
                r: new THREE.Vector3(p.x - nx * wR + tx * outR, p.y - ny * wR + ty * outR, 0),
            });
        }

        const positions = [];
        const colors = [];
        const color = new THREE.Color();
        // One flat color per triangle, keyed to its index so it never recolors as the
        // stroke grows.
        const pushTriangle = (a, b, c, ci) => {
            color.set(this.colors[Math.floor(hash(ci, 5.1) * this.colors.length)]);
            for (const v of [a, b, c]) {
                positions.push(v.x, v.y, v.z);
                colors.push(color.r, color.g, color.b);
            }
        };
        for (let i = 0; i < n - 1; i++) {
            pushTriangle(edge[i].l, edge[i].r, edge[i + 1].r, 2 * i);
            pushTriangle(edge[i].l, edge[i + 1].r, edge[i + 1].l, 2 * i + 1);
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.computeBoundingSphere();

        const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
            vertexColors: true, side: THREE.DoubleSide,
        }));
        mesh.userData.samples = bs.map(s => { const f = frameAt(s); return new THREE.Vector3(f.x, f.y, 0); });
        mesh.userData.stats = {
            sampleCount: n,
            vertexCount: positions.length / 3,
            triangleCount: positions.length / 9,
            length: total,
        };
        return mesh;
    }
}
