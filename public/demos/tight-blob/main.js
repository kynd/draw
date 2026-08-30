import * as THREE from 'three';
import { resampleEvery, catmullRomSpline, bSpline } from '../../lib/curves.js';
import { offsetOutline } from '../../lib/pathEffects.js';
import { seededRandom } from '../../lib/random.js';
import { Palette } from '../../lib/Palette.js';
import { StrokeStage } from '../../lib/demo/stage.js';
import { DrawInput } from '../../lib/demo/drawInput.js';
import { wireWireframeToggle } from '../../lib/demo/panel.js';

const radiusInput = document.getElementById('radius');
const spanInput = document.getElementById('span');
const curveSelect = document.getElementById('curve-select');

const stage = new StrokeStage(document.getElementById('canvas'));

let drawn = [];
let curve = 'bspline';
let fill = null;
let colors = { fill: '#5a6a8a' };

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
    colors = { fill: pick(mid.length ? mid : palette.entries).hex };
}

function refresh(done = false) {
    if (fill) {
        stage.remove(fill);
        fill.geometry.dispose();
        fill.material.dispose();
        fill = null;
    }
    setLine(pointerLine, done ? [] : drawn);
    if (drawn.length < 2) { stage.draw(); return; }

    const radius = parseFloat(radiusInput.value);
    const span = parseFloat(spanInput.value);

    // The path is first closed into a smooth loop, so the result is always an
    // enclosed mass rather than a tube along the stroke. The offset field does not
    // care if the closure crosses the stroke, so any gesture closes safely.
    const knots = resampleEvery(drawn, span);
    if (knots.length > 3 && knots[knots.length - 1].distanceTo(knots[0]) < span * 0.5) {
        knots.pop();
    }
    const closer = curve === 'catmull' ? catmullRomSpline : bSpline;
    const loop0 = knots.length >= 3 ? closer(knots, 8, true) : drawn;

    const contour = offsetOutline(loop0, radius);
    if (contour.length < 3) { stage.draw(); return; }

    const perimeter = resampleEvery([...contour, contour[0]], span);
    if (perimeter.length > 3
        && perimeter[perimeter.length - 1].distanceTo(perimeter[0]) < span * 0.5) {
        perimeter.pop();
    }
    if (perimeter.length < 3) { stage.draw(); return; }

    // The contour already sits `radius` out from the path, so smoothing has room to
    // cut inward without excluding any drawn point. No outward pad needed.
    const smoother = curve === 'catmull' ? catmullRomSpline : bSpline;
    const loop = smoother(perimeter, 12, true);

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

/** A starting scribble with a concavity, so the tight fit is visible on load. */
function startingLine() {
    const points = [];
    for (let i = 0; i < 100; i++) {
        const t = i / 99;
        const a = t * Math.PI * 1.6 - Math.PI * 0.3;
        points.push(new THREE.Vector3(
            Math.cos(a) * (0.9 - 0.35 * t) - 0.1,
            Math.sin(a) * (0.62 - 0.25 * t),
            0
        ));
    }
    return points;
}

const input = new DrawInput(document.getElementById('canvas'), stage, {
    onChange: (points, done) => { drawn = points; refresh(done); },
});

for (const [el, digits] of [[radiusInput, 2], [spanInput, 2]]) {
    el.addEventListener('input', () => {
        document.getElementById(`${el.id}-val`).textContent = parseFloat(el.value).toFixed(digits);
        refresh(true);
    });
}
curveSelect.addEventListener('change', () => {
    curve = curveSelect.value;
    refresh(true);
});
document.getElementById('random-btn').addEventListener('click', () => {
    randomizeColors();
    refresh(true);
});

wireWireframeToggle(document.getElementById('wire-btn'), stage);
stage.onResize(() => refresh(true));
randomizeColors();
drawn = startingLine();
input.set(drawn);
refresh(true);
