import { StrokeDef } from '../../lib/StrokeDef.js';
import { CloudStrokeRenderer } from '../../lib/renderers/CloudStrokeRenderer.js';
import { RoundedSquareStrokeRenderer } from '../../lib/renderers/RoundedSquareStrokeRenderer.js';
import { SpikeStrokeRenderer } from '../../lib/renderers/SpikeStrokeRenderer.js';
import { randomThemedPalette, paperColor } from '../../lib/ThemedPaletteMaker.js';
import { StrokeStage } from '../../lib/demo/stage.js';
import { wireCollapsibles, wireWireframeToggle } from '../../lib/demo/panel.js';
import { straightThenWiggle, layout, centerY, taper } from '../../lib/demo/strokePaths.js';

const ROWS = 3;
const SEEDS = [1.0, 2.3, 5.1];

const readout = document.getElementById('readout');
const ctrl = {
    blob: document.getElementById('blob'),
    offset: document.getElementById('offset'),
    cell: document.getElementById('cell'),
    spikes: document.getElementById('spikes'),
    sharp: document.getElementById('sharp'),
    width: document.getElementById('width'),
};

const stage = new StrokeStage(document.getElementById('canvas'));

let entries = [];
let colors = [];

function randomizeColors() {
    const palette = randomThemedPalette('pastel-cluster');
    stage.setBackground(paperColor(palette.entries[0].H));
    return Array.from({ length: ROWS }, (_, i) => palette.entries[i % palette.length].hex);
}

function makeRenderer(index) {
    if (index === 0) {
        return new CloudStrokeRenderer({
            color: colors[0],
            blob: parseFloat(ctrl.blob.value),
            offset: parseFloat(ctrl.offset.value),
        });
    }
    if (index === 1) {
        return new RoundedSquareStrokeRenderer({
            color: colors[1],
            cell: parseFloat(ctrl.cell.value),
        });
    }
    return new SpikeStrokeRenderer({
        color: colors[2],
        spikes: parseFloat(ctrl.spikes.value),
        sharp: parseFloat(ctrl.sharp.value),
    });
}

function rebuild() {
    entries.forEach(({ mesh, renderer }) => {
        stage.remove(mesh);
        renderer.dispose(mesh);
    });
    entries = [];

    const width = parseFloat(ctrl.width.value);
    // The cloud reaches farthest: its offset plus its blob radius, in half-widths.
    const reach = width * (1 + parseFloat(ctrl.offset.value) + parseFloat(ctrl.blob.value) * 1.3);
    const { spread } = layout(stage.extentY, reach);
    let samples = 0, vertices = 0, triangles = 0;

    for (let i = 0; i < ROWS; i++) {
        const renderer = makeRenderer(i);
        const def = new StrokeDef({
            points: straightThenWiggle(centerY(i, ROWS, spread), { z0: 0.01 + i * 0.01 }),
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
        + `<span>strokes<strong>${ROWS}</strong></span>`
        + `<span>samples<strong>${samples}</strong></span>`
        + `<span>vertices<strong>${vertices}</strong></span>`
        + `<span>triangles<strong>${triangles}</strong></span></div>`;

    stage.draw();
}

const decimals = id => (id === 'width' ? 3 : (id === 'cell' ? 2 : 1));
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
