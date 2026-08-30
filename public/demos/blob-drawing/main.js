import * as THREE from 'three';
import { resampleEvery, catmullRomSpline, bSpline } from '../../lib/curves.js';
import { convexHull } from '../../lib/pathEffects.js';
import { seededRandom } from '../../lib/random.js';
import { Palette } from '../../lib/Palette.js';
import { StrokeStage } from '../../lib/demo/stage.js';
import { wireWireframeToggle } from '../../lib/demo/panel.js';
import { DrawInput } from '../../lib/demo/drawInput.js';

const DEFAULT_SPAN = 0.4;

const spanInput = document.getElementById('span');
const curveSelect = document.getElementById('curve-select');

spanInput.value = String(DEFAULT_SPAN);
document.getElementById('span-val').textContent = DEFAULT_SPAN.toFixed(2);

const stage = new StrokeStage(document.getElementById('canvas'));

let drawn = [];
let curve = 'bspline';
let fill = null;
let colors = { fill: '#5a6a8a', line: '#2c3448' };

// The pointer's own path, shown while drawing and gone on release.
const pointerLine = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: '#000000' })
);
pointerLine.position.z = 0.06;
pointerLine.frustumCulled = false;
stage.add(pointerLine);

function setLine(object, points) {
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

function randomizeColors() {
    const palette = Palette.fromHues(
        Array.from({ length: 4 }, () => Math.random() * 360),
        { nLum: 5, lumHigh: 0.92, lumLow: 0.3, vibHigh: 0.95, vibLow: 0.3 }
    );
    const pick = list => list[Math.floor(Math.random() * list.length)];
    stage.setBackground(pick(palette.entries.filter(e => e.L > 0.82)).hex);
    const mid = palette.entries.filter(e => e.L > 0.4 && e.L < 0.75);
    const dark = palette.entries.filter(e => e.L < 0.4);
    colors = {
        fill: pick(mid.length ? mid : palette.entries).hex,
        line: pick(dark.length ? dark : palette.entries).hex,
    };
}

function refresh(done = false) {
    if (fill) {
        stage.remove(fill);
        fill.geometry.dispose();
        fill.material.dispose();
        fill = null;
    }
    setLine(pointerLine, done ? [] : drawn);
    if (drawn.length < 3) { stage.draw(); return; }

    const span = Math.max(parseFloat(spanInput.value), 0.05);

    // The blob encloses the whole gesture: the hull is the smallest convex region
    // containing every drawn point, resampled around its perimeter for even knots.
    const hull = convexHull(drawn);
    if (hull.length < 3) { stage.draw(); return; }
    const perimeter = resampleEvery([...hull, hull[0]], span);
    if (perimeter.length > 3
        && perimeter[perimeter.length - 1].distanceTo(perimeter[0]) < span * 0.5) {
        perimeter.pop();
    }
    if (perimeter.length < 3) { stage.draw(); return; }

    // Smoothing cuts inside the hull, so each knot is pushed out along its edge
    // normal far enough that the curve still contains every point.
    const m = perimeter.length;
    const knots = perimeter.map((p, i) => {
        const prev = perimeter[(i - 1 + m) % m];
        const next = perimeter[(i + 1) % m];
        const dx = next.x - prev.x, dy = next.y - prev.y;
        const len = Math.hypot(dx, dy) || 1;
        // The hull is counterclockwise, so the outward normal is the right-hand one.
        return new THREE.Vector3(
            p.x + (dy / len) * span * 0.3,
            p.y - (dx / len) * span * 0.3,
            0
        );
    });

    const smoother = curve === 'catmull' ? catmullRomSpline : bSpline;
    const loop = smoother(knots, 12, true);

    const shape = new THREE.Shape();
    shape.moveTo(loop[0].x, loop[0].y);
    for (let i = 1; i < loop.length; i++) shape.lineTo(loop[i].x, loop[i].y);
    shape.closePath();

    fill = new THREE.Mesh(
        new THREE.ShapeGeometry(shape),
        new THREE.MeshBasicMaterial({ color: colors.fill, side: THREE.DoubleSide })
    );
    fill.position.z = 0.02;
    fill.userData.wire = true;
    stage.add(fill);

    stage.draw();
}

/** A starting blob, so the page never opens empty. */
function startingLine() {
    const rand = seededRandom(31);
    const points = [];
    for (let i = 0; i < 90; i++) {
        const a = (i / 90) * Math.PI * 1.7;
        const r = 0.55 + 0.2 * Math.sin(a * 3 + rand() * 6) + (rand() - 0.5) * 0.04;
        points.push(new THREE.Vector3(Math.cos(a) * r * 1.2, Math.sin(a) * r - 0.05, 0));
    }
    return points;
}

const input = new DrawInput(document.getElementById('canvas'), stage, {
    onChange: (points, done) => { drawn = points; refresh(done); },
});

spanInput.addEventListener('input', () => {
    document.getElementById('span-val').textContent = parseFloat(spanInput.value).toFixed(2);
    refresh(true);
});
curveSelect.addEventListener('change', () => {
    curve = curveSelect.value;
    refresh(true);
});
document.getElementById('random-btn').addEventListener('click', () => {
    randomizeColors();
    refresh(true);
});

stage.onResize(() => refresh(true));
randomizeColors();
drawn = startingLine();
input.set(drawn);
refresh(true);
wireWireframeToggle(document.getElementById('wire-btn'), stage);
