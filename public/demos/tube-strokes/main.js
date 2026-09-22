import { StrokeDef } from '../../lib/StrokeDef.js';
import { PIXELS_PER_UNIT } from '../../lib/CanvasBuffer.js';
import { TubeStrokeRenderer } from '../../lib/renderers/TubeStrokeRenderer.js';
import { randomSchemePalette, paperColor } from '../../lib/SchemePaletteMaker.js';
import { StrokeStage } from '../../lib/demo/stage.js';
import { wireCollapsibles, wireWireframeToggle } from '../../lib/demo/panel.js';
import { straightThenWiggle, layout, centerY, taper, AMPLITUDE } from '../../lib/demo/strokePaths.js';
import { TestBackground } from '../../lib/demo/testBackground.js';

const ROWS = 3;
const SEEDS = [1.0, 2.3, 5.1];

const readout = document.getElementById('readout');
const ctrl = {
    width: document.getElementById('width'),
    depth: document.getElementById('depth'),
    twist: document.getElementById('twist'),
    stripes: document.getElementById('stripes'),
};

const stage = new StrokeStage(document.getElementById('canvas'));
let palette = randomSchemePalette('vivid-wheel');
const background = new TestBackground(palette, { blur: 6 });
const plane = background.createPlane(stage.extentX, stage.extentY);
stage.add(plane);

let entries = [];
let colors = { stripes: [], a: '#803050', b: '#2a5080', tint: '#e8d8c8' };

function randomizeColors() {
    palette = randomSchemePalette('vivid-wheel');
    background.paint(palette, stage.viewport.pixelWidth, stage.viewport.pixelHeight);
    const sorted = [...palette.entries].sort((a, b) => a.L - b.L);
    return {
        stripes: Array.from({ length: 4 }, () => palette.pick().hex),
        a: sorted[0].hex,
        b: sorted[1 % sorted.length].hex,
        tint: sorted[sorted.length - 1].hex,
    };
}

let showNormals = false;

function makeRenderer(index) {
    const common = {
        showNormals,
        depth: parseFloat(ctrl.depth.value),
        twist: parseFloat(ctrl.twist.value),
    };
    if (index === 0) {
        return new TubeStrokeRenderer({
            ...common, mode: 'candy', colors: colors.stripes,
            stripes: parseFloat(ctrl.stripes.value),
        });
    }
    if (index === 1) {
        return new TubeStrokeRenderer({
            ...common, mode: 'wobble', colorA: colors.a, colorB: colors.b,
        });
    }
    return new TubeStrokeRenderer({
        ...common, mode: 'metal', tint: colors.tint, background: background.texture,
    });
}

function rebuild() {
    entries.forEach(({ mesh, renderer }) => {
        stage.remove(mesh);
        renderer.dispose(mesh);
    });
    entries = [];

    const width = parseFloat(ctrl.width.value) / PIXELS_PER_UNIT;
    // The wiggle grows with the width, so a wide tube keeps the same drawn
    // shape instead of folding through its own wave, capped so three rows
    // still fit the canvas.
    const wiggleScale = Math.min(width / 0.075,
        Math.max((stage.extentY / ROWS - width * 1.3) / AMPLITUDE, 0.6));
    const { spread } = layout(stage.extentY, width * 1.3, ROWS, AMPLITUDE * wiggleScale);
    let samples = 0, vertices = 0, triangles = 0;

    for (let i = 0; i < ROWS; i++) {
        const renderer = makeRenderer(i);
        const def = new StrokeDef({
            points: straightThenWiggle(centerY(i, ROWS, spread), { z0: 0, wiggleScale }),
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

const decimals = id => (id === 'width' ? 0 : (id === 'depth' ? 2 : 1));
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
document.getElementById('normals-btn').addEventListener('click', e => {
    showNormals = !showNormals;
    e.currentTarget.classList.toggle('active', showNormals);
    rebuild();
});
