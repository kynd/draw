import { StrokeDef } from '../../lib/StrokeDef.js';
import { WatercolorStrokeRenderer } from '../../lib/renderers/WatercolorStrokeRenderer.js';
import { SmearStrokeRenderer } from '../../lib/renderers/SmearStrokeRenderer.js';
import { WetBrushStrokeRenderer } from '../../lib/renderers/WetBrushStrokeRenderer.js';
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
    pigment: document.getElementById('pigment'),
    rim: document.getElementById('rim'),
    bleed: document.getElementById('bleed'),
    drag: document.getElementById('drag'),
    variation: document.getElementById('variation'),
    width: document.getElementById('width'),
    edge: document.getElementById('edge'),
};

const stage = new StrokeStage(document.getElementById('canvas'));

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

function makeRenderer(index) {
    const shared = {
        cap: CAPS[index],
        color: colors[index],
        background: background.texture,
        blurred: background.blurred,
        edge: parseFloat(ctrl.edge.value),
    };
    if (index === 0) {
        return new WatercolorStrokeRenderer({
            ...shared,
            pigment: parseFloat(ctrl.pigment.value),
            rim: parseFloat(ctrl.rim.value),
            bleed: parseFloat(ctrl.bleed.value),
        });
    }
    if (index === 1) {
        return new SmearStrokeRenderer({
            ...shared,
            drag: parseFloat(ctrl.drag.value),
            variation: parseFloat(ctrl.variation.value),
        });
    }
    return new WetBrushStrokeRenderer({
        ...shared,
        drag: parseFloat(ctrl.drag.value) * 0.6,
        pigment: parseFloat(ctrl.pigment.value) * 0.8,
        rim: parseFloat(ctrl.rim.value) * 0.8,
    });
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
        const renderer = makeRenderer(i);
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

const decimals = id => (id === 'drag' ? 0 : (id === 'width' ? 3 : 2));
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
