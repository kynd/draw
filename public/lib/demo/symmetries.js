import { mirroredPath, rotatedPaths, translatedPaths } from '../pathEffects.js';

/**
 * The stroke symmetries: each kind rolls its parameters once per stroke and
 * derives the extra paths from the drawn one. `rollSymmetry(kind)` returns
 * the per-stroke roll (a rotation count, parallel offsets, the screen axes,
 * and at even odds `recolor`, which gives every copy its own palette
 * colors); `symmetricCopies(path, roll, extents)` returns the copies. The
 * rolls use Math.random; a host that needs determinism records what the
 * copies drew.
 *
 *   mirror    the path mirrored across the vertical line through its start.
 *   rotation  the path repeated evenly around its start, 2 to 6 in all.
 *   parallel  1 to 4 copies stepped along one rolled direction, a hatch of
 *             parallel strokes.
 *   screen    the path mirrored across the canvas's center axis, vertical,
 *             horizontal, or both (both adds the point reflection too).
 */
const KINDS = {
    mirror: {
        roll: () => ({}),
        countOf: () => 1,
        copies: path => [mirroredPath(path)],
    },
    rotation: {
        roll: () => ({ count: 2 + Math.floor(Math.random() * 5) }),
        countOf: roll => roll.count - 1,
        copies: (path, roll) => rotatedPaths(path, { count: roll.count }),
    },
    parallel: {
        roll: () => {
            const count = 1 + Math.floor(Math.random() * 4);
            const angle = Math.random() * Math.PI;
            const step = 0.18 + Math.random() * 0.3;
            return {
                offsets: Array.from({ length: count }, (_, k) => {
                    const d = (k + 1) * step * (0.85 + Math.random() * 0.3);
                    return [Math.cos(angle) * d, Math.sin(angle) * d];
                }),
            };
        },
        countOf: roll => roll.offsets.length,
        copies: (path, roll) => translatedPaths(path, roll.offsets),
    },
    screen: {
        roll: () => ({ axes: ['x', 'y', 'both'][Math.floor(Math.random() * 3)] }),
        countOf: roll => (roll.axes === 'both' ? 3 : 1),
        copies: (path, roll) => {
            const paths = [];
            if (roll.axes !== 'y') paths.push(mirroredPath(path, { x: 0 }));
            if (roll.axes !== 'x') paths.push(mirroredPath(path, { y: 0 }));
            if (roll.axes === 'both') paths.push(mirroredPath(path, { x: 0, y: 0 }));
            return paths;
        },
    },
};

export const SYMMETRY_KINDS = Object.keys(KINDS);

/**
 * The per-stroke roll for one kind, held while the stroke grows. With
 * `colors` given, even odds add `recolors`: one resolved color pair per
 * copy, so the live echo, the landed copies, and a mirror all agree.
 */
export function rollSymmetry(kind, colors = null) {
    const roll = { kind, ...KINDS[kind].roll() };
    if (colors && Math.random() < 0.5) {
        const pick = () => colors[Math.floor(Math.random() * colors.length)];
        roll.recolors = Array.from({ length: KINDS[kind].countOf(roll) },
            () => ({ a: pick(), b: pick() }));
    }
    return roll;
}

/** The extra paths symmetric to `path` under a roll. */
export function symmetricCopies(path, roll) {
    return KINDS[roll.kind].copies(path, roll);
}
