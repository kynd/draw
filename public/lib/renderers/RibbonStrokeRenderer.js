import * as THREE from 'three';
import { StrokeRenderer, resampleSpine } from './StrokeRenderer.js';

const MIN_SAMPLES = 8;
const MAX_SAMPLES = 2048;
const MIN_CAP_SEGMENTS = 6;
const MAX_CAP_SEGMENTS = 32;
const RAGGED_SEGMENTS = 20;

/**
 * A flat ribbon along the spine, closed at both ends by one of three caps.
 *
 * The body is the same in every case. Only the end differs, which is why this is one
 * renderer with a `cap` option rather than three renderers repeating the ribbon build.
 *
 *   square   the ribbon simply stops. No extra geometry.
 *   rounded  a triangle fan swept from the left offset, round through the outward
 *            tangent, to the right offset.
 *   ragged   a strip of spikes pushed out past the end at varying depths.
 */
export class RibbonStrokeRenderer extends StrokeRenderer {
    /**
     * @param {object}  opts
     * @param {'square'|'rounded'|'ragged'} [opts.cap]
     * @param {string}  [opts.color]           Fill color, or the start color of a gradient.
     * @param {string}  [opts.gradient]        Optional end color of a gradient.
     * @param {'along'|'across'} [opts.gradientAxis]  Whether the gradient runs along
     *                                         the spine (on u) or across it, left rail
     *                                         to right rail (on v).
     * @param {number}  [opts.opacity]
     * @param {number}  [opts.samplesPerUnit]  Spine samples per world unit of arc length.
     * @param {number}  [opts.capSegmentsPerUnit] Rounded-cap arc segments per unit of radius.
     */
    constructor({
        cap = 'rounded',
        color = '#1a1a1a',
        gradient = null,
        gradientAxis = 'along',
        opacity = 1,
        samplesPerUnit = 120,
        capSegmentsPerUnit = 260,
    } = {}) {
        super();
        this.cap = cap;
        this.color = color;
        this.gradient = gradient;
        this.gradientAxis = gradientAxis;
        this.opacity = opacity;
        this.samplesPerUnit = samplesPerUnit;
        this.capSegmentsPerUnit = capSegmentsPerUnit;
    }

    build(def) {
        const { samples, normals, tangents, length, ts } = resampleSpine(
            def, this.samplesPerUnit, MIN_SAMPLES, MAX_SAMPLES
        );
        const n = samples.length;

        const positions = [];
        const uvs = [];
        const indices = [];

        // ── Ribbon ───────────────────────────────────────────────────────────
        for (let i = 0; i < n; i++) {
            const t = ts[i];
            const p = samples[i];
            const nrm = normals[i];
            const wL = def.widthLeftAt(t);
            const wR = def.widthRightAt(t);

            positions.push(p.x + nrm.x * wL, p.y + nrm.y * wL, p.z + nrm.z * wL);
            uvs.push(t, 0);
            positions.push(p.x - nrm.x * wR, p.y - nrm.y * wR, p.z - nrm.z * wR);
            uvs.push(t, 1);
        }
        for (let i = 0; i < n - 1; i++) {
            const l0 = 2 * i, r0 = 2 * i + 1, l1 = 2 * i + 2, r1 = 2 * i + 3;
            indices.push(l0, r0, r1);
            indices.push(l0, r1, l1);
        }

        // ── Caps ─────────────────────────────────────────────────────────────
        const ends = [
            { i: 0,     t: 0, isStart: true,  seedScale: 1.0 },
            { i: n - 1, t: 1, isStart: false, seedScale: 3.7 },
        ];
        for (const end of ends) {
            const wL = def.widthLeftAt(end.t);
            const wR = def.widthRightAt(end.t);
            const args = [
                samples[end.i], normals[end.i], tangents[end.i],
                wL, wR, end.isStart, end.t, positions, uvs, indices,
            ];
            if (this.cap === 'rounded') this._appendRoundedCap(...args);
            else if (this.cap === 'ragged') this._appendRaggedCap(...args, def.seed * end.seedScale);
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setIndex(indices);
        geometry.computeBoundingSphere();

        // The gradient runs on the UV convention's parameters: u is arc length for
        // 'along', v is the left-to-right rail crossing for 'across'. Caps are
        // covered by the same coordinates, so they continue the gradient.
        if (this.gradient) {
            const from = new THREE.Color(this.color);
            const to = new THREE.Color(this.gradient);
            const axis = this.gradientAxis === 'across' ? 1 : 0;
            const colors = new Float32Array((positions.length / 3) * 3);
            const c = new THREE.Color();
            for (let i = 0; i < positions.length / 3; i++) {
                c.copy(from).lerp(to, uvs[i * 2 + axis]);
                colors[i * 3] = c.r;
                colors[i * 3 + 1] = c.g;
                colors[i * 3 + 2] = c.b;
            }
            geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        }

        const material = new THREE.MeshBasicMaterial({
            color: this.gradient ? new THREE.Color('#ffffff') : new THREE.Color(this.color),
            vertexColors: Boolean(this.gradient),
            side: THREE.DoubleSide,
            transparent: this.opacity < 1,
            opacity: this.opacity,
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

    /**
     * Triangle fan from the spine end, sweeping left → outward → right.
     *
     * The radius interpolates from the left width to the right width across the sweep,
     * so at f=0 the fan point sits exactly on the left ribbon edge and at f=1 on the
     * right. An asymmetric stroke therefore ends in a half-ellipse that meets both
     * edges, rather than a circle that overshoots the narrow side.
     */
    _appendRoundedCap(center, normal, tangent, wL, wR, isStart, u, positions, uvs, indices) {
        const radius = Math.max(wL, wR);
        if (radius <= 0) return;

        const segments = THREE.MathUtils.clamp(
            Math.round(radius * this.capSegmentsPerUnit), MIN_CAP_SEGMENTS, MAX_CAP_SEGMENTS
        );
        const base = positions.length / 3;

        positions.push(center.x, center.y, center.z);
        uvs.push(u, 0.5);

        const dir = new THREE.Vector3();
        for (let i = 0; i <= segments; i++) {
            const f = i / segments;
            const phi = f * Math.PI;
            const r = wL + (wR - wL) * f;

            dir.set(0, 0, 0)
                .addScaledVector(normal, Math.cos(phi))
                .addScaledVector(tangent, (isStart ? -1 : 1) * Math.sin(phi));

            positions.push(center.x + dir.x * r, center.y + dir.y * r, center.z + dir.z * r);
            uvs.push(u, f);
        }
        for (let i = 0; i < segments; i++) {
            indices.push(base, base + 1 + i, base + 2 + i);
        }
    }

    /**
     * Quad strip from the ribbon's end edge out to a torn outer edge.
     *
     * Spike depth comes from two sine samples rather than Math.random, so the same
     * seed always tears the same way and a redraw does not reshuffle the end.
     */
    _appendRaggedCap(center, normal, tangent, wL, wR, isStart, u, positions, uvs, indices, seed) {
        const reach = (wL + wR) / 2;
        if (reach <= 0) return;

        const segments = RAGGED_SEGMENTS;
        const base = positions.length / 3;
        const away = tangent.clone().multiplyScalar(isStart ? -1 : 1);

        // Inner row sits on the ribbon's end edge, so the cap seals against the body.
        for (let i = 0; i <= segments; i++) {
            const t = (i / segments) * 2 - 1;
            const lo = t >= 0 ? t * wL : t * wR;
            positions.push(center.x + normal.x * lo, center.y + normal.y * lo, center.z + normal.z * lo);
            uvs.push(u, (t + 1) / 2);
        }
        // Outer row is pushed past the end by a per-vertex depth.
        for (let i = 0; i <= segments; i++) {
            const t = (i / segments) * 2 - 1;
            const lo = t >= 0 ? t * wL : t * wR;
            const n1 = Math.abs(Math.sin(i * 127.1 + seed));
            const n2 = Math.abs(Math.sin(i * 311.7 + seed * 0.7));
            const depth = reach * Math.max(0.05, n1 * 0.65 + n2 * 0.35);
            positions.push(
                center.x + normal.x * lo + away.x * depth,
                center.y + normal.y * lo + away.y * depth,
                center.z + normal.z * lo + away.z * depth
            );
            uvs.push(u, (t + 1) / 2);
        }
        for (let i = 0; i < segments; i++) {
            indices.push(base + i, base + i + 1, base + segments + 1 + i);
            indices.push(base + i + 1, base + segments + 2 + i, base + segments + 1 + i);
        }
    }
}
