import * as THREE from 'three';
import { seededRandom } from '../random.js';

/**
 * Paths and layout shared by the stroke demos, so every demo draws the same shape and
 * the comparison between them is about the renderer rather than the path.
 */

export const AMPLITUDE = 0.34;
export const CONTROL_POINTS = 64;
const STRAIGHT_UNTIL = 0.30;
const WIGGLE_END = 0.62;

/**
 * A path that runs straight, then wiggles.
 *
 * The amplitude is held at zero until STRAIGHT_UNTIL and eased in with a smoothstep, so
 * the straight run and the curve belong to one continuous path rather than meeting at a
 * corner.
 */
export function straightThenWiggle(yBase, { z0 = 0.002, zRise = 0.004, halfWidthX = 1.52 } = {}) {
    const points = [];
    for (let i = 0; i < CONTROL_POINTS; i++) {
        const t = i / (CONTROL_POINTS - 1);
        const ramp = THREE.MathUtils.smoothstep(t, STRAIGHT_UNTIL, WIGGLE_END);
        const phase = (t - STRAIGHT_UNTIL) * Math.PI * 4.4;
        points.push(new THREE.Vector3(
            THREE.MathUtils.lerp(-halfWidthX, halfWidthX, t),
            yBase + ramp * AMPLITUDE * Math.sin(phase),
            z0 + zRise * t
        ));
    }
    return points;
}

/**
 * Vertical layout for a row of strokes.
 *
 * Each stroke is treated as a box of height `X`, the full extent it can reach including
 * the wiggle. The boxes are laid out so the margin above the first and below the last is
 * twice the margin between neighbours:
 *
 *   m = (canvasHeight - count * X) / (count + 3)
 *
 * For three strokes that is `(canvasH - 3X) / 6`, with `2m` at each end and `m` between,
 * which sums back to the canvas height exactly.
 *
 * @returns {{ spread: number, margin: number, boxHeight: number }} `spread` is the
 *          distance from the centre to the outermost stroke's centre line.
 */
export function layout(halfHeight, width, count = 3) {
    const boxHeight = 2 * (AMPLITUDE + width);
    const margin = Math.max(0, (2 * halfHeight - count * boxHeight) / (count + 3));
    // Adjacent centres sit one box plus one margin apart.
    const step = boxHeight + margin;
    const spread = (step * (count - 1)) / 2;
    return { spread, margin, boxHeight };
}

/** Center line for stroke `i` of `count`, spread evenly across `spread`. */
export function centerY(i, count, spread) {
    return count === 1 ? 0 : THREE.MathUtils.lerp(spread, -spread, i / (count - 1));
}

/** Widest across the middle, three quarters of that at either end. */
export const taper = width => t => width * (0.75 + 0.25 * Math.sin(Math.PI * t));

/**
 * A seeded curling scribble with a concavity, for blob demos: the same seed always
 * curls the same way.
 */
export function seededScribble(seed, { cx = 0, cy = 0, scale = 1 } = {}) {
    const rand = seededRandom(seed);
    const turn = 1.3 + rand() * 0.6;
    const phase = rand() * Math.PI * 2;
    const points = [];
    for (let i = 0; i < 90; i++) {
        const t = i / 89;
        const a = phase + t * Math.PI * turn;
        const r = (0.9 - 0.4 * t) * (1 + 0.15 * Math.sin(a * 3 + seed));
        points.push(new THREE.Vector3(
            cx + Math.cos(a) * r * 1.15 * scale,
            cy + Math.sin(a) * r * 0.8 * scale,
            0
        ));
    }
    return points;
}
