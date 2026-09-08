import * as THREE from 'three';
import { StrokeDef } from '../../lib/StrokeDef.js';
import { BrushStrokeRenderer } from '../../lib/renderers/BrushStrokeRenderer.js';
import { resampleEvery, catmullRomSpline, hasSettledStart } from '../../lib/curves.js';
import { randomThemedPalette, paperColor } from '../../lib/ThemedPaletteMaker.js';
import { PIXELS_PER_UNIT } from '../../lib/CanvasBuffer.js';
import { StrokeStage } from '../../lib/demo/stage.js';
import { DrawInput } from '../../lib/demo/drawInput.js';
import { wireCollapsibles } from '../../lib/demo/panel.js';
import { taper } from '../../lib/demo/strokePaths.js';

const readout = document.getElementById('readout');
const widthInput = document.getElementById('width');

const stage = new StrokeStage(document.getElementById('canvas'));

let drawn = [];
let entry = null;
let colors = ['#2c3a5e', '#7a4a2f'];

function randomizeColors() {
    const palette = randomThemedPalette('dark-cluster');
    stage.setBackground(paperColor(palette.entries[0].H));
    return [palette.entries[0].hex, palette.entries[1 % palette.length].hex];
}

// The pointer's own path, always shown, so the input is visible even while
// the mark is not drawn or has smoothed away from it.
const pointerLine = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: '#000000' })
);
pointerLine.position.z = 0.06;
pointerLine.frustumCulled = false;
stage.add(pointerLine);

function setPointerLine(points) {
    pointerLine.geometry.dispose();
    const geometry = new THREE.BufferGeometry();
    const array = new Float32Array(points.length * 3);
    points.forEach((p, i) => {
        array[i * 3] = p.x;
        array[i * 3 + 1] = p.y;
        array[i * 3 + 2] = 0;
    });
    geometry.setAttribute('position', new THREE.BufferAttribute(array, 3));
    pointerLine.geometry = geometry;
}

function buildStroke(path, width) {
    const renderer = new BrushStrokeRenderer({
        cap: 'ragged',
        colorA: colors[0],
        colorB: colors[1],
        samplesPerUnit: 90,
    });
    const def = new StrokeDef({
        points: path,
        widthLeft: taper(width),
        renderer,
        seed: 3.7,
    });
    const mesh = def.build();
    mesh.position.z = 0.01;
    stage.add(mesh);
    return { mesh, renderer };
}

function disposeEntry() {
    if (!entry) return;
    stage.remove(entry.mesh);
    entry.renderer.dispose(entry.mesh);
    entry = null;
}

const holdInput = document.getElementById('hold');

function refresh() {
    disposeEntry();
    setPointerLine(drawn);
    const minArc = parseFloat(holdInput.value) / PIXELS_PER_UNIT;
    const held = drawn.length < 2 || !hasSettledStart(drawn, minArc);
    readout.innerHTML = `<div class="dp-stats">`
        + `<span>drawn points<strong>${drawn.length}</strong></span>`
        + `<span>state<strong>${held ? 'held' : 'drawing'}</strong></span></div>`;
    if (held) { stage.draw(); return; }
    const knots = resampleEvery(drawn, 0.06);
    const path = knots.length >= 3 ? catmullRomSpline(knots, 6) : drawn;
    entry = buildStroke(path, parseFloat(widthInput.value));
    stage.draw();
}

new DrawInput(document.getElementById('canvas'), stage, {
    onChange: points => { drawn = points; refresh(); },
});

holdInput.addEventListener('input', () => {
    document.getElementById('hold-val').textContent = holdInput.value;
    refresh();
});
widthInput.addEventListener('input', () => {
    document.getElementById('width-val').textContent = parseFloat(widthInput.value).toFixed(3);
    refresh();
});
document.getElementById('random-btn').addEventListener('click', () => {
    colors = randomizeColors();
    refresh();
});

stage.onResize(() => refresh());
wireCollapsibles();
colors = randomizeColors();
refresh();
