import * as THREE from 'three';
import { StrokeDef } from '../../../lib/StrokeDef.js';
import { PIXELS_PER_UNIT } from '../../../lib/CanvasBuffer.js';
import { TubeStrokeRenderer } from '../../../lib/renderers/TubeStrokeRenderer.js';
import { StrokeStage } from '../../../lib/demo/stage.js';
import { wireCollapsibles, wireWireframeToggle } from '../../../lib/demo/panel.js';

// A deterministic grid of bends for the tube renderer. Every cell runs straight, curves
// through a single circular arc, then runs straight again. Columns vary the turn angle;
// rows vary the bend radius, gentle at the top and sharp at the bottom. Nothing is random,
// so a fold can be named by its cell (row, column) and reproduced exactly.
const COLS = 4;
const ROWS = 4;
const PHI_COLS = [90, 135, 180, 225];      // turn angle in degrees, per column
const R_ROWS = [0.22, 0.14, 0.09, 0.055];  // bend radius in world units, per row
const COL_GAP = 0.9;
const ROW_GAP = 0.66;
const TAIL_MUL = 1.3;                       // straight tail length as a multiple of the radius

const COLORS = { a: '#7a3b6b', b: '#2f6d86', candy: ['#c22a4a', '#f0e6da', '#2a7a5a', '#f0c040'] };

const ctrl = {
    width: document.getElementById('width'),
    depth: document.getElementById('depth'),
    twist: document.getElementById('twist'),
    density: document.getElementById('density'),
    wobble: document.getElementById('wobble'),
};
const modeSel = document.getElementById('mode');
const labelBox = document.getElementById('labels');

const stage = new StrokeStage(document.getElementById('canvas'), { background: '#f2eee8' });

let entries = [];
let showNormals = false;
let showSpine = false;

const colX = c => (c - (COLS - 1) / 2) * COL_GAP;
const rowY = r => ((ROWS - 1) / 2 - r) * ROW_GAP;
const cellSeed = (r, c) => 1 + r * 0.31 + c * 0.07;

// A symmetric bend: a straight tail, a circular arc turning by `turnDeg`, then a straight
// tail, recentered on (cx, cy). The arc turns from heading -phi/2 to +phi/2 about a center
// above it, so the bottom of the arc opens upward and the tails leave to the sides.
function bendSpine(cx, cy, R, turnDeg) {
    const phi = turnDeg * Math.PI / 180;
    const half = phi / 2;
    const tail = TAIL_MUL * R;
    const nTail = 6;
    const arcPts = Math.max(8, Math.round(turnDeg / 6));
    const local = [];
    const startH = -half;
    const startP = [R * Math.sin(startH), -R * Math.cos(startH)];
    for (let k = nTail; k >= 1; k--) {
        const d = tail * (k / nTail);
        local.push([startP[0] - Math.cos(startH) * d, startP[1] - Math.sin(startH) * d]);
    }
    for (let k = 0; k <= arcPts; k++) {
        const th = startH + phi * (k / arcPts);
        local.push([R * Math.sin(th), -R * Math.cos(th)]);
    }
    const endH = half;
    const endP = [R * Math.sin(endH), -R * Math.cos(endH)];
    for (let k = 1; k <= nTail; k++) {
        const d = tail * (k / nTail);
        local.push([endP[0] + Math.cos(endH) * d, endP[1] + Math.sin(endH) * d]);
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of local) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    const ox = (minX + maxX) / 2, oy = (minY + maxY) / 2;
    return local.map(([x, y]) => new THREE.Vector3(cx + x - ox, cy + y - oy, 0));
}

function makeRenderer(seed) {
    const common = {
        showNormals,
        depth: parseFloat(ctrl.depth.value),
        twist: parseFloat(ctrl.twist.value),
        samplesPerUnit: parseFloat(ctrl.density.value),
        seed,
    };
    if (modeSel.value === 'candy') {
        return new TubeStrokeRenderer({ ...common, mode: 'candy', colors: COLORS.candy, stripes: 5 });
    }
    return new TubeStrokeRenderer({
        ...common, mode: 'wobble', colorA: COLORS.a, colorB: COLORS.b,
        wobbleAmount: parseFloat(ctrl.wobble.value),
    });
}

function rebuild() {
    entries.forEach(({ mesh, spine }) => {
        stage.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
        if (spine) { stage.remove(spine); spine.geometry.dispose(); spine.material.dispose(); }
    });
    entries = [];
    labelBox.innerHTML = '';

    const width = parseFloat(ctrl.width.value) / PIXELS_PER_UNIT;

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const R = R_ROWS[r];
            const seed = cellSeed(r, c);
            const points = bendSpine(colX(c), rowY(r), R, PHI_COLS[c]);
            const def = new StrokeDef({ points, widthLeft: width, renderer: makeRenderer(seed), seed });
            const mesh = def.build();
            stage.add(mesh);

            // The centerline actually built, after the renderer eases it to the tube's
            // curvature limit: the raw drawn path and the eased one both matter here.
            let spine = null;
            const samples = mesh.userData.samples;
            if (samples && samples.length > 1) {
                const geom = new THREE.BufferGeometry().setFromPoints(
                    samples.map(p => new THREE.Vector3(p.x, p.y, p.z)));
                spine = new THREE.Line(geom, new THREE.LineBasicMaterial(
                    { color: '#ffd000', depthTest: false, depthWrite: false }));
                spine.renderOrder = 20;
                spine.userData.overlay = true;
                spine.visible = showSpine;
                stage.add(spine);
            }

            const label = document.createElement('div');
            label.className = 'tc-label';
            const rho = (width / R).toFixed(2);
            label.innerHTML = `<span>φ${PHI_COLS[c]}°</span><span>ρ${rho}</span>`;
            labelBox.appendChild(label);
            entries.push({ mesh, spine, label, cx: colX(c), cy: rowY(r) - ROW_GAP * 0.46 });
        }
    }
    positionLabels();
    stage.draw();
}

// Labels sit under each bend, placed by mapping world to CSS pixels (the world is fixed to
// PIXELS_PER_UNIT), so they track the bends across a resize.
function positionLabels() {
    const cw = stage.viewport.width, ch = stage.viewport.height;
    for (const e of entries) {
        e.label.style.left = `${cw / 2 + e.cx * PIXELS_PER_UNIT}px`;
        e.label.style.top = `${ch / 2 - e.cy * PIXELS_PER_UNIT}px`;
    }
}

Object.values(ctrl).forEach(el => {
    el.addEventListener('input', () => {
        const dec = el.id === 'depth' || el.id === 'wobble' ? 2 : (el.id === 'twist' ? 1 : 0);
        document.getElementById(`${el.id}-val`).textContent = parseFloat(el.value).toFixed(dec);
        rebuild();
    });
});
modeSel.addEventListener('change', rebuild);

wireWireframeToggle(document.getElementById('wire-btn'), stage);
document.getElementById('normals-btn').addEventListener('click', e => {
    showNormals = !showNormals;
    e.currentTarget.classList.toggle('active', showNormals);
    rebuild();
});
document.getElementById('spine-btn').addEventListener('click', e => {
    showSpine = !showSpine;
    e.currentTarget.classList.toggle('active', showSpine);
    entries.forEach(({ spine }) => { if (spine) spine.visible = showSpine; });
    stage.draw();
});

stage.onResize(positionLabels);
wireCollapsibles();
rebuild();
