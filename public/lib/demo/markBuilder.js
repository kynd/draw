import * as THREE from 'three';
import { StrokeDef } from '../StrokeDef.js';
import { PIXELS_PER_UNIT } from '../CanvasBuffer.js';
import { RibbonStrokeRenderer } from '../renderers/RibbonStrokeRenderer.js';
import { blobOutline } from '../pathEffects.js';
import { pressureAlong, pressureRatio, limitWidthSlope, averagePressure } from './pressure.js';

export const PRESSURE_FLOOR = 0.15;
const DEFAULT_PRESSURE_RANGE = 2;

/**
 * The bridge from a tool state to a drawn mark, shared by the drawing tool and
 * the player. `state` is the live selection ({ tool, values, widthPx, sens,
 * colorA, colorB, colors, seedOverride }); the returned function is a draw
 * cycle `build`: it turns one piece's path and raw points into a mark with the
 * current state's tool, honoring `seedOverride` while a replayed record drives
 * the cycle, so seeded looks reproduce.
 */
export function makeMarkBuilder({ state, board }) {
    return (path, points, seed) => {
        const useSeed = state.seedOverride ?? seed;
        const ctx = {
            colorA: state.colorA, colorB: state.colorB, colors: state.colors,
            texture: board.texture, seed: useSeed,
            start: path[0], end: path[path.length - 1],
            tintLight: new THREE.Color(state.colorA).lerp(new THREE.Color('#ffffff'), 0.55).getStyle(),
        };
        // A shape tool ignores the path between the endpoints, and its size
        // comes from them, so neither width nor pressure applies.
        if (state.tool.kind === 'shape') {
            const contour = state.tool.contour(path[0], path[path.length - 1], useSeed);
            if (!contour) return null;
            const renderer = state.tool.make(state.values, ctx);
            const mesh = renderer.build(contour, useSeed);
            mesh.position.z = 0.05;
            return { mesh, renderer };
        }
        const width = state.widthPx / PIXELS_PER_UNIT;
        const pressureAt = pressureAlong(points);
        // Pressure scales around the set width as a ratio: middle pressure
        // draws it as set, light below, heavy above, with the swing set per
        // tool by its registry entry.
        const range = state.tool.pressure ?? DEFAULT_PRESSURE_RANGE;
        if (state.tool.kind === 'blob') {
            const scale = pressureRatio(averagePressure(points),
                { range, sens: state.sens, floor: PRESSURE_FLOOR });
            // The cap yields to the set width, so an initializer's fat fills
            // keep their radius while pressure stays bounded.
            const radius = Math.min(Math.max(width * 1.3 * scale, 0.05),
                Math.max(width * 1.3, 0.45));
            const contour = blobOutline(path, { span: 0.12, radius });
            if (!contour) return null;
            const renderer = state.tool.make(state.values, ctx);
            const mesh = renderer.build(contour, useSeed);
            mesh.position.z = 0.05;
            return { mesh, renderer };
        }
        const renderer = state.tool.make(state.values, ctx);
        // Uniform width along the stroke; only pressure varies it.
        const widthLeft = limitWidthSlope(path,
            s => width * pressureRatio(pressureAt(s),
                { range, sens: state.sens, floor: PRESSURE_FLOOR }));
        const mesh = new StrokeDef({
            points: path.map(p => new THREE.Vector3(p.x, p.y, 0)),
            widthLeft, renderer, seed: useSeed,
        }).build();
        mesh.position.z = 0.05;
        // A halo tool draws a plain core and hands the draw cycle a silhouette of
        // the same shape plus its halo spec. The cycle blurs the whole gesture's
        // silhouettes together and bakes the result under the cores, so the soft
        // part is a blurred union, not inflated geometry, and splits leave no seam.
        if (state.tool.halo) {
            const silRenderer = new RibbonStrokeRenderer({ cap: 'rounded', color: '#ffffff' });
            const sil = new StrokeDef({
                points: path.map(p => new THREE.Vector3(p.x, p.y, 0)),
                widthLeft, renderer: silRenderer, seed: useSeed,
            }).build();
            return { mesh, renderer, sil: { mesh: sil, renderer: silRenderer },
                halo: state.tool.halo(state.values, ctx) };
        }
        return { mesh, renderer };
    };
}

/**
 * Restores one record's tool, parameters, and colors into a state, ahead of
 * feeding its points. `seedOverride` carries the record's seed into the marks
 * it builds.
 */
export function applyRecordTo(state, record, registry) {
    state.tool = registry.find(r => r.id === record.toolId) ?? registry[0];
    state.values = { ...record.values };
    state.widthPx = record.widthPx;
    state.sens = record.sens;
    state.colorA = record.colorA;
    state.colorB = record.colorB;
    state.colors = [...record.colors];
    state.seedOverride = record.seed;
}
