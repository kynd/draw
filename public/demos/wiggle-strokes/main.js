import { StrokeDef } from '../../lib/StrokeDef.js';
import { BrushStrokeRenderer } from '../../lib/renderers/BrushStrokeRenderer.js';
import { wigglePath } from '../../lib/pathEffects.js';
import { randomSchemePalette, paperColor } from '../../lib/SchemePaletteMaker.js';
import { StrokeStage } from '../../lib/demo/stage.js';
import { wireCollapsibles } from '../../lib/demo/panel.js';
import { straightThenWiggle, layout, centerY } from '../../lib/demo/strokePaths.js';

// Three characters of the same crossing wave. `reach` is the amplitude in widths; the
// wavelengths (start loose, end tight) are multiples of that amplitude, so a smaller
// wavelength-to-amplitude ratio reads as sharper turns and a larger one as rounder.
const ROWS = [
    { reach: 7, startMul: 1.5, endMul: 0.17 },   // tightening, the drawing-tool default
    { reach: 6, startMul: 2.6, endMul: 1.1 },    // rounder turns, mild tightening
    { reach: 9, startMul: 5.0, endMul: 3.0 },    // much looser, long gentle waves
];
const SEEDS = [3.0, 7.0, 11.0];

const readout = document.getElementById('readout');
const widthInput = document.getElementById('width');

const stage = new StrokeStage(document.getElementById('canvas'));

let entries = [];
let colorGroups = [];

function randomizeColors() {
    const palette = randomSchemePalette('vivid-wheel');
    stage.setBackground(paperColor(palette.entries[0].H));
    const hexes = palette.toHexArray();
    return ROWS.map((_, i) => [hexes[i % hexes.length], hexes[(i + 2) % hexes.length]]);
}

function rebuild() {
    entries.forEach(({ mesh, renderer }) => {
        stage.remove(mesh);
        renderer.dispose(mesh);
    });
    entries = [];

    const width = parseFloat(widthInput.value);
    const maxReach = Math.max(...ROWS.map(r => r.reach));
    const { spread } = layout(stage.extentY, width * maxReach, ROWS.length);
    let samples = 0, vertices = 0, triangles = 0;

    ROWS.forEach((row, i) => {
        const amplitude = width * row.reach;
        const base = straightThenWiggle(centerY(i, ROWS.length, spread), { z0: 0.01 + i * 0.01 });
        const path = wigglePath(base, {
            amplitude,
            cycleStart: amplitude * row.startMul,
            cycleEnd: amplitude * row.endMul,
        });
        const [colorA, colorB] = colorGroups[i];
        const renderer = new BrushStrokeRenderer({
            cap: 'rounded', colorA, colorB,
            bristles: Math.max(4, Math.round(width * 700)),
            rough: 0.45, dry: 0.22, samplesPerUnit: 90,
        });
        const def = new StrokeDef({
            points: path,
            widthLeft: () => width,
            renderer,
            seed: SEEDS[i],
        });
        const mesh = def.build();
        stage.add(mesh);

        const s = mesh.userData.stats;
        samples += s.sampleCount;
        vertices += s.vertexCount;
        triangles += s.triangleCount;
        entries.push({ mesh, renderer });
    });

    readout.innerHTML = `<div class="dp-stats">`
        + `<span>strokes<strong>${entries.length}</strong></span>`
        + `<span>samples<strong>${samples}</strong></span>`
        + `<span>vertices<strong>${vertices}</strong></span>`
        + `<span>triangles<strong>${triangles}</strong></span></div>`;

    stage.draw();
}

widthInput.addEventListener('input', () => {
    document.getElementById('width-val').textContent = parseFloat(widthInput.value).toFixed(3);
    rebuild();
});

document.getElementById('random-btn').addEventListener('click', () => {
    colorGroups = randomizeColors();
    rebuild();
});

stage.onResize(() => rebuild());
wireCollapsibles();
colorGroups = randomizeColors();
rebuild();
