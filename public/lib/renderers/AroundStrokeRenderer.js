import * as THREE from 'three';
import { StrokeRenderer } from './StrokeRenderer.js';
import { BrushStrokeRenderer } from './BrushStrokeRenderer.js';
import { StrokeDef } from '../StrokeDef.js';
import { spiralPath, entangledPaths, scatteredPaths } from '../pathEffects.js';

/**
 * Paths derived from the drawn path, each drawn with the brush renderer, in
 * one of three looks.
 *
 *   spiral     the tip circles while its center moves along the path, one
 *              continuous coil.
 *   entangled  copies of the path offset by seeded low-frequency waves, their
 *              endpoints pulled back toward the base.
 *   scattered  short strokes copying small segments of the path, moved
 *              sideways by a seeded offset.
 *
 * The count of sub-strokes and their offset from the base both follow the
 * width, so a heavier stroke spreads further and splits into more parts
 * rather than only thickening. The width is capped at 0.03 world units for
 * the derivation, the range the formulas are calibrated for; past it the
 * counts grow without bound. The generators are documented on the Path
 * Effects page.
 */
export class AroundStrokeRenderer extends StrokeRenderer {
    /**
     * @param {object} opts
     * @param {'spiral'|'entangled'|'scattered'} [opts.mode]
     * @param {string} [opts.colorA]
     * @param {string} [opts.colorB]
     * @param {number} [opts.reach]  How far the derived paths stray, in widths.
     * @param {number} [opts.turns]  The spiral's turn count.
     */
    constructor({ mode = 'spiral', colorA = '#46608a', colorB = '#8a4630', reach = 7, turns = 22 } = {}) {
        super();
        this.mode = mode;
        this.colorA = colorA;
        this.colorB = colorB;
        this.reach = reach;
        this.turns = turns;
    }

    _paths(def, width) {
        const base = def.points;
        const reach = width * this.reach;
        const seed = def.seed ?? 1;
        if (this.mode === 'spiral') {
            return [spiralPath(base, { turns: this.turns, radius: reach })];
        }
        if (this.mode === 'entangled') {
            return entangledPaths(base, {
                count: Math.round(3 + width * 260),
                amplitude: reach,
                seed,
            });
        }
        return scatteredPaths(base, {
            count: Math.round(25 + width * 3200),
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
