import { StrokeDef } from '../../lib/StrokeDef.js';
import { PatternStrokeRenderer } from '../../lib/renderers/PatternStrokeRenderer.js';
import { randomThemedPalette, paperColor } from '../../lib/ThemedPaletteMaker.js';
import { StrokeStage } from '../../lib/demo/stage.js';
import { wireCollapsibles, wireWireframeToggle } from '../../lib/demo/panel.js';
import { straightThenWiggle, layout, centerY, taper } from '../../lib/demo/strokePaths.js';

const MODES = ['dashes', 'dots', 'strips'];
const SEEDS = [1.0, 2.3, 5.1];

const readout = document.getElementById('readout');
const ctrl = {
    width: document.getElementById('width'),
    size: document.getElementById('size'),
};

const stage = new StrokeStage(document.getElementById('canvas'));

let entries = [];
let colors = ['#46608a', '#8a4630', '#3a6b46'];

function randomizeColors() {
    const palette = randomThemedPalette('vivid-dark');
    stage.setBackground(paperColor(palette.entries[0].H));
    return MODES.map((_, i) => palette.entries[i % palette.length].hex);
}

function rebuild() {
    entries.forEach(({ mesh, renderer }) => {
        stage.remove(mesh);
        renderer.dispose(mesh);
    });
    entries = [];

    const width = parseFloat(ctrl.width.value);
    const size = parseFloat(ctrl.size.value);
    const { spread } = layout(stage.extentY, width * 1.2);
    let samples = 0, vertices = 0, triangles = 0;

    for (let i = 0; i < MODES.length; i++) {
        const renderer = new PatternStrokeRenderer({
            mode: MODES[i], color: colors[i], size,
        });
        const def = new StrokeDef({
            points: straightThenWiggle(centerY(i, MODES.length, spread), { z0: 0.01 + i * 0.01 }),
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
        + `<span>strokes<strong>${MODES.length}</strong></span>`
        + `<span>samples<strong>${samples}</strong></span>`
        + `<span>vertices<strong>${vertices}</strong></span>`
        + `<span>triangles<strong>${triangles}</strong></span></div>`;

    stage.draw();
}

const decimals = id => (id === 'width' ? 3 : 2);
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
