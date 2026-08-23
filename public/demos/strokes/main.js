import * as THREE from 'three';
import { StrokeDef } from '../../lib/StrokeDef.js';
import { RibbonStrokeRenderer } from '../../lib/renderers/RibbonStrokeRenderer.js';
import { CanvasBuffer } from '../../lib/CanvasBuffer.js';
import { Palette } from '../../lib/Palette.js';
import { Viewport } from '../../lib/demo/viewport.js';
import { wireCollapsibles } from '../../lib/demo/panel.js';

// The strokes are 2D. Z carries no shape. It stacks the three strokes against the
// paper and against each other, and rises slightly within each one.
const Z_BASE = 0.002;
const Z_STEP = 0.010;
const Z_RISE = 0.004;

const CONTROL_POINTS = 64;
const STRAIGHT_UNTIL = 0.30;   // fraction of the path that stays flat
const WIGGLE_END = 0.62;       // where the wiggle reaches full amplitude

const AMPLITUDE = 0.34;

const STROKES = [
    { cap: 'rounded', seed: 1.0 },
    { cap: 'square',  seed: 2.3 },
    { cap: 'ragged',  seed: 5.1 },
];

/**
 * Half the distance between adjacent stroke centers, chosen so the margin above the
 * top stroke is twice the gap between two strokes.
 *
 * The strokes run in phase, so the gap between neighbours is constant along their whole
 * length and depends only on the spacing and the width. Solving
 * `H - (s + A + w) = 2(s - 2w)` for the spacing gives the expression below. It is
 * recomputed from the live frame height, so the ratio survives a resize.
 */
function spacing(halfHeight, width) {
    return (halfHeight - AMPLITUDE + 3 * width) / 3;
}

const centerY = (i, spread) =>
    STROKES.length === 1 ? 0 : THREE.MathUtils.lerp(spread, -spread, i / (STROKES.length - 1));

const canvas = document.getElementById('canvas');
const readout = document.getElementById('readout');
const densityInput = document.getElementById('density');
const densityVal = document.getElementById('density-val');
const widthInput = document.getElementById('width');
const widthVal = document.getElementById('width-val');
const spineBtn = document.getElementById('spine-btn');
const wireBtn = document.getElementById('wire-btn');
const randomBtn = document.getElementById('random-btn');

const viewport = new Viewport(canvas);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(viewport.pixelWidth, viewport.pixelHeight, false);
renderer.autoClear = false;

const buffer = new CanvasBuffer({
    width: viewport.pixelWidth,
    height: viewport.pixelHeight,
    background: '#ffffff',
    fit: { width: 1.70, height: 1.47 },
});

viewport.onResize((width, height) => {
    renderer.setSize(width, height, false);
    buffer.resize(width, height);
    // The layout is derived from the frame height, so a resize has to rebuild.
    rebuild(colors);
});

/**
 * A path that runs straight, then wiggles.
 *
 * The amplitude is held at zero until STRAIGHT_UNTIL and eased in with a smoothstep,
 * so the straight run and the curve belong to one continuous path rather than meeting
 * at a corner.
 */
function straightThenWiggle(yBase, index) {
    const points = [];
    for (let i = 0; i < CONTROL_POINTS; i++) {
        const t = i / (CONTROL_POINTS - 1);
        const ramp = THREE.MathUtils.smoothstep(t, STRAIGHT_UNTIL, WIGGLE_END);
        const phase = (t - STRAIGHT_UNTIL) * Math.PI * 4.4;
        const x = THREE.MathUtils.lerp(-1.52, 1.52, t);
        const y = yBase + ramp * AMPLITUDE * Math.sin(phase);
        const z = Z_BASE + index * Z_STEP + Z_RISE * t;
        points.push(new THREE.Vector3(x, y, z));
    }
    return points;
}

// A slight taper: widest across the middle, three quarters of that at either end,
// which leaves each cap wide enough to read as a shape.
const taper = width => t => width * (0.75 + 0.25 * Math.sin(Math.PI * t));

const capLabel = { rounded: 'rounded', square: 'square', ragged: 'ragged' };

let entries = [];
let showSpine = false;
let showWire = false;

/** Picks a light background and three darker stroke colors from one generated palette. */
function randomizeColors() {
    const hues = Array.from({ length: 4 }, () => Math.random() * 360);
    const palette = Palette.fromHues(hues, {
        nLum: 5, lumHigh: 0.93, lumLow: 0.32, vibHigh: 0.95, vibLow: 0.28,
    });

    const pick = list => list[Math.floor(Math.random() * list.length)];
    buffer.background.set(pick(palette.entries.filter(e => e.L > 0.80)).hex);

    // Group the dark end by hue and give each stroke a different group, so two strokes
    // never come back as near-identical shades of one hue.
    const byHue = new Map();
    palette.entries.filter(e => e.L < 0.62).forEach(e => {
        if (!byHue.has(e.H)) byHue.set(e.H, []);
        byHue.get(e.H).push(e);
    });
    const groups = [...byHue.values()].sort(() => Math.random() - 0.5);
    return STROKES.map((_, i) => pick(groups[i % groups.length]).hex);
}

function rebuild(colors) {
    entries.forEach(({ mesh, renderer: r, spine }) => {
        buffer.remove(mesh);
        r.dispose(mesh);
        if (spine) {
            buffer.remove(spine);
            spine.geometry.dispose();
            spine.material.dispose();
        }
    });
    entries = [];

    const density = parseInt(densityInput.value, 10);
    const width = parseFloat(widthInput.value);
    const spread = spacing(buffer.extentY, width);
    let samples = 0, vertices = 0, triangles = 0;
    const perStroke = [];

    STROKES.forEach((spec, i) => {
        const strokeRenderer = new RibbonStrokeRenderer({
            cap: spec.cap,
            color: colors[i],
            samplesPerUnit: density,
        });
        const def = new StrokeDef({
            points: straightThenWiggle(centerY(i, spread), i),
            widthLeft: taper(width),
            renderer: strokeRenderer,
            seed: spec.seed,
        });

        const mesh = def.build();
        mesh.material.wireframe = showWire;
        buffer.add(mesh);

        const pts = mesh.userData.samples;
        const positions = new Float32Array(pts.length * 3);
        pts.forEach((p, j) => {
            positions[j * 3] = p.x;
            positions[j * 3 + 1] = p.y;
            positions[j * 3 + 2] = Z_BASE + STROKES.length * Z_STEP + 0.005;
        });
        const spineGeo = new THREE.BufferGeometry();
        spineGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const spine = new THREE.Points(spineGeo, new THREE.PointsMaterial({
            color: '#d92b2b', size: 4, sizeAttenuation: false,
        }));
        spine.visible = showSpine;
        buffer.add(spine);

        const s = mesh.userData.stats;
        samples += s.sampleCount;
        vertices += s.vertexCount;
        triangles += s.triangleCount;
        perStroke.push({ cap: capLabel[spec.cap], ...s });
        entries.push({ mesh, renderer: strokeRenderer, spine });
    });

    const block = rows => `<div class="dp-stats">${rows}</div>`;
    readout.innerHTML =
        block(
            `<span>strokes<strong>${STROKES.length}</strong></span>` +
            `<span>samples<strong>${samples}</strong></span>` +
            `<span>vertices<strong>${vertices}</strong></span>` +
            `<span>triangles<strong>${triangles}</strong></span>`
        )
        + perStroke.map(p =>
            `<div class="dp-sub-label">${p.cap}</div>` +
            block(
                `<span>length<strong>${p.length.toFixed(2)}</strong></span>` +
                `<span>samples<strong>${p.sampleCount}</strong></span>` +
                `<span>vertices<strong>${p.vertexCount}</strong></span>` +
                `<span>triangles<strong>${p.triangleCount}</strong></span>`
            )
        ).join('');

    draw();
}

let pending = false;
function draw() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
        pending = false;
        buffer.render(renderer);
        buffer.present(renderer);
    });
}

let colors = randomizeColors();

densityInput.addEventListener('input', () => {
    densityVal.textContent = densityInput.value;
    rebuild(colors);
});

widthInput.addEventListener('input', () => {
    widthVal.textContent = parseFloat(widthInput.value).toFixed(3);
    rebuild(colors);
});

spineBtn.addEventListener('click', () => {
    showSpine = !showSpine;
    spineBtn.classList.toggle('active', showSpine);
    entries.forEach(e => { e.spine.visible = showSpine; });
    draw();
});

wireBtn.addEventListener('click', () => {
    showWire = !showWire;
    wireBtn.classList.toggle('active', showWire);
    entries.forEach(e => { e.mesh.material.wireframe = showWire; });
    draw();
});

randomBtn.addEventListener('click', () => {
    colors = randomizeColors();
    rebuild(colors);
});

wireCollapsibles();
rebuild(colors);
