import * as THREE from 'three';
import { StrokeDef } from '../../lib/StrokeDef.js';
import { BrushStrokeRenderer } from '../../lib/renderers/BrushStrokeRenderer.js';
import { resampleEvery, catmullRomSpline, splitByTurn, hasSettledStart } from '../../lib/curves.js';
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
let entries = [];
let colors = ['#2c3a5e', '#7a4a2f', '#3f6b3a', '#6b2f4a', '#8a6a2f'];

function randomizeColors() {
    const palette = randomThemedPalette('vivid-dark');
    stage.setBackground(paperColor(palette.entries[0].H));
    return Array.from({ length: 5 }, (_, i) => palette.entries[i % palette.length].hex);
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

function buildStroke(path, width, i) {
    const renderer = new BrushStrokeRenderer({
        cap: 'ragged',
        colorA: colors[i % colors.length],
        colorB: colors[(i + 1) % colors.length],
        samplesPerUnit: 90,
    });
    const def = new StrokeDef({
        points: path.map(p => new THREE.Vector3(p.x, p.y, 0)),
        widthLeft: taper(width),
        renderer,
        seed: 3.7 + i,
    });
    const mesh = def.build();
    mesh.position.z = 0.01 + i * 0.002;
    stage.add(mesh);
    return { mesh, renderer };
}

function disposeEntries() {
    for (const { mesh, renderer } of entries) {
        stage.remove(mesh);
        renderer.dispose(mesh);
    }
    entries = [];
}

const holdInput = document.getElementById('hold');

function refresh() {
    disposeEntries();
    setPointerLine(drawn);
    if (drawn.length < 2) {
        readout.innerHTML = '';
        stage.draw();
        return;
    }
    const minArc = parseFloat(holdInput.value) / PIXELS_PER_UNIT;
    const width = parseFloat(widthInput.value);
    // The same split as the drawing demos: a sharp turn starts a new piece,
    // and every piece passes the same gate its stroke did.
    const runs = splitByTurn(drawn);
    let held = 0;
    runs.forEach((run, i) => {
        if (!hasSettledStart(run, minArc)) { held++; return; }
        const knots = resampleEvery(run, 0.06);
        const path = knots.length >= 3 ? catmullRomSpline(knots, 6) : run;
        if (path.length >= 2) entries.push(buildStroke(path, width, i));
    });
    readout.innerHTML = `<div class="dp-stats">`
        + `<span>drawn points<strong>${drawn.length}</strong></span>`
        + `<span>pieces<strong>${runs.length}</strong></span>`
        + `<span>held<strong>${held}</strong></span></div>`;
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
