import * as THREE from 'three';

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
 * Half the distance between adjacent stroke centers, chosen so the margin above the top
 * stroke is twice the gap between two strokes.
 *
 * The strokes run in phase, so the gap between neighbours is constant along their whole
 * length and depends only on the spacing and the width. Solving
 * `H - (s + A + w) = 2(s - 2w)` for the spacing gives this.
 */
export function spacing(halfHeight, width) {
    return (halfHeight - AMPLITUDE + 3 * width) / 3;
}

/** Center line for stroke `i` of `count`, spread evenly across `spread`. */
export function centerY(i, count, spread) {
    return count === 1 ? 0 : THREE.MathUtils.lerp(spread, -spread, i / (count - 1));
}

/** Widest across the middle, three quarters of that at either end. */
export const taper = width => t => width * (0.75 + 0.25 * Math.sin(Math.PI * t));
