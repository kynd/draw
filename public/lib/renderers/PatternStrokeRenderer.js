import * as THREE from 'three';
import { StrokeRenderer, resampleSpine } from './StrokeRenderer.js';
import { seededRandom } from '../random.js';

/**
 * The mark rebuilt as many small elements filling the stroke's band, in one of
 * three looks.
 *
 *   dashes  short rounded strokes, about 20 pixels each, laid along the spine
 *           and stepped by about three quarters of their own length.
 *   dots    uneven discs, 10 to 15 pixels, wobbled like circles drawn by hand.
 *   strips  longer and wider strokes than the dashes, laid out more roughly,
 *           so they sometimes overlap.
 *   feather small strokes sprouting from the spine to both sides, swept from
 *           the local direction by `angle`; each left-right pair takes one
 *           color and the next pair the other, like a bird feather's bands.
 *   leaves  the sprouting strokes as tapered leaf shapes, sized randomly from
 *           well below the width to well past it, with more sway.
 *   fringe  the sprouting strokes thinner and denser, one color on one side
 *           of the spine and the other color on the other.
 *
 * Elements sit on rows across the width, each row walking the arc from the
 * start with its own seeded random sequence, so a growing stroke adds elements
 * at the tip without reshuffling the ones already placed. Row offsets scale
 * with the local width, so the fill follows the taper.
 */
export class PatternStrokeRenderer extends StrokeRenderer {
    /**
     * @param {object} opts
     * @param {'dashes'|'dots'|'strips'|'feather'|'leaves'|'fringe'} [opts.mode]
     * @param {string} [opts.color]
     * @param {string} [opts.colorB]  Second color the fringe alternates with.
     * @param {number} [opts.size]   Scale on the elements' built-in pixel sizes.
     * @param {number} [opts.angle]  The fringe's spread from the spine, in degrees.
     */
    constructor({ mode = 'dashes', color = '#46608a', colorB = null, size = 1,
        angle = 45, samplesPerUnit = 90 } = {}) {
        super();
        this.mode = mode;
        this.color = color;
        this.colorB = colorB;
        this.size = size;
        this.angle = angle;
        this.samplesPerUnit = samplesPerUnit;
    }

    // Element length, width, along-step (in element lengths), row spacing (in
    // element widths), rotation jitter, and across jitter (in element widths).
    _preset() {
        switch (this.mode) {
            case 'dots': return { len: 0.062, wid: 0.062, step: 1.15, row: 1.25, rot: 0, jitter: 0.5, vary: 0.42 };
            case 'strips': return { len: 0.21, wid: 0.05, step: 0.7, row: 1.5, rot: 0.3, jitter: 1.0, vary: 0.25 };
            case 'feather': return { len: 0, wid: 0.026, step: 2.4, row: 0, rot: 0.1, jitter: 0, vary: 0.15 };
            case 'leaves': return { len: 0, wid: 0.034, step: 3.4, row: 0, rot: 0.3, jitter: 0, vary: 0.22 };
            case 'fringe': return { len: 0, wid: 0.015, step: 1.5, row: 0, rot: 0.12, jitter: 0, vary: 0.15 };
            default: return { len: 0.1, wid: 0.028, step: 0.75, row: 2.2, rot: 0.18, jitter: 1.6, vary: 0.18 };
        }
    }

    build(def) {
        const { samples, normals, tangents, length, ts } = resampleSpine(def, this.samplesPerUnit, 8, 2048);
        const preset = this._preset();
        const len = preset.len * this.size;
        const wid = preset.wid * this.size;
        const isDots = this.mode === 'dots';

        // Interpolators over the sampled spine, by arc position.
        const atArc = s => {
            const t = Math.min(Math.max(s / length, 0), 1);
            let i = 0;
            while (i < ts.length - 2 && ts[i + 1] < t) i++;
            const span = ts[i + 1] - ts[i] || 1;
            const f = (t - ts[i]) / span;
            return {
                t,
                center: samples[i].clone().lerp(samples[i + 1], f),
                normal: normals[i].clone().lerp(normals[i + 1], f).normalize(),
                tangent: tangents[i].clone().lerp(tangents[i + 1], f).normalize(),
            };
        };

        const wMax = Math.max(def.maxWidth(), 1e-6);
        const rowSpacing = wid * preset.row;
        const nRows = Math.max(1, Math.round((wMax * 2) / rowSpacing));

        const positions = [], locals = [], dims = [], seeds = [], colors = [], dirs = [], indices = [];
        const hsl = {};
        new THREE.Color(this.color).getHSL(hsl);
        const hslB = {};
        new THREE.Color(this.colorB ?? this.color).getHSL(hslB);
        const elColor = new THREE.Color();
        const dir = new THREE.Vector2();
        const perp = new THREE.Vector2();
        const pad = 0.006;
        let count = 0;

        const pushElement = (cx, cy, angle, hl, hw, seed, shade, base = hsl) => {
            dir.set(Math.cos(angle), Math.sin(angle));
            perp.set(-dir.y, dir.x);
            const el = hl + pad, ew = hw + pad;
            const first = count * 4;
            for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
                positions.push(cx + dir.x * el * sx + perp.x * ew * sy,
                    cy + dir.y * el * sx + perp.y * ew * sy, 0);
                locals.push(el * sx, ew * sy);
                dims.push(hl, hw);
                seeds.push(seed);
                dirs.push(dir.x, dir.y);
                elColor.setHSL(base.h, base.s, Math.min(0.92, Math.max(0.05, base.l * shade)));
                colors.push(elColor.r, elColor.g, elColor.b);
            }
            indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
            count++;
        };

        if (this.mode === 'feather' || this.mode === 'leaves' || this.mode === 'fringe') {
            // Small strokes sprouting from the spine to both sides, swept from
            // the local direction by `angle`. Their length follows the local
            // width, so the sprouts fill the band the stroke was given. One
            // walk, one seeded sequence, so a growing stroke only adds
            // elements at the tip. The modes differ in shape and in how the
            // two colors divide: feather alternates by left-right pair, fringe
            // by side, leaves in a checker.
            const isLeaves = this.mode === 'leaves';
            const rand = seededRandom((def.seed ?? 1) * 13.7 + 47.3);
            const rad = this.angle * Math.PI / 180;
            const spacing = wid * preset.step;
            let s = rand() * spacing;
            let k = 0;
            while (s <= length) {
                const { t, center, normal, tangent } = atArc(s);
                const w = Math.max(def.widthLeftAt(t), 0.01);
                for (const side of [1, -1]) {
                    const dx = tangent.x * Math.cos(rad) + normal.x * side * Math.sin(rad);
                    const dy = tangent.y * Math.cos(rad) + normal.y * side * Math.sin(rad);
                    const angleEl = Math.atan2(dy, dx) + (rand() - 0.5) * 2 * preset.rot;
                    // Leaves range from well below the width to well past it;
                    // the others follow it closely.
                    const hl = isLeaves
                        ? w * (0.35 + rand() * 1.15)
                        : (w * 0.7) * (0.85 + rand() * 0.3);
                    const hw = isLeaves
                        ? Math.max(hl * 0.26 * (0.8 + rand() * 0.4), 0.008)
                        : (wid / 2) * (0.85 + rand() * 0.3);
                    const out = hl * 0.85;
                    const useB = this.mode === 'feather' ? k % 2 === 1
                        : this.mode === 'fringe' ? side < 0
                        : (k + (side < 0 ? 1 : 0)) % 2 === 1;
                    const shade = 1 - preset.vary / 2 + rand() * preset.vary;
                    pushElement(center.x + Math.cos(angleEl) * out, center.y + Math.sin(angleEl) * out,
                        angleEl, hl, hw, rand() * 100,
                        this.colorB ? shade : (useB ? shade * 0.6 : shade),
                        useB ? hslB : hsl);
                }
                s += spacing * (0.8 + 0.4 * rand());
                k++;
            }
            return this._finish(def, positions, locals, dims, seeds, dirs, colors, indices, samples, length);
        }

        // Each row has its own random sequence keyed by the stroke's seed and
        // the row index, so growing the stroke never reshuffles placed rows.
        for (let r = 0; r < nRows; r++) {
            const rand = seededRandom((def.seed ?? 1) * 13.7 + r * 31.7 + (isDots ? 5.3 : 0));
            const f = nRows === 1 ? 0 : (r + 0.5) / nRows * 2 - 1;
            let s = rand() * len * preset.step;
            while (s <= length) {
                const { t, center, normal, tangent } = atArc(s);
                const w = Math.max(def.widthLeftAt(t), 0);
                const sizeJitter = isDots ? 0.8 + rand() * 0.5 : 0.85 + rand() * 0.3;
                const hl = (len / 2) * sizeJitter;
                const hw = (wid / 2) * sizeJitter;
                const reach = Math.max(w - hw, 0);
                const across = f * reach + (rand() - 0.5) * wid * preset.jitter;
                const angle = Math.atan2(tangent.y, tangent.x) + (rand() - 0.5) * 2 * preset.rot;
                const shade = 1 - preset.vary / 2 + rand() * preset.vary;
                const seed = rand() * 100;
                if (w > hw * 0.5) {
                    pushElement(center.x + normal.x * across, center.y + normal.y * across,
                        isDots ? 0 : angle, hl, hw, seed, shade);
                }
                s += len * preset.step * (0.75 + 0.5 * rand());
            }
        }

        return this._finish(def, positions, locals, dims, seeds, dirs, colors, indices, samples, length);
    }

    _finish(def, positions, locals, dims, seeds, dirs, colors, indices, samples, length) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('aLocal', new THREE.Float32BufferAttribute(locals, 2));
        geometry.setAttribute('aDims', new THREE.Float32BufferAttribute(dims, 2));
        geometry.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1));
        geometry.setAttribute('aDir', new THREE.Float32BufferAttribute(dirs, 2));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.setIndex(indices);
        geometry.computeBoundingSphere();

        const mesh = new THREE.Mesh(geometry, this._material());
        mesh.userData.samples = samples;
        mesh.userData.stats = {
            sampleCount: samples.length,
            vertexCount: positions.length / 3,
            triangleCount: indices.length / 3,
            length,
        };
        return mesh;
    }

    _material() {
        return new THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            uniforms: { uMode: { value: this.mode === 'dots' ? 1 : this.mode === 'leaves' ? 2 : 0 } },
            vertexShader: /* glsl */`
                attribute vec2 aLocal;
                attribute vec2 aDims;
                attribute float aSeed;
                varying vec2 vLocal;
                varying vec2 vDims;
                varying float vSeed;
                varying vec3 vColor;
                void main() {
                    vLocal = aLocal;
                    vDims = aDims;
                    vSeed = aSeed;
                    vColor = color;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: /* glsl */`
                uniform int uMode;
                varying vec2 vLocal;
                varying vec2 vDims;
                varying float vSeed;
                varying vec3 vColor;
                void main() {
                    float d;
                    if (uMode == 1) {
                        // A disc wobbled by seeded harmonics of the angle, so
                        // it reads as a circle drawn by hand.
                        float ang = atan(vLocal.y, vLocal.x);
                        float wob = 1.0 + 0.10 * sin(ang * 3.0 + vSeed * 7.1)
                                        + 0.07 * sin(ang * 5.0 + vSeed * 13.7);
                        d = length(vLocal) - vDims.x * wob;
                    } else if (uMode == 2) {
                        // A leaf: the width tapers to points at both ends, and
                        // a seeded bow curves the blade.
                        float u = clamp(vLocal.x / max(vDims.x, 1e-5), -1.0, 1.0);
                        float bow = sin(u * 3.14159 + vSeed) * vDims.y * 0.3;
                        float prof = pow(max(1.0 - u * u, 0.0), 0.65);
                        d = abs(vLocal.y - bow) - vDims.y * prof;
                    } else {
                        // A capsule, bowed by a seeded sine along its length so
                        // the edge is not ruler-straight.
                        vec2 p = vec2(max(abs(vLocal.x) - max(vDims.x - vDims.y, 0.0), 0.0), vLocal.y);
                        d = length(p) - vDims.y;
                        d += sin(vLocal.x / max(vDims.x, 1e-5) * 3.14159 + vSeed * 9.3) * vDims.y * 0.12;
                    }
                    float alpha = 1.0 - smoothstep(-0.0025, 0.0025, d);
                    if (alpha <= 0.01) discard;
                    gl_FragColor = vec4(vColor, alpha);
                }
            `,
            vertexColors: true,
        });
    }
}
