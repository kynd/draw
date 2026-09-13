import * as THREE from 'three';
import { StrokeDef } from '../StrokeDef.js';
import { PIXELS_PER_UNIT } from '../CanvasBuffer.js';
import { randomThemedPalette, paperGradient, PALETTE_THEMES } from '../ThemedPaletteMaker.js';
import { resampleEvery, catmullRomSpline } from '../curves.js';
import { StrokeStage } from './stage.js';
import { DrawingBoard } from './drawingBoard.js';
import { DrawInput } from './drawInput.js';
import { toolRegistry, randomValues, toolLabel } from './toolRegistry.js';
import { scatterPath, taperByArc } from './strokePaths.js';
import { pathArcLength } from './pressure.js';

/**
 * The harness the symmetric-stroke demos share: a drawing board where each
 * gesture is drawn together with its symmetric copies, shown live while
 * drawing and baked on release.
 *
 * `makeSymmetry()` is rolled once per stroke and returns `copies(path)`, the
 * extra paths symmetric to the drawn one, so a per-stroke roll (a rotation
 * count, say) holds steady while the gesture grows. `toolIds` fills the tool
 * select, under a cycle that advances per stroke.
 */
export function setupSymmetryBoard({ makeSymmetry, toolIds, theme = 'vivid-dark' }) {
    const stage = new StrokeStage(document.getElementById('canvas'));
    const board = new DrawingBoard(stage);
    const tools = toolIds.map(id => toolRegistry.find(e => e.id === id)).filter(Boolean);

    const select = document.getElementById('tool-select');
    tools.forEach((entry, i) => {
        const option = document.createElement('option');
        option.value = String(i);
        option.textContent = toolLabel(entry);
        select.appendChild(option);
    });

    let palette = randomThemedPalette(theme);
    let backgroundSpec = null;
    let cycle = 0;
    let seed = 1;
    let stroke = null;
    let live = [];

    function currentTool() {
        return select.value === 'cycle'
            ? tools[cycle % tools.length]
            : tools[parseInt(select.value, 10)];
    }

    /** Rolls everything one stroke holds steady: the tool, its values, the
     * colors, the width, and the symmetry. */
    function rollStroke(entry) {
        const colors = palette.entries.map(e => e.hex);
        const [min, max] = entry.width ?? [2, 64];
        return {
            entry,
            values: randomValues(entry),
            colorA: colors[Math.floor(Math.random() * colors.length)],
            colorB: colors[Math.floor(Math.random() * colors.length)],
            width: (min + (0.3 + Math.random() * 0.5) * (max - min)) / PIXELS_PER_UNIT,
            copies: makeSymmetry(),
            seed: Math.random() * 1000,
        };
    }

    function buildMeshes(points) {
        const knots = resampleEvery(points, 0.06);
        const path = knots.length >= 3 ? catmullRomSpline(knots, 6) : points;
        if (path.length < 2 || pathArcLength(path) < 1e-4) return [];
        const colors = palette.entries.map(e => e.hex);
        return [path, ...stroke.copies(path)].map((p, i) => {
            const ctx = {
                colorA: stroke.colorA, colorB: stroke.colorB, colors,
                texture: board.texture, seed: stroke.seed + i,
                start: p[0], end: p[p.length - 1],
                tintLight: new THREE.Color(stroke.colorA)
                    .lerp(new THREE.Color('#ffffff'), 0.55).getStyle(),
            };
            const renderer = stroke.entry.make(stroke.values, ctx);
            const mesh = new StrokeDef({
                points: p,
                widthLeft: taperByArc(stroke.width, pathArcLength(p)),
                renderer,
                seed: stroke.seed + i,
            }).build();
            mesh.position.z = 0.05 + i * 0.002;
            return { mesh, renderer };
        });
    }

    function disposeLive() {
        live.forEach(({ mesh, renderer }) => {
            stage.remove(mesh);
            renderer.dispose(mesh);
        });
        live = [];
    }

    function onChange(points, done) {
        if (!stroke) stroke = rollStroke(currentTool());
        disposeLive();
        if (points.length >= 2) {
            const entries = buildMeshes(points);
            if (done && entries.length) {
                board.bake(entries.map(e => e.mesh));
                entries.forEach(e => e.renderer.dispose(e.mesh));
            } else {
                entries.forEach(e => stage.add(e.mesh));
                live = entries;
            }
        }
        if (done) {
            stroke = null;
            if (select.value === 'cycle') cycle += 1;
            seed += 1;
        }
        stage.draw();
    }

    /** One starting gesture per tool, so the page never opens empty. */
    function seedStrokes() {
        tools.forEach(entry => {
            stroke = rollStroke(entry);
            const entries = buildMeshes(scatterPath(stage.extentX * 0.8, stage.extentY * 0.8));
            if (entries.length) {
                board.bake(entries.map(e => e.mesh));
                entries.forEach(e => e.renderer.dispose(e.mesh));
            }
            stroke = null;
        });
    }

    function reset() {
        backgroundSpec = paperGradient(palette);
        board.clear(backgroundSpec);
        cycle = 0;
        seedStrokes();
        stage.draw();
    }

    new DrawInput(document.getElementById('canvas'), stage, { onChange });

    document.getElementById('random-btn').addEventListener('click', () => {
        palette = randomThemedPalette(theme);
        reset();
    });
    document.getElementById('clear-btn').addEventListener('click', () => {
        board.clear(backgroundSpec);
        stage.draw();
    });

    stage.onResize(() => {
        if (pending) {
            pending = false;
            reset();
            return;
        }
        stage.draw();
    });
    // The first layout pass can land after construction, when the stage still
    // has no size, so the first reset waits for the resize that sizes it.
    let pending = stage.extentX <= 0.01;
    if (!pending) reset();
    return { stage, board };
}
