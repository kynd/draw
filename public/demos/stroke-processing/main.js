import * as THREE from 'three';
import { resampleEvery, naturalSpline, hobbyCurve } from '../../lib/curves.js';
import { seededRandom } from '../../lib/random.js';
import { StrokeStage } from '../../lib/demo/stage.js';
import { DrawInput } from '../../lib/demo/drawInput.js';
import { wireCollapsibles } from '../../lib/demo/panel.js';

const COLORS = { drawn: '#8a8a8a', natural: '#2563c4', hobby: '#c43a2f', knots: '#1a1a1a' };
const MIN_POINT_DISTANCE = 0.008;

const DEFAULT_SPAN = 0.5;

const readout = document.getElementById('readout');
const spanInput = document.getElementById('span');
const knotsBtn = document.getElementById('knots-btn');

// Set from script, not only from the markup: browsers restore a slider's previous
// value across reloads, which silently overrides a changed default.
spanInput.value = String(DEFAULT_SPAN);
document.getElementById('span-val').textContent = DEFAULT_SPAN.toFixed(2);

const stage = new StrokeStage(document.getElementById('canvas'), {
    fit: { width: 1.70, height: 1.0 },
});

// ── Lines ────────────────────────────────────────────────────────────────────
// THREE.Line draws 1 pixel wide whatever the world scale, which is the point: the
// drawn path is shown exactly, not rendered as a stroke.

function makeLine(color, z) {
    const line = new THREE.Line(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({ color })
    );
    line.position.z = z;
    line.frustumCulled = false;
    stage.add(line);
    return line;
}

const drawnLine = makeLine(COLORS.drawn, 0.01);
const naturalLine = makeLine(COLORS.natural, 0.02);
const hobbyLine = makeLine(COLORS.hobby, 0.03);
const knotPoints = new THREE.Points(
    new THREE.BufferGeometry(),
    new THREE.PointsMaterial({ color: COLORS.knots, size: 5, sizeAttenuation: false })
);
knotPoints.position.z = 0.04;
knotPoints.frustumCulled = false;
stage.add(knotPoints);

function setPoints(object, points) {
    object.geometry.dispose();
    const geometry = new THREE.BufferGeometry();
    const array = new Float32Array(points.length * 3);
    points.forEach((p, i) => {
        array[i * 3] = p.x;
        array[i * 3 + 1] = p.y;
        array[i * 3 + 2] = 0;
    });
    geometry.setAttribute('position', new THREE.BufferAttribute(array, 3));
    object.geometry = geometry;
}

// ── The path and its smoothed versions ───────────────────────────────────────

let drawn = [];

function refresh() {
    setPoints(drawnLine, drawn);

    const span = parseFloat(spanInput.value);
    const knots = resampleEvery(drawn, span);
    setPoints(knotPoints, knots);
    setPoints(naturalLine, naturalSpline(knots));
    setPoints(hobbyLine, hobbyCurve(knots));

    readout.innerHTML = `<div class="dp-stats">`
        + `<span>drawn points<strong>${drawn.length}</strong></span>`
        + `<span>knots<strong>${knots.length}</strong></span>`
        + `<span>span<strong>${span.toFixed(2)}</strong></span></div>`;

    stage.draw();
}

/** A starting line, so the page never opens empty. */
function randomLine() {
    const rand = seededRandom(11);
    const comps = Array.from({ length: 3 }, () => ({
        f: 1 + rand() * 3, p: rand() * Math.PI * 2, a: rand() * 0.5 + 0.15,
    }));
    const points = [];
    for (let i = 0; i < 160; i++) {
        const t = i / 159;
        let y = 0;
        for (const w of comps) y += Math.sin(t * Math.PI * 2 * w.f + w.p) * w.a;
        // A little jitter, so the raw line is visibly rougher than its smoothings.
        y += (rand() - 0.5) * 0.03;
        points.push(new THREE.Vector3(
            THREE.MathUtils.lerp(-1.5, 1.5, t),
            y * 0.45,
            0
        ));
    }
    return points;
}

// ── Drawing ──────────────────────────────────────────────────────────────────

const input = new DrawInput(document.getElementById('canvas'), stage, {
    minDistance: MIN_POINT_DISTANCE,
    onChange: points => { drawn = points; refresh(); },
});

// ── Controls ─────────────────────────────────────────────────────────────────

spanInput.addEventListener('input', () => {
    document.getElementById('span-val').textContent = parseFloat(spanInput.value).toFixed(2);
    refresh();
});

knotsBtn.addEventListener('click', () => {
    knotPoints.visible = !knotPoints.visible;
    knotsBtn.classList.toggle('active', knotPoints.visible);
    stage.draw();
});

stage.onResize(() => refresh());
wireCollapsibles();
drawn = randomLine();
input.set(drawn);
refresh();
