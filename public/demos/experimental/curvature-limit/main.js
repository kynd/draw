import * as THREE from 'three';
import { PIXELS_PER_UNIT } from '../../../lib/CanvasBuffer.js';
import { smoothByCurvatureLimit, curvatureStats } from '../../../lib/curves.js';
import { seededRandom } from '../../../lib/random.js';
import { StrokeStage } from '../../../lib/demo/stage.js';
import { DrawInput } from '../../../lib/demo/drawInput.js';
import { wireCollapsibles } from '../../../lib/demo/panel.js';

const COLORS = { drawn: '#b0b0b0', limited: '#2a7a5a', bad: '#c43a2f' };
const MIN_POINT_DISTANCE = 0.008;
const DEFAULT_RADIUS = 60;   // pixels
const DEFAULT_PASSES = 60;

const readout = document.getElementById('readout');
const radiusInput = document.getElementById('radius');
const passesInput = document.getElementById('passes');
radiusInput.value = String(DEFAULT_RADIUS);
passesInput.value = String(DEFAULT_PASSES);
document.getElementById('radius-val').textContent = DEFAULT_RADIUS;
document.getElementById('passes-val').textContent = DEFAULT_PASSES;

const stage = new StrokeStage(document.getElementById('canvas'));

function makeLine(color, z) {
    const line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color }));
    line.position.z = z; line.frustumCulled = false; stage.add(line);
    return line;
}

const drawnLine = makeLine(COLORS.drawn, 0.01);
const limitLine = makeLine(COLORS.limited, 0.02);
const badPoints = new THREE.Points(new THREE.BufferGeometry(),
    new THREE.PointsMaterial({ color: COLORS.bad, size: 7, sizeAttenuation: false }));
badPoints.position.z = 0.03; badPoints.frustumCulled = false; stage.add(badPoints);

function setPoints(object, points) {
    object.geometry.dispose();
    const array = new Float32Array(points.length * 3);
    points.forEach((p, i) => { array[i * 3] = p.x; array[i * 3 + 1] = p.y; array[i * 3 + 2] = 0; });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(array, 3));
    object.geometry = geometry;
}

let drawn = [];
const currentRadius = () => parseFloat(radiusInput.value) / PIXELS_PER_UNIT;
const currentPasses = () => parseInt(passesInput.value, 10);

function refresh() {
    setPoints(drawnLine, drawn);
    const radius = currentRadius();
    const limited = smoothByCurvatureLimit(drawn, { radius, passes: currentPasses() });
    setPoints(limitLine, limited);

    const { minR, marks } = curvatureStats(limited, radius);
    setPoints(badPoints, marks);

    const minPx = Math.round(minR * PIXELS_PER_UNIT);
    readout.innerHTML = `<div class="dp-stats">`
        + `<span>target radius<strong>${Math.round(radius * PIXELS_PER_UNIT)}px</strong></span>`
        + `<span>tightest radius<strong>${isFinite(minPx) ? minPx + 'px' : '∞'}</strong></span>`
        + `<span>over the limit<strong>${marks.length}</strong></span></div>`;
    stage.draw();
}

/** A default path: a jittery run into a sharp corner, so the limiting is visible. */
function defaultPath() {
    const rand = seededRandom(7);
    const pts = [];
    const push = (x, y) => pts.push(new THREE.Vector3(x + (rand() - 0.5) * 0.05, y + (rand() - 0.5) * 0.05, 0));
    for (let i = 0; i <= 60; i++) { const t = i / 60; push(THREE.MathUtils.lerp(-1.4, 0.2, t), THREE.MathUtils.lerp(-0.6, 0.7, t)); }
    for (let i = 1; i <= 60; i++) { const t = i / 60; push(THREE.MathUtils.lerp(0.2, 1.4, t), THREE.MathUtils.lerp(0.7, -0.5, t)); }
    return pts;
}

const input = new DrawInput(document.getElementById('canvas'), stage, {
    minDistance: MIN_POINT_DISTANCE,
    onChange: points => { drawn = points; refresh(); },
});

radiusInput.addEventListener('input', () => {
    document.getElementById('radius-val').textContent = Math.round(parseFloat(radiusInput.value));
    refresh();
});
passesInput.addEventListener('input', () => {
    document.getElementById('passes-val').textContent = parseInt(passesInput.value, 10);
    refresh();
});

stage.onResize(() => refresh());
wireCollapsibles();
drawn = defaultPath();
input.set(drawn);
refresh();
