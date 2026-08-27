import { StrokeDef } from '../../lib/StrokeDef.js';
import { PixelStrokeRenderer } from '../../lib/renderers/PixelStrokeRenderer.js';
import { PolygonStrokeRenderer } from '../../lib/renderers/PolygonStrokeRenderer.js';
import { LineStrokeRenderer } from '../../lib/renderers/LineStrokeRenderer.js';
import { Palette } from '../../lib/Palette.js';
import { StrokeStage } from '../../lib/demo/stage.js';
import { wireCollapsibles, wireWireframeToggle } from '../../lib/demo/panel.js';
import { straightThenWiggle, layout, centerY, taper } from '../../lib/demo/strokePaths.js';

const COUNT = 3;
const SEEDS = [1.0, 2.7, 4.9];
const CAPS = ['rounded', 'square', 'ragged'];

const readout = document.getElementById('readout');
const ctrl = {
    cell: document.getElementById('cell'),
    jitter: document.getElementById('jitter'),
    facets: document.getElementById('facets'),
    facetJitter: document.getElementById('facetJitter'),
    lanes: document.getElementById('lanes'),
    duty: document.getElementById('duty'),
    width: document.getElementById('width'),
};

const stage = new StrokeStage(document.getElementById('canvas'), {
    fit: { width: 1.70, height: 1.60 },
});

let entries = [];
let colors = [];

/** One palette per redraw; every stroke draws its cells from the same set. */
function randomizeColors() {
    const palette = Palette.fromHues(
        Array.from({ length: 5 }, () => Math.random() * 360),
        { nLum: 4, lumHigh: 0.88, lumLow: 0.30, vibHigh: 0.95, vibLow: 0.35 }
    );
    const light = palette.entries.filter(e => e.L > 0.80);
    stage.setBackground(light.length
        ? light[Math.floor(Math.random() * light.length)].hex
        : '#f4f4f4');
    return palette.entries.filter(e => e.L < 0.72).map(e => e.hex);
}

function makeRenderer(index) {
    if (index === 0) {
        return new PixelStrokeRenderer({
            cap: CAPS[index],
            cell: parseFloat(ctrl.cell.value),
            jitter: parseFloat(ctrl.jitter.value),
            colors,
        });
    }
    if (index === 1) {
        return new PolygonStrokeRenderer({
            cap: CAPS[index],
            facets: parseInt(ctrl.facets.value, 10),
            jitter: parseFloat(ctrl.facetJitter.value),
            colors,
        });
    }
    return new LineStrokeRenderer({
        cap: CAPS[index],
        lanes: parseInt(ctrl.lanes.value, 10),
        duty: parseFloat(ctrl.duty.value),
        colors,
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
            points: straightThenWiggle(centerY(i, COUNT, spread), { z0: 0.002 + i * 0.01 }),
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

const decimals = id => (id === 'cell' || id === 'width' ? 3 : (id === 'facets' || id === 'lanes' ? 0 : 2));
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
wireWireframeToggle(document.getElementById('wire-btn'), stage);
