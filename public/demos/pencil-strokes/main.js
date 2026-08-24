import { StrokeDef } from '../../lib/StrokeDef.js';
import { PencilStrokeRenderer } from '../../lib/renderers/PencilStrokeRenderer.js';
import { Palette } from '../../lib/Palette.js';
import { StrokeStage } from '../../lib/demo/stage.js';
import { wireCollapsibles } from '../../lib/demo/panel.js';
import { straightThenWiggle, layout, centerY, taper } from '../../lib/demo/strokePaths.js';

const COUNT = 3;
const SEEDS = [1.0, 2.3, 5.1];
const CAPS = ['rounded', 'square', 'ragged'];
const GRAPHITE = '#2c2c31';

const readout = document.getElementById('readout');
const ctrl = {
    grain: document.getElementById('grain'),
    pressure: document.getElementById('pressure'),
    width: document.getElementById('width'),
};

const stage = new StrokeStage(document.getElementById('canvas'), {
    fit: { width: 1.70, height: 1.60 },
});

let entries = [];
let colors = [GRAPHITE, GRAPHITE, GRAPHITE];
let first = true;

function randomizeColors() {
    const palette = Palette.fromHues(
        Array.from({ length: 4 }, () => Math.random() * 360),
        { nLum: 5, lumHigh: 0.93, lumLow: 0.28, vibHigh: 0.95, vibLow: 0.30 }
    );
    const pick = list => list[Math.floor(Math.random() * list.length)];
    stage.setBackground(pick(palette.entries.filter(e => e.L > 0.85)).hex);

    const byHue = new Map();
    palette.entries.filter(e => e.L < 0.55).forEach(e => {
        if (!byHue.has(e.H)) byHue.set(e.H, []);
        byHue.get(e.H).push(e);
    });
    const groups = [...byHue.values()].sort(() => Math.random() - 0.5);
    return Array.from({ length: COUNT }, (_, i) => pick(groups[i % groups.length]).hex);
}

function rebuild() {
    entries.forEach(({ mesh, renderer }) => {
        stage.remove(mesh);
        renderer.dispose(mesh);
    });
    entries = [];

    const width = parseFloat(ctrl.width.value);
    const { spread } = layout(stage.extentY, width);
    let samples = 0, vertices = 0, triangles = 0;

    for (let i = 0; i < COUNT; i++) {
        const renderer = new PencilStrokeRenderer({
            cap: CAPS[i],
            color: colors[i],
            grain: parseFloat(ctrl.grain.value),
            pressure: parseFloat(ctrl.pressure.value),
        });
        const def = new StrokeDef({
            points: straightThenWiggle(centerY(i, COUNT, spread), { z0: 0.01 + i * 0.01 }),
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

Object.values(ctrl).forEach(el => {
    el.addEventListener('input', () => {
        document.getElementById(`${el.id}-val`).textContent =
            parseFloat(el.value).toFixed(el.id === 'width' ? 3 : 2);
        rebuild();
    });
});

document.getElementById('random-btn').addEventListener('click', () => {
    colors = randomizeColors();
    rebuild();
});

stage.onResize(() => rebuild());
wireCollapsibles();
rebuild();
