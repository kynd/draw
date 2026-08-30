import * as THREE from 'three';
import { resampleEvery, catmullRomSpline, bSpline } from '../../lib/curves.js';
import { seededRandom } from '../../lib/random.js';
import { StrokeStage } from '../../lib/demo/stage.js';
import { DrawInput } from '../../lib/demo/drawInput.js';

const DEFAULT_SPAN = 0.5;
const COLORS = { drawn: '#8a8a8a', catmull: '#2563c4', bspline: '#0e8a5f', knots: '#1a1a1a' };

const spanInput = document.getElementById('span');
const knotsBtn = document.getElementById('knots-btn');
const stabilityEl = document.getElementById('stability');

spanInput.value = String(DEFAULT_SPAN);
document.getElementById('span-val').textContent = DEFAULT_SPAN.toFixed(2);

const stage = new StrokeStage(document.getElementById('canvas'));

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

const drawnLine = makeLine(COLORS.drawn, 0.01);
const catmullLine = makeLine(COLORS.catmull, 0.02);
const bsplineLine = makeLine(COLORS.bspline, 0.03);
const knotPoints = new THREE.Points(
    new THREE.BufferGeometry(),
    new THREE.PointsMaterial({ color: COLORS.knots, size: 5, sizeAttenuation: false })
);
knotPoints.position.z = 0.04;
knotPoints.frustumCulled = false;
stage.add(knotPoints);

let drawn = [];

// The settled-part movement between consecutive refreshes, per curve. The tail is
// excluded, since that is the part a local curve is allowed to change: two segments
// for the Catmull-Rom, four for the B-spline, whose clamped end reaches further back.
const SAMPLES_PER_SEGMENT = 16;
const TAIL_SEGMENTS = 4;
let previous = { catmull: null, bspline: null };
let settledMax = { catmull: 0, bspline: 0 };

function measure(name, points) {
    const prev = previous[name];
    previous[name] = points;
    if (!prev) return;
    const settled = Math.min(prev.length, points.length) - TAIL_SEGMENTS * SAMPLES_PER_SEGMENT;
    let jump = 0;
    for (let i = 0; i < settled; i += 2) {
        jump = Math.max(jump, points[i].distanceTo(prev[i]));
    }
    settledMax[name] = Math.max(settledMax[name], jump);
}

function refresh(reset = false) {
    if (reset) {
        previous = { catmull: null, bspline: null };
        settledMax = { catmull: 0, bspline: 0 };
    }
    setPoints(drawnLine, drawn);

    const span = parseFloat(spanInput.value);
    const knots = resampleEvery(drawn, span);
    setPoints(knotPoints, knots);

    const catmull = catmullRomSpline(knots, SAMPLES_PER_SEGMENT);
    const bspline = bSpline(knots, SAMPLES_PER_SEGMENT);
    measure('catmull', catmull);
    measure('bspline', bspline);
    setPoints(catmullLine, catmull);
    setPoints(bsplineLine, bspline);

    stabilityEl.innerHTML =
        `<span>Catmull-Rom<strong>${settledMax.catmull.toFixed(4)}</strong></span>`
        + `<span>B-spline<strong>${settledMax.bspline.toFixed(4)}</strong></span>`;

    stage.draw();
}

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
        y += (rand() - 0.5) * 0.03;
        points.push(new THREE.Vector3(THREE.MathUtils.lerp(-1.5, 1.5, t), y * 0.45, 0));
    }
    return points;
}

const input = new DrawInput(document.getElementById('canvas'), stage, {
    onChange: (points, done) => {
        const starting = points.length <= 1;
        drawn = points;
        refresh(starting);
    },
});

spanInput.addEventListener('input', () => {
    document.getElementById('span-val').textContent = parseFloat(spanInput.value).toFixed(2);
    refresh(true);
});
knotsBtn.addEventListener('click', () => {
    knotPoints.visible = !knotPoints.visible;
    knotsBtn.classList.toggle('active', knotPoints.visible);
    stage.draw();
});

stage.onResize(() => refresh(true));
drawn = randomLine();
input.set(drawn);
refresh(true);
