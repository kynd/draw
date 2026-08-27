import * as THREE from 'three';
import { StrokeDef } from '../../lib/StrokeDef.js';
import { BrushStrokeRenderer } from '../../lib/renderers/BrushStrokeRenderer.js';
import { resampleEvery, naturalSpline, hobbyCurve, catmullRomSpline, bSpline } from '../../lib/curves.js';
import { seededRandom } from '../../lib/random.js';
import { Palette } from '../../lib/Palette.js';
import { StrokeStage } from '../../lib/demo/stage.js';
import { DrawInput } from '../../lib/demo/drawInput.js';
import { wireCollapsibles, wireWireframeToggle } from '../../lib/demo/panel.js';
import { taper } from '../../lib/demo/strokePaths.js';

const DEFAULT_SPAN = 0.5;

const readout = document.getElementById('readout');
const spanInput = document.getElementById('span');
const widthInput = document.getElementById('width');
const curveSelect = document.getElementById('curve-select');

spanInput.value = String(DEFAULT_SPAN);
document.getElementById('span-val').textContent = DEFAULT_SPAN.toFixed(2);

const stage = new StrokeStage(document.getElementById('canvas'), {
    fit: { width: 1.70, height: 1.0 },
});

let drawn = [];
let curve = 'natural';
let entry = null;
let colors = ['#2c3a5e', '#7a4a2f'];

function randomizeColors() {
    const palette = Palette.fromHues(
        Array.from({ length: 4 }, () => Math.random() * 360),
        { nLum: 5, lumHigh: 0.93, lumLow: 0.28, vibHigh: 0.95, vibLow: 0.30 }
    );
    const pick = list => list[Math.floor(Math.random() * list.length)];
    stage.setBackground(pick(palette.entries.filter(e => e.L > 0.85)).hex);

    const byHue = new Map();
    palette.entries.filter(e => e.L < 0.6).forEach(e => {
        if (!byHue.has(e.H)) byHue.set(e.H, []);
        byHue.get(e.H).push(e);
    });
    const groups = [...byHue.values()].sort(() => Math.random() - 0.5);
    return [pick(groups[0]).hex, pick(groups[1 % groups.length]).hex];
}

function refresh() {
    if (entry) {
        stage.remove(entry.mesh);
        entry.renderer.dispose(entry.mesh);
        entry = null;
    }
    if (drawn.length < 2) { stage.draw(); return; }

    const span = parseFloat(spanInput.value);
    const knots = resampleEvery(drawn, span);
    const smoothers = {
        natural: naturalSpline, hobby: hobbyCurve,
        catmull: catmullRomSpline, bspline: bSpline,
    };
    const smoothed = smoothers[curve](knots);
    if (smoothed.length < 2) { stage.draw(); return; }

    const renderer = new BrushStrokeRenderer({
        cap: 'ragged',
        colorA: colors[0],
        colorB: colors[1],
        samplesPerUnit: 90,
    });
    const def = new StrokeDef({
        points: smoothed,
        widthLeft: taper(parseFloat(widthInput.value)),
        renderer,
        seed: 3.7,
    });
    const mesh = def.build();
    mesh.position.z = 0.01;
    stage.add(mesh);
    entry = { mesh, renderer };

    const s = mesh.userData.stats;
    readout.innerHTML = `<div class="dp-stats">`
        + `<span>drawn points<strong>${drawn.length}</strong></span>`
        + `<span>knots<strong>${knots.length}</strong></span>`
        + `<span>vertices<strong>${s.vertexCount}</strong></span>`
        + `<span>triangles<strong>${s.triangleCount}</strong></span></div>`;

    stage.draw();
}

/** A starting line, so the page never opens empty. */
function randomLine() {
    const rand = seededRandom(23);
    const comps = Array.from({ length: 3 }, () => ({
        f: 1 + rand() * 3, p: rand() * Math.PI * 2, a: rand() * 0.5 + 0.15,
    }));
    const points = [];
    for (let i = 0; i < 160; i++) {
        const t = i / 159;
        let y = 0;
        for (const w of comps) y += Math.sin(t * Math.PI * 2 * w.f + w.p) * w.a;
        y += (rand() - 0.5) * 0.03;
        points.push(new THREE.Vector3(THREE.MathUtils.lerp(-1.5, 1.5, t), y * 0.45, 0));
    }
    return points;
}

const input = new DrawInput(document.getElementById('canvas'), stage, {
    onChange: points => { drawn = points; refresh(); },
});

curveSelect.addEventListener('change', () => {
    curve = curveSelect.value;
    refresh();
});

spanInput.addEventListener('input', () => {
    document.getElementById('span-val').textContent = parseFloat(spanInput.value).toFixed(2);
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
drawn = randomLine();
input.set(drawn);
refresh();
wireWireframeToggle(document.getElementById('wire-btn'), stage);
