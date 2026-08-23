import { StrokeDef } from '../../lib/StrokeDef.js';
import { BrushStrokeRenderer } from '../../lib/renderers/BrushStrokeRenderer.js';
import { Palette } from '../../lib/Palette.js';
import { StrokeStage } from '../../lib/demo/stage.js';
import { wireCollapsibles } from '../../lib/demo/panel.js';
import { straightThenWiggle, spacing, centerY, taper } from '../../lib/demo/strokePaths.js';

const COUNT = 3;
const SEEDS = [1.0, 2.3, 5.1];

const readout = document.getElementById('readout');
const ctrl = {
    bristles: document.getElementById('bristles'),
    streak: document.getElementById('streak'),
    rough: document.getElementById('rough'),
    dry: document.getElementById('dry'),
    density: document.getElementById('density'),
    width: document.getElementById('width'),
};

const stage = new StrokeStage(document.getElementById('canvas'), {
    fit: { width: 1.70, height: 1.47 },
});

let entries = [];
let colors = [];

/** Two pigments per stroke, taken from two different hues of one palette. */
function randomizeColors() {
    const hues = Array.from({ length: 4 }, () => Math.random() * 360);
    const palette = Palette.fromHues(hues, {
        nLum: 5, lumHigh: 0.93, lumLow: 0.30, vibHigh: 0.95, vibLow: 0.28,
    });
    const pick = list => list[Math.floor(Math.random() * list.length)];
    stage.setBackground(pick(palette.entries.filter(e => e.L > 0.82)).hex);

    const byHue = new Map();
    palette.entries.filter(e => e.L < 0.66).forEach(e => {
        if (!byHue.has(e.H)) byHue.set(e.H, []);
        byHue.get(e.H).push(e);
    });
    const groups = [...byHue.values()].sort(() => Math.random() - 0.5);
    return Array.from({ length: COUNT }, (_, i) => [
        pick(groups[i % groups.length]).hex,
        pick(groups[(i + 1) % groups.length]).hex,
    ]);
}

function rebuild() {
    entries.forEach(({ mesh, renderer }) => {
        stage.remove(mesh);
        renderer.dispose(mesh);
    });
    entries = [];

    const width = parseFloat(ctrl.width.value);
    const spread = spacing(stage.extentY, width);
    let samples = 0, vertices = 0, triangles = 0;

    for (let i = 0; i < COUNT; i++) {
        const renderer = new BrushStrokeRenderer({
            colorA: colors[i][0],
            colorB: colors[i][1],
            bristles: parseFloat(ctrl.bristles.value),
            streak: parseFloat(ctrl.streak.value),
            rough: parseFloat(ctrl.rough.value),
            dry: parseFloat(ctrl.dry.value),
            samplesPerUnit: parseInt(ctrl.density.value, 10),
        });
        const def = new StrokeDef({
            points: straightThenWiggle(centerY(i, COUNT, spread), { zRise: 0.004, z0: 0.002 + i * 0.01 }),
            widthLeft: taper(width),
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
    }

    readout.innerHTML = `<div class="dp-stats">`
        + `<span>strokes<strong>${COUNT}</strong></span>`
        + `<span>samples<strong>${samples}</strong></span>`
        + `<span>vertices<strong>${vertices}</strong></span>`
        + `<span>triangles<strong>${triangles}</strong></span></div>`;

    stage.draw();
}

const decimals = id => (id === 'bristles' || id === 'density' ? 0 : (id === 'width' ? 3 : 2));
Object.values(ctrl).forEach(el => {
    el.addEventListener('input', () => {
        document.getElementById(`${el.id}-val`).textContent =
            parseFloat(el.value).toFixed(decimals(el.id));
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
