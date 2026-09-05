import { StrokeDef } from '../../lib/StrokeDef.js';
import { PatternStrokeRenderer } from '../../lib/renderers/PatternStrokeRenderer.js';
import { Palette } from '../../lib/Palette.js';
import { StrokeStage } from '../../lib/demo/stage.js';
import { wireCollapsibles, wireWireframeToggle } from '../../lib/demo/panel.js';
import { straightThenWiggle, layout, centerY, taper } from '../../lib/demo/strokePaths.js';

const ROWS = 3;
const SEEDS = [1.0, 2.3, 5.1];

const readout = document.getElementById('readout');
const ctrl = {
    width: document.getElementById('width'),
    angle: document.getElementById('angle'),
    size: document.getElementById('size'),
};

const stage = new StrokeStage(document.getElementById('canvas'));

let entries = [];
let colors = [['#46608a', '#8a4630'], ['#3a6b46', '#6b3a5e'], ['#8a6a2f', '#2f4a8a']];

function randomizeColors() {
    const palette = Palette.fromHues(
        Array.from({ length: 4 }, () => Math.random() * 360),
        { nLum: 5, lumHigh: 0.93, lumLow: 0.28, vibHigh: 0.95, vibLow: 0.30 }
    );
    const pick = list => list[Math.floor(Math.random() * list.length)];
    stage.setBackground(pick(palette.entries.filter(e => e.L > 0.85)).hex);
    const dark = palette.entries.filter(e => e.L < 0.6);
    return Array.from({ length: ROWS }, () => [pick(dark).hex, pick(dark).hex]);
}

function rebuild() {
    entries.forEach(({ mesh, renderer }) => {
        stage.remove(mesh);
        renderer.dispose(mesh);
    });
    entries = [];

    const width = parseFloat(ctrl.width.value);
    const size = parseFloat(ctrl.size.value);
    const angle = parseFloat(ctrl.angle.value);
    const { spread } = layout(stage.extentY, width * 1.6);
    let samples = 0, vertices = 0, triangles = 0;

    for (let i = 0; i < ROWS; i++) {
        const renderer = new PatternStrokeRenderer({
            mode: 'fringe', color: colors[i][0], colorB: colors[i][1], size, angle,
        });
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

const decimals = id => (id === 'width' ? 3 : (id === 'angle' ? 0 : 2));
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
