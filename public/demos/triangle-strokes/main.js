import { StrokeDef } from '../../lib/StrokeDef.js';
import { TriangleStrokeRenderer } from '../../lib/renderers/TriangleStrokeRenderer.js';
import { randomThemedPalette, paperColor } from '../../lib/ThemedPaletteMaker.js';
import { StrokeStage } from '../../lib/demo/stage.js';
import { wireCollapsibles, wireWireframeToggle } from '../../lib/demo/panel.js';
import { straightThenWiggle, layout, centerY, taper } from '../../lib/demo/strokePaths.js';
import { TestBackground } from '../../lib/demo/testBackground.js';

const ROWS = 3;
const SEEDS = [1.0, 2.3, 5.1];

const readout = document.getElementById('readout');
const ctrl = {
    width: document.getElementById('width'),
    depth: document.getElementById('depth'),
    twist: document.getElementById('twist'),
    spacing: document.getElementById('spacing'),
};

const stage = new StrokeStage(document.getElementById('canvas'));
let palette = randomThemedPalette('vivid-dark');
const background = new TestBackground(palette, { blur: 6 });
const plane = background.createPlane(stage.extentX, stage.extentY);
stage.add(plane);

let entries = [];
let colors = { stripes: [], a: '#803050', b: '#2a5080', tint: '#e8d8c8' };

function randomizeColors() {
    palette = randomThemedPalette('vivid-dark');
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
        spacing: parseFloat(ctrl.spacing.value),
    };
    if (index === 0) {
        return new TriangleStrokeRenderer({ ...common, mode: 'facets', colorA: colors.a });
    }
    if (index === 1) {
        return new TriangleStrokeRenderer({
            ...common, mode: 'grain', colorA: colors.a, colorB: colors.b,
        });
    }
    return new TriangleStrokeRenderer({
        ...common, mode: 'metal', tint: colors.tint, background: background.texture,
    });
}

function rebuild() {
    entries.forEach(({ mesh, renderer }) => {
        stage.remove(mesh);
        renderer.dispose(mesh);
    });
    entries = [];

    const width = parseFloat(ctrl.width.value);
    const { spread } = layout(stage.extentY, width * 1.3);
    let samples = 0, vertices = 0, triangles = 0;

    for (let i = 0; i < ROWS; i++) {
        const renderer = makeRenderer(i);
        const def = new StrokeDef({
            points: straightThenWiggle(centerY(i, ROWS, spread), { z0: 0 }),
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

const decimals = id => (id === 'width' ? 3 : (id === 'depth' || id === 'spacing' ? 2 : 1));
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
