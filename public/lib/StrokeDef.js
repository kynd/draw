import * as THREE from 'three';

/**
 * The definition of a single stroke.
 *
 * A StrokeDef holds *what* a stroke is — where it goes and how wide it is — and a
 * reference to the renderer that decides *how* it is turned into geometry. It builds
 * nothing itself.
 *
 * Width is stored separately for the left and right side of the spine, so a stroke can
 * be asymmetric about the path that generated it. "Left" is the +90° rotation of the
 * tangent in the XY plane.
 */
export class StrokeDef {
    /**
     * @param {object}   opts
     * @param {THREE.Vector3[]} opts.points  Control points. Renderers resample these;
     *                                       they are not the final vertices.
     * @param {Width}    opts.widthLeft      Width on the left of the spine.
     * @param {Width}   [opts.widthRight]    Width on the right. Defaults to widthLeft
     *                                       (a symmetric stroke).
     * @param {StrokeRenderer} opts.renderer Renderer used by build().
     * @param {number}  [opts.seed]          Feeds renderer features that need variation
     *                                       without randomness, such as a ragged cap.
     *                                       The same seed always produces the same shape.
     *
     * A Width is a number (constant), a number[] (sampled evenly along the stroke and
     * interpolated), or a function (t) => number with t in [0, 1] over arc length.
     */
    constructor({ points, widthLeft = 0.02, widthRight = null, renderer = null, seed = 1 }) {
        if (!Array.isArray(points) || points.length < 2) {
            throw new Error('StrokeDef requires at least 2 points.');
        }
        this.points = points.map(p => p.clone());
        this.widthLeft = widthLeft;
        this.widthRight = widthRight ?? widthLeft;
        this.renderer = renderer;
        this.seed = seed;
    }

    /** Width on the left side at normalised arc-length position t. */
    widthLeftAt(t) { return resolveWidth(this.widthLeft, t); }

    /** Width on the right side at normalised arc-length position t. */
    widthRightAt(t) { return resolveWidth(this.widthRight, t); }

    /** Largest width anywhere on the stroke — renderers use it to size caps. */
    maxWidth(samples = 16) {
        let max = 0;
        for (let i = 0; i <= samples; i++) {
            const t = i / samples;
            max = Math.max(max, this.widthLeftAt(t), this.widthRightAt(t));
        }
        return max;
    }

    /** Arc length of the control polygon. Cheap; renderers measure the curve instead. */
    get polylineLength() {
        let sum = 0;
        for (let i = 1; i < this.points.length; i++) {
            sum += this.points[i].distanceTo(this.points[i - 1]);
        }
        return sum;
    }

    /** Hands the stroke to its renderer. @returns {THREE.Object3D} */
    build() {
        if (!this.renderer) throw new Error('StrokeDef has no renderer.');
        return this.renderer.build(this);
    }
}

/** Resolves a Width (number | number[] | function) at position t. */
export function resolveWidth(width, t) {
    if (typeof width === 'number') return width;
    if (typeof width === 'function') return width(t);
    if (Array.isArray(width)) {
        if (width.length === 0) return 0;
        if (width.length === 1) return width[0];
        const f = THREE.MathUtils.clamp(t, 0, 1) * (width.length - 1);
        const i = Math.min(Math.floor(f), width.length - 2);
        return THREE.MathUtils.lerp(width[i], width[i + 1], f - i);
    }
    throw new Error('Width must be a number, an array of numbers, or a function of t.');
}
