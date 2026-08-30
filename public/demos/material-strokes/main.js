import { StrokeDef } from '../../lib/StrokeDef.js';
import { ChromeStrokeRenderer } from '../../lib/renderers/ChromeStrokeRenderer.js';
import { MirrorStrokeRenderer } from '../../lib/renderers/MirrorStrokeRenderer.js';
import { GlassStrokeRenderer } from '../../lib/renderers/GlassStrokeRenderer.js';
import { Palette } from '../../lib/Palette.js';
import { StrokeStage } from '../../lib/demo/stage.js';
import { TestBackground } from '../../lib/demo/testBackground.js';
import { wireCollapsibles, wireWireframeToggle } from '../../lib/demo/panel.js';
import { straightThenWiggle, layout, centerY, taper } from '../../lib/demo/strokePaths.js';

const COUNT = 3;
const SEEDS = [1.0, 3.4, 6.2];
const CAPS = ['rounded', 'square', 'ragged'];

const readout = document.getElementById('readout');
const ctrl = {
    dome: document.getElementById('dome'),
    noise: document.getElementById('noise'),
    stretch: document.getElementById('stretch'),
    across: document.getElementById('across'),
    specular: document.getElementById('specular'),
    bend: document.getElementById('bend'),
    width: document.getElementById('width'),
};

const stage = new StrokeStage(document.getElementById('canvas'));

let palette = newPalette();
const background = new TestBackground(palette, { blur: 10 });
const plane = background.createPlane(stage.extentX, stage.extentY);
stage.add(plane);

let entries = [];

function newPalette() {
    return Palette.fromHues(
        Array.from({ length: 5 }, () => Math.random() * 360),
        { nLum: 4, lumHigh: 0.90, lumLow: 0.28, vibHigh: 0.95, vibLow: 0.35 }
    );
}

function makeRenderer(index) {
    const field = {
        cap: CAPS[index],
        dome: parseFloat(ctrl.dome.value),
        noise: parseFloat(ctrl.noise.value),
        stretch: parseFloat(ctrl.stretch.value),
        across: parseFloat(ctrl.across.value),
    };
    const specular = parseFloat(ctrl.specular.value);
    const bend = parseFloat(ctrl.bend.value);

    if (index === 0) return new ChromeStrokeRenderer({ ...field, specular });
    if (index === 1) {
        return new MirrorStrokeRenderer({
            ...field, specular, background: background.texture, strength: bend * 0.5,
        });
    }
    return new GlassStrokeRenderer({
        ...field, specular, background: background.texture, refract: bend, reflect: bend * 0.4,
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

const decimals = id => (id === 'width' || id === 'bend' ? 3 : (id === 'across' ? 1 : 2));
Object.values(ctrl).forEach(el => {
    el.addEventListener('input', () => {
        document.getElementById(`${el.id}-val`).textContent =
            parseFloat(el.value).toFixed(decimals(el.id));
        rebuild();
    });
});

document.getElementById('random-btn').addEventListener('click', () => {
    palette = newPalette();
    background.paint(palette, stage.viewport.pixelWidth, stage.viewport.pixelHeight);
    rebuild();
});

stage.onResize(() => {
    background.paint(palette, stage.viewport.pixelWidth, stage.viewport.pixelHeight);
    background.resizePlane(plane, stage.extentX, stage.extentY);
    rebuild();
});

wireCollapsibles();
rebuild();
wireWireframeToggle(document.getElementById('wire-btn'), stage);
