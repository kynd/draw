import * as THREE from 'three';
import { StrokeRenderer } from './StrokeRenderer.js';
import { BrushStrokeRenderer } from './BrushStrokeRenderer.js';
import { StrokeDef } from '../StrokeDef.js';
import { spiralPath, entangledPaths, scatteredPaths, wigglePath } from '../pathEffects.js';

/**
 * Paths derived from the drawn path, each drawn with the brush renderer, in
 * one of four looks.
 *
 *   spiral     the tip circles while its center moves along the path, one
 *              continuous coil.
 *   entangled  copies of the path offset by seeded low-frequency waves, their
 *              endpoints pulled back toward the base.
 *   scattered  short strokes copying small segments of the path, moved
 *              sideways by a seeded offset.
 *   wiggle     one path crossing the base from side to side, its wavelength
 *              tightening from loose at the start to tight at the end.
 *
 * Every spatial size (the radius, the wave amplitude, the scatter offset) follows the
 * width, so a heavier stroke spreads further. Every count (the spiral's turns, the
 * wiggle's crossings, the scatter's strokes) follows the path's length, so the pattern
 * keeps its spacing as the stroke grows instead of crowding a short stroke and
 * stretching a long one. The width is capped at 0.03 world units for the derivation,
 * the range the formulas are calibrated for. The generators are documented on the Path
 * Effects page.
 */
export class AroundStrokeRenderer extends StrokeRenderer {
    /**
     * @param {object} opts
     * @param {'spiral'|'entangled'|'scattered'|'wiggle'} [opts.mode]
     * @param {string} [opts.colorA]
     * @param {string} [opts.colorB]
     * @param {number} [opts.reach]  How far the derived paths stray, in widths.
     * @param {number} [opts.cycle]  The spiral's advance per turn, as a multiple of its radius.
     */
    constructor({ mode = 'spiral', colorA = '#46608a', colorB = '#8a4630', reach = 7, cycle = 1.5 } = {}) {
        super();
        this.mode = mode;
        this.colorA = colorA;
        this.colorB = colorB;
        this.reach = reach;
        this.cycle = cycle;
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
        if (this.mode === 'wiggle') {
            return [wigglePath(base, {
                amplitude: reach,
                cycleStart: reach * 1.5,
                cycleEnd: width * 1.2,
            })];
        }
        return scatteredPaths(base, {
            spacing: width * 1.5,
            offset: reach,
            length: 0.04 + width * 1.2,
            seed,
        });
    }

    build(def) {
        const width = Math.min(Math.max(def.maxWidth(), 1e-4), 0.03);
        const group = new THREE.Group();
        let samples = 0, vertices = 0, triangles = 0;
        this._paths(def, width).forEach((path, k) => {
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
