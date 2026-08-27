import * as THREE from 'three';
import { seededRandom } from './random.js';

/**
 * Generators that derive new paths from a base path.
 *
 * Each takes an array of control points and returns one or more new point arrays,
 * ready to hand to a StrokeDef. They know nothing about renderers: the derived paths
 * are ordinary paths, drawn by whatever renderer the caller picks.
 */

function toCurve(points) {
    return new THREE.CatmullRomCurve3(points.map(p => p.clone()), false, 'centripetal');
}

/**
 * A spiral wound around the path: the tip circles with sin/cos while its center moves
 * along the base. Returns one continuous path.
 *
 * @param {THREE.Vector3[]} points
 * @param {object} [opts]
 * @param {number} [opts.turns]    Full revolutions over the whole length.
 * @param {number} [opts.radius]
 * @param {number} [opts.count]    Output points. A spiral needs far more than its base.
 */
export function spiralPath(points, { turns = 22, radius = 0.14, count = 900 } = {}) {
    const curve = toCurve(points);
    const out = [];
    for (let i = 0; i < count; i++) {
        const t = i / (count - 1);
        const c = curve.getPointAt(t);
        const theta = t * Math.PI * 2 * turns;
        out.push(new THREE.Vector3(
            c.x + Math.cos(theta) * radius,
            c.y + Math.sin(theta) * radius,
            c.z
        ));
    }
    return out;
}

/**
 * Wiggly copies of the path, each offset by its own low-frequency wave so the set
 * entangles. Deterministic for a given seed.
 *
 * @returns {THREE.Vector3[][]}
 */
export function entangledPaths(points, { count = 6, amplitude = 0.12, waves = 3, seed = 1, samples = 120 } = {}) {
    const curve = toCurve(points);
    const rand = seededRandom(seed);
    const paths = [];
    for (let k = 0; k < count; k++) {
        // Two or three sine components per axis, with seeded frequency and phase.
        const comps = Array.from({ length: waves }, () => ({
            fx: 1 + rand() * 3.5, px: rand() * Math.PI * 2, ax: (rand() * 0.7 + 0.3),
            fy: 1 + rand() * 3.5, py: rand() * Math.PI * 2, ay: (rand() * 0.7 + 0.3),
        }));
        const path = [];
        for (let i = 0; i < samples; i++) {
            const t = i / (samples - 1);
            const c = curve.getPointAt(t);
            let dx = 0, dy = 0;
            for (const w of comps) {
                dx += Math.sin(t * Math.PI * 2 * w.fx + w.px) * w.ax;
                dy += Math.sin(t * Math.PI * 2 * w.fy + w.py) * w.ay;
            }
            // Endpoints pull back toward the base so the bundle reads as one gesture.
            const pinch = Math.sin(Math.PI * t) * 0.7 + 0.3;
            path.push(new THREE.Vector3(
                c.x + dx * amplitude * pinch / waves,
                c.y + dy * amplitude * pinch / waves,
                c.z + k * 0.001
            ));
        }
        paths.push(path);
    }
    return paths;
}

/**
 * Short strokes scattered roughly along the path: each copies a small segment of the
 * base and moves it sideways by a seeded offset. Deterministic for a given seed.
 *
 * @returns {THREE.Vector3[][]}
 */
export function scatteredPaths(points, { count = 60, length = 0.05, offset = 0.14, seed = 1, samples = 10 } = {}) {
    const curve = toCurve(points);
    const rand = seededRandom(seed);
    const paths = [];
    for (let k = 0; k < count; k++) {
        const t0 = rand() * (1 - length);
        const angle = rand() * Math.PI * 2;
        const r = (rand() * 0.75 + 0.25) * offset;
        const dx = Math.cos(angle) * r;
        const dy = Math.sin(angle) * r;
        const path = [];
        for (let i = 0; i < samples; i++) {
            const t = t0 + (i / (samples - 1)) * length;
            const c = curve.getPointAt(Math.min(t, 1));
            path.push(new THREE.Vector3(c.x + dx, c.y + dy, c.z + k * 0.0005));
        }
        paths.push(path);
    }
    return paths;
}

/**
 * The convex hull of a set of points, counterclockwise, by Andrew's monotone chain.
 * The hull is the smallest convex region containing every point, which makes it the
 * natural outline for a shape that must enclose a whole gesture.
 */
export function convexHull(points) {
    const pts = points.map(p => p.clone()).sort((a, b) => a.x - b.x || a.y - b.y);
    if (pts.length < 3) return pts;
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const half = start => {
        const out = [];
        for (const p of start) {
            while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
            out.push(p);
        }
        out.pop();
        return out;
    };
    return [...half(pts), ...half([...pts].reverse())];
}

/**
 * The outline of everything within `radius` of the polyline: an offset of the path
 * itself, so it follows the gesture into its concavities instead of spanning them.
 *
 * The distance field to the polyline is stamped onto a grid, and the radius contour
 * is extracted with marching squares. Returns the longest closed contour,
 * counterclockwise, as a point array.
 */
export function offsetOutline(points, radius, { cell = radius / 2.5 } = {}) {
    if (points.length === 0) return [];

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of points) {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    const pad = radius + cell * 2;
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;
    const nx = Math.min(400, Math.ceil((maxX - minX) / cell) + 1);
    const ny = Math.min(400, Math.ceil((maxY - minY) / cell) + 1);
    const sx = (maxX - minX) / (nx - 1);
    const sy = (maxY - minY) / (ny - 1);

    const dist = new Float32Array(nx * ny).fill(Infinity);
    const stampSegment = (a, b) => {
        const lo = [Math.min(a.x, b.x) - radius - cell, Math.min(a.y, b.y) - radius - cell];
        const hi = [Math.max(a.x, b.x) + radius + cell, Math.max(a.y, b.y) + radius + cell];
        const i0 = Math.max(0, Math.floor((lo[0] - minX) / sx));
        const i1 = Math.min(nx - 1, Math.ceil((hi[0] - minX) / sx));
        const j0 = Math.max(0, Math.floor((lo[1] - minY) / sy));
        const j1 = Math.min(ny - 1, Math.ceil((hi[1] - minY) / sy));
        const dx = b.x - a.x, dy = b.y - a.y;
        const len2 = dx * dx + dy * dy;
        for (let j = j0; j <= j1; j++) {
            const y = minY + j * sy;
            for (let i = i0; i <= i1; i++) {
                const x = minX + i * sx;
                let t = len2 > 0 ? ((x - a.x) * dx + (y - a.y) * dy) / len2 : 0;
                t = Math.max(0, Math.min(1, t));
                const ddx = x - (a.x + dx * t), ddy = y - (a.y + dy * t);
                const d = Math.sqrt(ddx * ddx + ddy * ddy);
                const idx = j * nx + i;
                if (d < dist[idx]) dist[idx] = d;
            }
        }
    };
    if (points.length === 1) stampSegment(points[0], points[0]);
    for (let k = 1; k < points.length; k++) stampSegment(points[k - 1], points[k]);

    // Marching squares on the field f = radius - dist, zero at the outline.
    const f = i => radius - dist[i];
    const segs = [];
    const lerp = (x0, y0, x1, y1, f0, f1) => {
        const t = f0 / (f0 - f1);
        return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
    };
    for (let j = 0; j < ny - 1; j++) {
        for (let i = 0; i < nx - 1; i++) {
            const x0 = minX + i * sx, y0 = minY + j * sy;
            const x1 = x0 + sx, y1 = y0 + sy;
            const fa = f(j * nx + i), fb = f(j * nx + i + 1);
            const fc = f((j + 1) * nx + i + 1), fd = f((j + 1) * nx + i);
            let code = (fa > 0 ? 1 : 0) | (fb > 0 ? 2 : 0) | (fc > 0 ? 4 : 0) | (fd > 0 ? 8 : 0);
            if (code === 0 || code === 15) continue;
            const top = () => lerp(x0, y0, x1, y0, fa, fb);
            const right = () => lerp(x1, y0, x1, y1, fb, fc);
            const bottom = () => lerp(x0, y1, x1, y1, fd, fc);
            const left = () => lerp(x0, y0, x0, y1, fa, fd);
            const put = (p, q) => segs.push([p, q]);
            switch (code) {
                case 1: put(left(), top()); break;
                case 2: put(top(), right()); break;
                case 3: put(left(), right()); break;
                case 4: put(right(), bottom()); break;
                case 5: put(left(), top()); put(right(), bottom()); break;
                case 6: put(top(), bottom()); break;
                case 7: put(left(), bottom()); break;
                case 8: put(bottom(), left()); break;
                case 9: put(bottom(), top()); break;
                case 10: put(top(), right()); put(bottom(), left()); break;
                case 11: put(bottom(), right()); break;
                case 12: put(right(), left()); break;
                case 13: put(right(), top()); break;
                case 14: put(top(), left()); break;
            }
        }
    }

    // Chain the segment soup into loops and keep the longest.
    const eps = Math.min(sx, sy) * 1e-3;
    const key = p => `${Math.round(p[0] / eps)},${Math.round(p[1] / eps)}`;
    const byStart = new Map();
    segs.forEach(seg => {
        const k = key(seg[0]);
        if (!byStart.has(k)) byStart.set(k, []);
        byStart.get(k).push(seg);
    });
    let best = [];
    const used = new Set();
    for (const seg of segs) {
        if (used.has(seg)) continue;
        const loop = [seg[0]];
        let current = seg;
        while (current && !used.has(current)) {
            used.add(current);
            loop.push(current[1]);
            const candidates = byStart.get(key(current[1])) ?? [];
            current = candidates.find(c => !used.has(c));
        }
        if (loop.length > best.length) best = loop;
    }
    if (best.length > 1 && key(best[0]) === key(best[best.length - 1])) best.pop();

    // Counterclockwise, so callers can offset along outward normals consistently.
    let area = 0;
    for (let i = 0; i < best.length; i++) {
        const a = best[i], b = best[(i + 1) % best.length];
        area += a[0] * b[1] - b[0] * a[1];
    }
    if (area < 0) best.reverse();
    return best.map(p => new THREE.Vector3(p[0], p[1], 0));
}
