import { StrokeDef } from '../../lib/StrokeDef.js';
import { OilStrokeRenderer } from '../../lib/renderers/OilStrokeRenderer.js';
import { Palette } from '../../lib/Palette.js';
import { StrokeStage } from '../../lib/demo/stage.js';
import { TestBackground } from '../../lib/demo/testBackground.js';
import { wireCollapsibles, wireWireframeToggle } from '../../lib/demo/panel.js';
import { straightThenWiggle, layout, centerY, taper } from '../../lib/demo/strokePaths.js';

const COUNT = 3;
const SEEDS = [1.0, 2.3, 5.1];
const CAPS = ['rounded', 'square', 'ragged'];

const readout = document.getElementById('readout');
const ctrl = {
    paint: document.getElementById('paint'),
    drag: document.getElementById('drag'),
    ridges: document.getElementById('ridges'),
    stretch: document.getElementById('stretch'),
    gloss: document.getElementById('gloss'),
    width: document.getElementById('width'),
};

const stage = new StrokeStage(document.getElementById('canvas'), {
    fit: { width: 1.70, height: 1.60 },
});

let palette = newPalette();
const background = new TestBackground(palette);
const plane = background.createPlane(stage.extentX, stage.extentY);
stage.add(plane);

let entries = [];
let colors = [];

function newPalette() {
    return Palette.fromHues(
        Array.from({ length: 5 }, () => Math.random() * 360),
        { nLum: 4, lumHigh: 0.88, lumLow: 0.32, vibHigh: 0.95, vibLow: 0.35 }
    );
}

function randomizeColors() {
    palette = newPalette();
    background.paint(palette, stage.viewport.pixelWidth, stage.viewport.pixelHeight);
    const dark = palette.entries.filter(e => e.L < 0.62);
    const pick = () => dark[Math.floor(Math.random() * dark.length)].hex;
    return Array.from({ length: COUNT }, pick);
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
        const renderer = new OilStrokeRenderer({
            cap: CAPS[i],
            color: colors[i],
            background: background.texture,
            paint: parseFloat(ctrl.paint.value),
            drag: parseFloat(ctrl.drag.value),
            noise: parseFloat(ctrl.ridges.value),
            stretch: parseFloat(ctrl.stretch.value),
            gloss: parseFloat(ctrl.gloss.value),
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

const decimals = id => (id === 'drag' ? 0 : (id === 'width' ? 3 : (id === 'stretch' ? 1 : 2)));
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

stage.onResize(() => {
    background.paint(palette, stage.viewport.pixelWidth, stage.viewport.pixelHeight);
    background.resizePlane(plane, stage.extentX, stage.extentY);
    rebuild();
});

wireCollapsibles();
colors = randomizeColors();
rebuild();
wireWireframeToggle(document.getElementById('wire-btn'), stage);
