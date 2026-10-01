import * as THREE from 'three';
import { seededRandom } from '../random.js';

/**
 * Paths and layout shared by the stroke demos, so every demo draws the same shape and
 * the comparison between them is about the renderer rather than the path.
 */

export const AMPLITUDE = 0.34;
export const CONTROL_POINTS = 96;
const STRAIGHT_FRAC = 0.24;
const LOOP_FRAC = 0.30;
const LOOP_TURNS = 1.0;
const LOOP_DRIFT = 1.885;
const WIGGLE_WAVES = 1.6;
const LOOP_R_FRAC = 0.6;
const WAVE_AMP_FRAC = 0.8;

/**
 * A path that runs straight, rolls into a loop, then waves to the right.
 *
 * The straight run enters a one-turn loop horizontally. The loop is a circle whose center
 * drifts right by LOOP_DRIFT radii, so it leaves horizontally too and its entry and exit
 * strands cross once at about ninety degrees. The wave then runs to the right edge, its
 * amplitude eased in from the loop exit so it starts straight.
 *
 * The loop rises 2 * LOOP_R_FRAC amplitudes and the wave reaches WAVE_AMP_FRAC amplitudes, and
 * those two are chosen so the loop stays open (a hole in the middle) even under a thick stroke
 * while their sum still fits the amplitude band. The straight run and wave sit below yBase by
 * SHIFT so the whole path centers on yBase and spans exactly one amplitude either way, the same
 * band a plain wave would. `wiggleScale` scales the amplitude, wavelength, and loop together,
 * so a demo can grow the shape with its stroke width and keep it similar.
 */
export function straightThenWiggle(yBase, { z0 = 0.002, zRise = 0.004, halfWidthX = 1.52,
    wiggleScale = 1 } = {}) {
    const points = [];
    const R = AMPLITUDE * LOOP_R_FRAC * wiggleScale;
    const waveAmp = AMPLITUDE * WAVE_AMP_FRAC * wiggleScale;
    const drift = R * LOOP_DRIFT;
    // Center the loop-and-wave extent on yBase: it rises 2R and dips waveAmp from the baseline,
    // so dropping the baseline by half their difference makes it span one amplitude either way.
    const base = yBase - (2 * R - waveAmp) / 2;
    const xEntry = -halfWidthX * 0.24;
    const xExit = xEntry + drift;

    const straightCount = Math.round(CONTROL_POINTS * STRAIGHT_FRAC);
    const loopCount = Math.round(CONTROL_POINTS * LOOP_FRAC);
    const waveCount = CONTROL_POINTS - straightCount - loopCount;
    const total = CONTROL_POINTS - 1;
    let idx = 0;
    const z = () => z0 + zRise * (idx / total);

    // Straight run into the loop entry.
    for (let i = 0; i < straightCount; i++, idx++) {
        const f = i / (straightCount - 1);
        points.push(new THREE.Vector3(
            THREE.MathUtils.lerp(-halfWidthX, xEntry, f), base, z()));
    }
    // The roll: one turn of a circle whose center drifts right, entered and left horizontally,
    // so the entry and exit strands cross at about ninety degrees. The center sits one radius
    // above the baseline.
    const cy = base + R;
    for (let i = 1; i <= loopCount; i++, idx++) {
        const f = i / loopCount;
        const theta = -Math.PI / 2 + f * Math.PI * 2 * LOOP_TURNS;
        const cx = xEntry + drift * f;
        points.push(new THREE.Vector3(
            cx + Math.cos(theta) * R, cy + Math.sin(theta) * R, z()));
    }
    // Wave to the right, amplitude eased in from the loop exit so it leaves the roll straight.
    for (let i = 1; i <= waveCount; i++, idx++) {
        const f = i / waveCount;
        const ramp = THREE.MathUtils.smoothstep(f, 0, 0.33);
        const phase = f * WIGGLE_WAVES * Math.PI * 2 / wiggleScale;
        points.push(new THREE.Vector3(
            THREE.MathUtils.lerp(xExit, halfWidthX, f),
            base + ramp * waveAmp * Math.sin(phase),
            z()));
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
export function layout(halfHeight, width, count = 3, amplitude = AMPLITUDE) {
    const boxHeight = 2 * (amplitude + width);
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

/**
 * The gesture the tool preview draws, by category, centered on `c` inside a
 * box of size `{ w, h }` and varied by a seeded `{ phase, freq }`:
 *
 *   line     a wiggling line across the box, for ordinary strokes.
 *   mass     a compact oval loop, so a fill's outline reads as a rounded
 *            mass rather than a long band.
 *   span     the two endpoints of a short diagonal, for endpoint shapes that
 *            take their form from the start and end alone.
 *   radial   a line leaving the box center and curving out, so rotational
 *            copies fan around the center.
 */
export function previewPath(category, c, { w, h }, { phase = 0, freq = 6 } = {}) {
    if (category === 'span') {
        return [
            new THREE.Vector3(c.x - w * 0.26, c.y - h * 0.2, 0),
            new THREE.Vector3(c.x + w * 0.28, c.y + h * 0.22, 0),
        ];
    }
    const n = 28;
    if (category === 'mass') {
        return Array.from({ length: n }, (_, i) => {
            const t = i / (n - 1);
            const a = phase + t * Math.PI * 1.9;
            return new THREE.Vector3(
                c.x + Math.cos(a) * w * 0.28,
                c.y + Math.sin(a) * h * 0.3, 0);
        });
    }
    if (category === 'radial') {
        return Array.from({ length: n }, (_, i) => {
            const t = i / (n - 1);
            return new THREE.Vector3(
                c.x + t * w * 0.42,
                c.y + Math.sin(phase + t * freq) * h * 0.18 * t, 0);
        });
    }
    // line
    return Array.from({ length: n }, (_, i) => {
        const t = i / (n - 1);
        return new THREE.Vector3(
            c.x + (t - 0.5) * w * 0.72,
            c.y + Math.sin(phase + t * freq) * h * 0.2, 0);
    });
}

/**
 * A flat width profile: the same width from the start of a stroke to its end, so
 * only pressure varies it and the cap closes at the full width. Takes an arc-length
 * argument for interface parity with a varying profile, and ignores it.
 * @returns {function(number): number} arc length to width.
 */
export const uniformWidth = width => () => width;

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

/**
 * A seeded segment for endpoint shapes: two points symmetric about the center,
 * half-length `r`, at a seeded diagonal angle (kept away from the axes, so the
 * box shapes never collapse).
 */
export function seededSegment(seed, { cx = 0, cy = 0, r = 0.6 } = {}) {
    const rand = seededRandom(seed);
    const angle = (0.3 + rand() * 1.0) * (rand() < 0.5 ? 1 : -1);
    const dx = Math.cos(angle) * r, dy = Math.sin(angle) * r;
    return [
        new THREE.Vector3(cx - dx, cy - dy, 0),
        new THREE.Vector3(cx + dx, cy + dy, 0),
    ];
}

/**
 * A random wandering stroke for scattering marks on a fresh canvas: a wiggling
 * run at a random position and direction inside the extents, with a pressure
 * that swells gently through the middle. Uses Math.random; a caller that needs
 * determinism records the points it gets back.
 */
export function scatterPath(extentX, extentY, { length = null } = {}) {
    const ex = extentX * 0.7, ey = extentY * 0.7;
    const x0 = (Math.random() * 2 - 1) * ex * 0.6;
    const y0 = (Math.random() * 2 - 1) * ey * 0.6;
    const angle = Math.random() * Math.PI * 2;
    const len = length ?? 0.8 + Math.random() * 1.2;
    const amp = 0.08 + Math.random() * 0.22;
    const freq = 3 + Math.random() * 5;
    const dir = new THREE.Vector2(Math.cos(angle), Math.sin(angle));
    const perp = new THREE.Vector2(-dir.y, dir.x);
    const points = [];
    for (let i = 0; i < 44; i++) {
        const t = i / 43;
        const along = (t - 0.5) * len;
        const across = Math.sin(t * freq + angle) * amp;
        const p = new THREE.Vector3(
            Math.max(-ex, Math.min(ex, x0 + dir.x * along + perp.x * across)),
            Math.max(-ey, Math.min(ey, y0 + dir.y * along + perp.y * across)),
            0
        );
        p.pressure = 0.6 + 0.15 * Math.sin(t * Math.PI);
        points.push(p);
    }
    return points;
}
