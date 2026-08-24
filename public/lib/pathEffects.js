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
