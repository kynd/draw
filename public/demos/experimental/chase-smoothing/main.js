import * as THREE from 'three';
import { PIXELS_PER_UNIT } from '../../../lib/CanvasBuffer.js';
import { ChaseSmoother } from '../../../lib/curves.js';
import { seededRandom } from '../../../lib/random.js';
import { StrokeStage } from '../../../lib/demo/stage.js';
import { DrawInput } from '../../../lib/demo/drawInput.js';
import { wireCollapsibles } from '../../../lib/demo/panel.js';

const COLORS = { drawn: '#b0b0b0', chase: '#2a7a5a' };
const MIN_POINT_DISTANCE = 0.008;
const DEFAULT_RADIUS = 60; // pixels

const readout = document.getElementById('readout');
const radiusInput = document.getElementById('radius');
radiusInput.value = String(DEFAULT_RADIUS);
document.getElementById('radius-val').textContent = DEFAULT_RADIUS;

const stage = new StrokeStage(document.getElementById('canvas'));

function makeLine(color, z, width = 1) {
    const line = new THREE.Line(new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({ color, linewidth: width }));
    line.position.z = z;
    line.frustumCulled = false;
    stage.add(line);
    return line;
}

const drawnLine = makeLine(COLORS.drawn, 0.01);
const chaseLine = makeLine(COLORS.chase, 0.02);

function setPoints(object, points) {
    object.geometry.dispose();
    const array = new Float32Array(points.length * 3);
    points.forEach((p, i) => { array[i * 3] = p.x; array[i * 3 + 1] = p.y; array[i * 3 + 2] = 0; });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(array, 3));
    object.geometry = geometry;
}

let drawn = [];
const chaser = new ChaseSmoother({ radius: DEFAULT_RADIUS / PIXELS_PER_UNIT });
const currentRadius = () => parseFloat(radiusInput.value) / PIXELS_PER_UNIT;

function render(chased) {
    setPoints(drawnLine, drawn);
    setPoints(chaseLine, chased);
    readout.innerHTML = `<div class="dp-stats">`
        + `<span>drawn points<strong>${drawn.length}</strong></span>`
        + `<span>chased points<strong>${chased.length}</strong></span>`
        + `<span>radius<strong>${Math.round(currentRadius() * PIXELS_PER_UNIT)}px</strong></span></div>`;
    stage.draw();
}

// A full recompute over the static path, for the slider, resize, and the default line.
function recompute() {
    chaser.setRadius(currentRadius());
    chaser.reset();
    render(chaser.feed(drawn, true));
}

/** A default path: a jittery run into a sharp corner, so the rounding is visible. */
function defaultPath() {
    const rand = seededRandom(7);
    const pts = [];
    const push = (x, y) => pts.push(new THREE.Vector3(x + (rand() - 0.5) * 0.05, y + (rand() - 0.5) * 0.05, 0));
    for (let i = 0; i <= 60; i++) { const t = i / 60; push(THREE.MathUtils.lerp(-1.4, 0.2, t), THREE.MathUtils.lerp(-0.6, 0.7, t)); }
    for (let i = 1; i <= 60; i++) { const t = i / 60; push(THREE.MathUtils.lerp(0.2, 1.4, t), THREE.MathUtils.lerp(0.7, -0.5, t)); }
    return pts;
}

// Live drawing: the chaser is stateful, so the tip only extends forward. A fresh
// press resets it; each move feeds the growing points and commits new tip progress;
// moving the pointer back leaves no forward target, so the tip holds where it is.
const input = new DrawInput(document.getElementById('canvas'), stage, {
    minDistance: MIN_POINT_DISTANCE,
    onChange: (points, done) => {
        if (points.length === 1) { chaser.setRadius(currentRadius()); chaser.reset(); }
        drawn = points;
        render(chaser.feed(points, done));
    },
});

radiusInput.addEventListener('input', () => {
    document.getElementById('radius-val').textContent = Math.round(parseFloat(radiusInput.value));
    recompute();
});

stage.onResize(() => recompute());
wireCollapsibles();
drawn = defaultPath();
input.set(drawn);
recompute();
