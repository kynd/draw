import * as THREE from 'three';
import { StrokeRenderer } from './StrokeRenderer.js';
import { BrushStrokeRenderer } from './BrushStrokeRenderer.js';
import { StrokeDef } from '../StrokeDef.js';
import { spiralPath, entangledPaths, scatteredPaths, wigglePath, wiggleStrokeWidth } from '../pathEffects.js';

/**
 * Paths derived from the drawn path, each drawn with the brush renderer, in
 * one of six looks.
 *
 *   spiral     the tip circles while its center moves along the path, one
 *              continuous coil.
 *   entangled  copies of the path offset by seeded low-frequency waves, their
 *              endpoints pulled back toward the base.
 *   scattered  short strokes copying small segments of the path, moved
 *              sideways by a seeded offset.
 *   wiggle       one path crossing the base from side to side, its wavelength
 *                tightening from loose at the start to tight at the end.
 *   wiggle-even  the same crossing wave at a constant wavelength.
 *   wiggle-u     a constant wavelength whose lobes are U turns, not sine humps.
 *
 * The three wiggles read the drawn width as the wave's amplitude, so widening the
 * stroke grows the whole shape, and take their wavelength as an absolute size in
 * `wavelength` (world units). The brush line that traces the wave is not the drawn
 * width but a thickness derived from the amplitude and wavelength, clamped to 2..6
 * pixels and then scaled by `density`, so it stays balanced to the shape unless the
 * caller thins or thickens it. The tightening wiggle floors its tight end at the
 * amplitude, so even there a crossing is never sharper than it is wide.
 *
 * For the other three modes every spatial size (the radius, the scatter offset) follows
 * the drawn width, so a heavier stroke spreads further, and that width is capped at 0.03
 * world units for the derivation, the range the formulas are calibrated for. Every count
 * (the spiral's turns, the wiggle's crossings, the scatter's strokes) follows the path's
 * length, so the pattern keeps its spacing as the stroke grows instead of crowding a
 * short stroke and stretching a long one. The generators are documented on the Path
 * Effects page.
 */
export class AroundStrokeRenderer extends StrokeRenderer {
    /**
     * @param {object} opts
     * @param {'spiral'|'entangled'|'scattered'|'wiggle'|'wiggle-even'|'wiggle-u'} [opts.mode]
     * @param {string} [opts.colorA]
     * @param {string} [opts.colorB]
     * @param {number} [opts.reach]  How far the spiral, entangled, and scattered paths stray, in widths.
     * @param {number} [opts.cycle]  The spiral's advance per turn, as a multiple of its radius.
     * @param {number} [opts.wavelength]  The wiggle's wavelength, in world units (the drawn width is its amplitude).
     * @param {number} [opts.density]  Multiplier on the wiggle's derived line width.
     */
    constructor({ mode = 'spiral', colorA = '#46608a', colorB = '#8a4630',
        reach = 7, cycle = 1.5, wavelength = 0.3, density = 1 } = {}) {
        super();
        this.mode = mode;
        this.colorA = colorA;
        this.colorB = colorB;
        this.reach = reach;
        this.cycle = cycle;
        this.wavelength = wavelength;
        this.density = density;
    }

    get _isWiggle() {
        return this.mode === 'wiggle' || this.mode === 'wiggle-even' || this.mode === 'wiggle-u';
    }

    _paths(def, width) {
        const base = def.points;
        const reach = width * this.reach;
        const seed = def.seed ?? 1;
        if (this.mode === 'spiral') {
            return [spiralPath(base, { cycle: reach * this.cycle, radius: reach })];
        }
        if (this.mode === 'entangled') {
            return entangledPaths(base, {
                count: Math.round(3 + width * 260),
                amplitude: reach,
                wavelength: reach * 3,
                seed,
            });
        }
        return scatteredPaths(base, {
            spacing: width * 1.5,
            offset: reach,
            length: 0.04 + width * 1.2,
            seed,
        });
    }

    build(def) {
        const group = new THREE.Group();
        let samples = 0, vertices = 0, triangles = 0;

        // The wiggle reads the drawn width as the wave's amplitude; the brush line width
        // is derived from the amplitude and wavelength. The other modes draw at the width
        // itself, capped to the range their formulas are calibrated for.
        let width, paths;
        if (this._isWiggle) {
            const amplitude = Math.max(def.maxWidth(), 1e-4);
            const wl = this.wavelength;
            const tighten = this.mode === 'wiggle';
            width = wiggleStrokeWidth(amplitude, wl, this.density);
            paths = [wigglePath(def.points, {
                amplitude,
                cycleStart: wl,
                // The tightening wiggle floors its tight end at the amplitude; the others
                // hold the wavelength constant.
                cycleEnd: tighten ? Math.max(wl * 0.28, amplitude) : wl,
                shape: this.mode === 'wiggle-u' ? 'u' : 'sine',
            })];
        } else {
            width = Math.min(Math.max(def.maxWidth(), 1e-4), 0.03);
            paths = this._paths(def, width);
        }

        paths.forEach((path, k) => {
            if (path.length < 2) return;
            const renderer = new BrushStrokeRenderer({
                cap: 'rounded',
                // Hundreds of sub-strokes; a layer pass each would be that many
                // full-screen composites per frame.
                singleCoverage: false,
                colorA: k % 2 === 0 ? this.colorA : this.colorB,
                colorB: k % 2 === 0 ? this.colorB : this.colorA,
                bristles: Math.max(4, Math.round(width * 700)),
                rough: 0.45,
                dry: 0.22,
                samplesPerUnit: 90,
            });
            const sub = new StrokeDef({
                points: path,
                widthLeft: () => width,
                renderer,
                seed: (def.seed ?? 1) + k,
            });
            const mesh = sub.build();
            group.add(mesh);
            const s = mesh.userData.stats;
            samples += s.sampleCount;
            vertices += s.vertexCount;
            triangles += s.triangleCount;
        });
        group.userData.stats = { sampleCount: samples, vertexCount: vertices, triangleCount: triangles, length: 0 };
        return group;
    }
}
