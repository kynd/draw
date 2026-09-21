import { StrokeDef } from '../../lib/StrokeDef.js';
import { DryMediaStrokeRenderer } from '../../lib/renderers/DryMediaStrokeRenderer.js';
import { randomSchemePalette, paperColor } from '../../lib/SchemePaletteMaker.js';
import { StrokeStage } from '../../lib/demo/stage.js';
import { wireCollapsibles } from '../../lib/demo/panel.js';
import { straightThenWiggle, layout, centerY, taper } from '../../lib/demo/strokePaths.js';

const SEEDS = [1.0, 2.3, 5.1];
const CAPS = ['rounded', 'square', 'square'];
const RAG = [0, 0.25, 0.25];

// Fine, medium, coarse grain: the dry-media renderer with a hard grain threshold
// (grainSoft 0.09), so the mark reads as a stiff, dragged dry brush.
const GRAIN_SOFT = 0.09;
const BRUSHES = [
    { width: 0.05, tooth: 2.0, grain: 0.55, softness: 0.35, edge: 0.08, pressure: 0.45, opacity: 1.0 },
    { width: 0.08, tooth: 4.5, grain: 0.70, softness: 0.50, edge: 0.30, pressure: 0.50, opacity: 0.92 },
    { width: 0.12, tooth: 7.0, grain: 0.80, softness: 0.65, edge: 0.55, pressure: 0.40, opacity: 0.95 },
];

const readout = document.getElementById('readout');
const ctrl = {
    grain: document.getElementById('grain'),
    pressure: document.getElementById('pressure'),
};

const stage = new StrokeStage(document.getElementById('canvas'));

let entries = [];
let colors = [];

function randomizeColors() {
    const palette = randomSchemePalette('vivid-wheel');
    stage.setBackground(paperColor(palette.entries[0].H));
    return BRUSHES.map((_, i) => palette.entries[i % palette.length].hex);
}

function rebuild() {
    entries.forEach(({ mesh, renderer }) => {
        stage.remove(mesh);
        renderer.dispose(mesh);
    });
    entries = [];

    const grainScale = parseFloat(ctrl.grain.value);
    const pressureScale = parseFloat(ctrl.pressure.value);
    const { spread } = layout(stage.extentY, BRUSHES[2].width);
    let samples = 0, vertices = 0, triangles = 0;

    BRUSHES.forEach((brush, i) => {
        const renderer = new DryMediaStrokeRenderer({
            cap: CAPS[i],
            rag: RAG[i],
            color: colors[i],
            grain: brush.grain * grainScale,
            tooth: brush.tooth,
            pressure: brush.pressure * pressureScale,
            softness: brush.softness,
            edge: brush.edge,
            opacity: brush.opacity,
            grainSoft: GRAIN_SOFT,
        });
        const def = new StrokeDef({
            points: straightThenWiggle(centerY(i, BRUSHES.length, spread), { z0: 0.01 + i * 0.01 }),
            widthLeft: taper(brush.width),
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
        + `<span>strokes<strong>${BRUSHES.length}</strong></span>`
        + `<span>samples<strong>${samples}</strong></span>`
        + `<span>vertices<strong>${vertices}</strong></span>`
        + `<span>triangles<strong>${triangles}</strong></span></div>`;

    stage.draw();
}

Object.values(ctrl).forEach(el => {
    el.addEventListener('input', () => {
        document.getElementById(`${el.id}-val`).textContent = parseFloat(el.value).toFixed(2);
        rebuild();
    });
});

document.getElementById('random-btn').addEventListener('click', () => {
    colors = randomizeColors();
    rebuild();
});

stage.onResize(() => rebuild());
wireCollapsibles();
colors = randomizeColors();
rebuild();
