import * as THREE from 'three';
import { StrokeDef } from '../StrokeDef.js';
import { PIXELS_PER_UNIT } from '../CanvasBuffer.js';
import { blobOutline } from '../pathEffects.js';
import { taperByArc } from './strokePaths.js';
import { pressureAlong, pressureResponse, limitWidthSlope, averagePressure, pathArcLength } from './pressure.js';

export const PRESSURE_FLOOR = 0.15;

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
        const width = state.widthPx / PIXELS_PER_UNIT;
        const pressureAt = pressureAlong(points);
        if (state.tool.kind === 'blob') {
            const scale = 1 + state.sens * pressureResponse(averagePressure(points), 1, PRESSURE_FLOOR);
            const radius = Math.min(Math.max(width * 1.3 * scale, 0.05), 0.45);
            const contour = blobOutline(path, { span: 0.12, radius });
            if (!contour) return null;
            const renderer = state.tool.make(state.values, ctx);
            const mesh = renderer.build(contour, useSeed);
            mesh.position.z = 0.05;
            return { mesh, renderer };
        }
        const renderer = state.tool.make(state.values, ctx);
        const base = taperByArc(width, pathArcLength(path));
        const def = new StrokeDef({
            points: path.map(p => new THREE.Vector3(p.x, p.y, 0)),
            widthLeft: limitWidthSlope(path,
                s => base(s) * (1 + state.sens * pressureResponse(pressureAt(s), 1, PRESSURE_FLOOR))),
            renderer,
            seed: useSeed,
        });
        const mesh = def.build();
        mesh.position.z = 0.05;
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
