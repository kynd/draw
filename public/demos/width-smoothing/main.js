import * as THREE from 'three';
import { StrokeDef } from '../../lib/StrokeDef.js';
import { BrushStrokeRenderer } from '../../lib/renderers/BrushStrokeRenderer.js';
import { smoothByWidth } from '../../lib/curves.js';
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

const gainInput = document.getElementById('gain');

function refresh() {
    disposeEntry();
    setPointerLine(drawn);
    if (drawn.length < 2) {
        readout.innerHTML = '';
        stage.draw();
        return;
    }
    const width = parseFloat(widthInput.value);
    const gain = parseFloat(gainInput.value);
    const path = smoothByWidth(drawn, width, { gain });
    const span = Math.min(Math.max(width * gain, 0.02), 0.3);
    readout.innerHTML = `<div class="dp-stats">`
        + `<span>drawn points<strong>${drawn.length}</strong></span>`
        + `<span>knot spacing<strong>${span.toFixed(3)}</strong></span>`
        + `<span>path points<strong>${path.length}</strong></span></div>`;
    if (path.length >= 2) entry = buildStroke(path, width);
    stage.draw();
}

new DrawInput(document.getElementById('canvas'), stage, {
    onChange: points => { drawn = points; refresh(); },
});

for (const [el, id, decimals] of [[widthInput, 'width-val', 3], [gainInput, 'gain-val', 1]]) {
    el.addEventListener('input', () => {
        document.getElementById(id).textContent = parseFloat(el.value).toFixed(decimals);
        refresh();
    });
}
document.getElementById('random-btn').addEventListener('click', () => {
    colors = randomizeColors();
    refresh();
});

stage.onResize(() => refresh());
wireCollapsibles();
colors = randomizeColors();
refresh();
