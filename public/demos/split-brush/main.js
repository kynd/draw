import * as THREE from 'three';
import { StrokeDef } from '../../lib/StrokeDef.js';
import { BrushStrokeRenderer } from '../../lib/renderers/BrushStrokeRenderer.js';
import { resampleEvery, catmullRomSpline, splitByTurn } from '../../lib/curves.js';
import { Palette } from '../../lib/Palette.js';
import { StrokeStage } from '../../lib/demo/stage.js';
import { DrawInput } from '../../lib/demo/drawInput.js';
import { wireCollapsibles, wireWireframeToggle } from '../../lib/demo/panel.js';
import { taper } from '../../lib/demo/strokePaths.js';

const readout = document.getElementById('readout');
const angleInput = document.getElementById('angle');
const windowInput = document.getElementById('window');
const spanInput = document.getElementById('span');
const widthInput = document.getElementById('width');

const stage = new StrokeStage(document.getElementById('canvas'));

let drawn = [];
let entries = [];
let colors = ['#2c3a5e', '#7a4a2f', '#3f6b3a', '#6b2f4a', '#8a6a2f'];

function randomizeColors() {
    const palette = Palette.fromHues(
        Array.from({ length: 4 }, () => Math.random() * 360),
        { nLum: 5, lumHigh: 0.93, lumLow: 0.28, vibHigh: 0.95, vibLow: 0.30 }
    );
    const pick = list => list[Math.floor(Math.random() * list.length)];
    stage.setBackground(pick(palette.entries.filter(e => e.L > 0.85)).hex);
    const dark = palette.entries.filter(e => e.L < 0.6);
    return Array.from({ length: 5 }, () => pick(dark).hex);
}

function refresh() {
    for (const { mesh, renderer } of entries) {
        stage.remove(mesh);
        renderer.dispose(mesh);
    }
    entries = [];
    if (drawn.length < 2) { stage.draw(); return; }

    const angle = parseFloat(angleInput.value) * Math.PI / 180;
    const span = parseFloat(windowInput.value);
    const smooth = parseFloat(spanInput.value);
    const width = parseFloat(widthInput.value);
    const runs = splitByTurn(drawn, { angle, span });

    let vertices = 0, triangles = 0;
    runs.forEach((run, i) => {
        const knots = resampleEvery(run, smooth);
        const smoothed = knots.length >= 3 ? catmullRomSpline(knots) : run;
        if (smoothed.length < 2) return;
        const renderer = new BrushStrokeRenderer({
            cap: 'ragged',
            colorA: colors[i % colors.length],
            colorB: colors[(i + 1) % colors.length],
            samplesPerUnit: 90,
        });
        const def = new StrokeDef({
            points: smoothed.map(p => new THREE.Vector3(p.x, p.y, 0)),
            widthLeft: taper(width),
            renderer,
            seed: 3.7 + i,
        });
        const mesh = def.build();
        mesh.position.z = 0.01 + i * 0.002;
        stage.add(mesh);
        entries.push({ mesh, renderer });
        vertices += mesh.userData.stats.vertexCount;
        triangles += mesh.userData.stats.triangleCount;
    });

    readout.innerHTML = `<div class="dp-stats">`
        + `<span>drawn points<strong>${drawn.length}</strong></span>`
        + `<span>strokes<strong>${entries.length}</strong></span>`
        + `<span>vertices<strong>${vertices}</strong></span>`
        + `<span>triangles<strong>${triangles}</strong></span></div>`;

    stage.draw();
}

// A fast zigzag, the case the splitting is for.
function zigzag() {
    const points = [];
    const n = 9;
    for (let i = 0; i <= n; i++) {
        const x0 = THREE.MathUtils.lerp(-1.4, 1.4, i / n);
        const x1 = THREE.MathUtils.lerp(-1.4, 1.4, (i + 1) / n);
        const y0 = i % 2 === 0 ? -0.5 : 0.5;
        const y1 = i % 2 === 0 ? 0.5 : -0.5;
        for (let k = 0; k < 12; k++) {
            const t = k / 12;
            points.push(new THREE.Vector3(
                THREE.MathUtils.lerp(x0, x1, t),
                THREE.MathUtils.lerp(y0, y1, t) + Math.sin((i + t) * 9.0) * 0.02,
                0
            ));
        }
    }
    return points;
}

const input = new DrawInput(document.getElementById('canvas'), stage, {
    onChange: points => { drawn = points; refresh(); },
});

for (const el of [angleInput, windowInput, spanInput, widthInput]) {
    el.addEventListener('input', () => {
        document.getElementById(`${el.id}-val`).textContent =
            el.id === 'angle' ? el.value
            : el.id === 'width' ? parseFloat(el.value).toFixed(3)
            : parseFloat(el.value).toFixed(2);
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
drawn = zigzag();
input.set(drawn);
refresh();
wireWireframeToggle(document.getElementById('wire-btn'), stage);
