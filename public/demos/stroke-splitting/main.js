import * as THREE from 'three';
import { resampleEvery, catmullRomSpline, splitByTurn } from '../../lib/curves.js';
import { StrokeStage } from '../../lib/demo/stage.js';
import { DrawInput } from '../../lib/demo/drawInput.js';

const COLORS = ['#2563c4', '#c4262e', '#0e8a5f', '#c47d10', '#7a3bc4'];
const DRAWN = '#b5b5b5';

const angleInput = document.getElementById('angle');
const windowInput = document.getElementById('window');
const spanInput = document.getElementById('span');
const cutsBtn = document.getElementById('cuts-btn');
const statsEl = document.getElementById('stats');

const stage = new StrokeStage(document.getElementById('canvas'));

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

const drawnLine = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: DRAWN })
);
drawnLine.position.z = 0.01;
drawnLine.frustumCulled = false;
stage.add(drawnLine);

const cutPoints = new THREE.Points(
    new THREE.BufferGeometry(),
    new THREE.PointsMaterial({ color: '#1a1a1a', size: 7, sizeAttenuation: false })
);
cutPoints.position.z = 0.04;
cutPoints.frustumCulled = false;
stage.add(cutPoints);

// One line object per split stroke, created as the count demands.
let runLines = [];
function runLine(index) {
    while (runLines.length <= index) {
        const line = new THREE.Line(
            new THREE.BufferGeometry(),
            new THREE.LineBasicMaterial({ color: COLORS[runLines.length % COLORS.length] })
        );
        line.position.z = 0.02;
        line.frustumCulled = false;
        stage.add(line);
        runLines.push(line);
    }
    return runLines[index];
}

let drawn = [];

function refresh() {
    setPoints(drawnLine, drawn);

    const angle = parseFloat(angleInput.value) * Math.PI / 180;
    const span = parseFloat(windowInput.value);
    const smooth = parseFloat(spanInput.value);
    const runs = splitByTurn(drawn, { angle, span });

    for (let i = 0; i < runs.length; i++) {
        const knots = resampleEvery(runs[i], smooth);
        const path = knots.length >= 3 ? catmullRomSpline(knots, 16) : runs[i];
        setPoints(runLine(i), path);
        runLine(i).visible = true;
    }
    for (let i = runs.length; i < runLines.length; i++) runLines[i].visible = false;

    setPoints(cutPoints, runs.slice(1).map(r => r[0]));

    statsEl.innerHTML = `<span>strokes<strong>${runs.length}</strong></span>`
        + `<span>cuts<strong>${runs.length - 1}</strong></span>`;
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
    onChange: points => {
        drawn = points;
        refresh();
    },
});

for (const el of [angleInput, windowInput, spanInput]) {
    el.addEventListener('input', () => {
        document.getElementById(`${el.id}-val`).textContent =
            el.id === 'angle' ? el.value : parseFloat(el.value).toFixed(2);
        refresh();
    });
}
cutsBtn.addEventListener('click', () => {
    cutPoints.visible = !cutPoints.visible;
    cutsBtn.classList.toggle('active', cutPoints.visible);
    stage.draw();
});

stage.onResize(() => refresh());
drawn = zigzag();
input.set(drawn);
refresh();
