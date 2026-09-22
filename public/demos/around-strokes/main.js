import { StrokeDef } from '../../lib/StrokeDef.js';
import { PIXELS_PER_UNIT } from '../../lib/CanvasBuffer.js';
import { BrushStrokeRenderer } from '../../lib/renderers/BrushStrokeRenderer.js';
import { spiralPath, entangledPaths, scatteredPaths } from '../../lib/pathEffects.js';
import { randomSchemePalette, paperColor } from '../../lib/SchemePaletteMaker.js';
import { StrokeStage } from '../../lib/demo/stage.js';
import { wireCollapsibles } from '../../lib/demo/panel.js';
import { straightThenWiggle, layout, centerY, taper } from '../../lib/demo/strokePaths.js';

const ROWS = 3;
const SEEDS = [3.0, 7.0, 11.0];

const readout = document.getElementById('readout');
const ctrl = {
    cycle: document.getElementById('cycle'),
    width: document.getElementById('width'),
};

const stage = new StrokeStage(document.getElementById('canvas'));

let entries = [];
let colorGroups = [];

function randomizeColors() {
    const palette = randomSchemePalette('vivid-wheel');
    stage.setBackground(paperColor(palette.entries[0].H));
    const hexes = palette.toHexArray();
    return Array.from({ length: ROWS }, (_, i) =>
        hexes.map((_, k) => hexes[(i + k) % hexes.length]));
}

/**
 * Derived paths for row `i`. Every spatial size follows the width, so a heavier stroke
 * spreads further; every count follows the path's length, so the pattern keeps its
 * spacing as the stroke grows.
 */
function derive(i, base, width) {
    const reach = width * 7;
    if (i === 0) {
        return [spiralPath(base, { cycle: reach * parseFloat(ctrl.cycle.value), radius: reach })];
    }
    if (i === 1) {
        return entangledPaths(base, {
            count: Math.round(3 + width * 260),
            amplitude: reach,
            wavelength: reach * 3,
            seed: SEEDS[i],
        });
    }
    return scatteredPaths(base, {
        spacing: width * 1.5,
        offset: reach,
        length: 0.04 + width * 1.2,
        seed: SEEDS[i],
    });
}

function rebuild() {
    entries.forEach(({ mesh, renderer }) => {
        stage.remove(mesh);
        renderer.dispose(mesh);
    });
    entries = [];

    const width = parseFloat(ctrl.width.value) / PIXELS_PER_UNIT;
    const { spread } = layout(stage.extentY, width * 8, ROWS);
    let samples = 0, vertices = 0, triangles = 0, strokes = 0;

    for (let i = 0; i < ROWS; i++) {
        const base = straightThenWiggle(centerY(i, ROWS, spread), { z0: 0.01 + i * 0.01 });
        const group = colorGroups[i];
        derive(i, base, width).forEach((path, k) => {
            const renderer = new BrushStrokeRenderer({
                cap: 'rounded',
                colorA: group[k % group.length],
                colorB: group[(k + 2) % group.length],
                bristles: Math.max(4, Math.round(width * 700)),
                rough: 0.45,
                dry: 0.22,
                samplesPerUnit: 90,
            });
            const def = new StrokeDef({
                points: path,
                widthLeft: taper(width),
                renderer,
                seed: SEEDS[i] + k,
            });
            const mesh = def.build();
            stage.add(mesh);

            const s = mesh.userData.stats;
            samples += s.sampleCount;
            vertices += s.vertexCount;
            triangles += s.triangleCount;
            strokes++;
            entries.push({ mesh, renderer });
        });
    }

    readout.innerHTML = `<div class="dp-stats">`
        + `<span>strokes<strong>${strokes}</strong></span>`
        + `<span>samples<strong>${samples}</strong></span>`
        + `<span>vertices<strong>${vertices}</strong></span>`
        + `<span>triangles<strong>${triangles}</strong></span></div>`;

    stage.draw();
}

Object.values(ctrl).forEach(el => {
    el.addEventListener('input', () => {
        document.getElementById(`${el.id}-val`).textContent =
            el.id === 'width' ? parseFloat(el.value).toFixed(0) : parseFloat(el.value).toFixed(1);
        rebuild();
    });
});

document.getElementById('random-btn').addEventListener('click', () => {
    colorGroups = randomizeColors();
    rebuild();
});

stage.onResize(() => rebuild());
wireCollapsibles();
colorGroups = randomizeColors();
rebuild();
