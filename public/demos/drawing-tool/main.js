import * as THREE from 'three';
import { StrokeDef } from '../../lib/StrokeDef.js';
import { Palette } from '../../lib/Palette.js';
import { PIXELS_PER_UNIT } from '../../lib/CanvasBuffer.js';
import { blobOutline } from '../../lib/pathEffects.js';
import { RibbonStrokeRenderer } from '../../lib/renderers/RibbonStrokeRenderer.js';
import { BrushStrokeRenderer } from '../../lib/renderers/BrushStrokeRenderer.js';
import { WatercolorStrokeRenderer } from '../../lib/renderers/WatercolorStrokeRenderer.js';
import { WetBrushStrokeRenderer } from '../../lib/renderers/WetBrushStrokeRenderer.js';
import { OilStrokeRenderer } from '../../lib/renderers/OilStrokeRenderer.js';
import { ChromeStrokeRenderer } from '../../lib/renderers/ChromeStrokeRenderer.js';
import { PixelStrokeRenderer } from '../../lib/renderers/PixelStrokeRenderer.js';
import { ShapedBlobRenderer } from '../../lib/renderers/ShapedBlobRenderer.js';
import { PaintBlobRenderer } from '../../lib/renderers/PaintBlobRenderer.js';
import { WashBlobRenderer } from '../../lib/renderers/WashBlobRenderer.js';
import { MaterialBlobRenderer } from '../../lib/renderers/MaterialBlobRenderer.js';
import { StoneBlobRenderer } from '../../lib/renderers/StoneBlobRenderer.js';
import { TubeStrokeRenderer } from '../../lib/renderers/TubeStrokeRenderer.js';
import { TriangleStrokeRenderer } from '../../lib/renderers/TriangleStrokeRenderer.js';
import { StrokeStage } from '../../lib/demo/stage.js';
import { DrawingBoard } from '../../lib/demo/drawingBoard.js';
import { setupDrawCycle } from '../../lib/demo/drawCycle.js';
import { taperByArc, scatterPath } from '../../lib/demo/strokePaths.js';
import { pressureAlong, pressureResponse, limitWidthSlope, averagePressure, pathArcLength } from '../../lib/demo/pressure.js';
import { Dial } from '../../lib/demo/dial.js';
import { FrameLatch } from '../../lib/demo/latch.js';
import { StrokeRecorder, replayRecords } from '../../lib/demo/strokeRecorder.js';
import { MidiInput } from '../../lib/demo/midi.js';

const PRESSURE_FLOOR = 0.15;

// ---------------------------------------------------------------------------
// Tools. Each entry lists the parameters it randomizes with their ranges; the
// width comes from the tool dial and is never randomized.
const registry = [
    { id: 'ribbon', kind: 'stroke', params: [{ key: 'axis', pick: ['along', 'across'] }],
        make: (v, ctx) => new RibbonStrokeRenderer({
            cap: 'rounded', color: ctx.colorA, gradient: ctx.colorB, gradientAxis: v.axis,
        }) },
    { id: 'ribbon-ragged', kind: 'stroke', params: [{ key: 'axis', pick: ['along', 'across'] }],
        make: (v, ctx) => new RibbonStrokeRenderer({
            cap: 'ragged', color: ctx.colorA, gradient: ctx.colorB, gradientAxis: v.axis,
        }) },
    { id: 'brush', kind: 'stroke',
        params: [{ key: 'bristles', min: 6, max: 50, step: 1 }, { key: 'rough', min: 0, max: 1 }, { key: 'dry', min: 0, max: 0.7 }],
        make: (v, ctx) => new BrushStrokeRenderer({
            cap: 'ragged', colorA: ctx.colorA, colorB: ctx.colorB,
            bristles: v.bristles, rough: v.rough, dry: v.dry,
        }) },
    { id: 'watercolor', kind: 'stroke',
        params: [{ key: 'pigment', min: 0.2, max: 1 }, { key: 'rim', min: 0, max: 1 }],
        make: (v, ctx) => new WatercolorStrokeRenderer({
            cap: 'rounded', color: ctx.colorA, background: ctx.texture, blurred: ctx.texture,
            pigment: v.pigment, rim: v.rim,
        }) },
    { id: 'wet-brush', kind: 'stroke',
        params: [{ key: 'drag', min: 10, max: 160 }, { key: 'pigment', min: 0.2, max: 1 }],
        make: (v, ctx) => new WetBrushStrokeRenderer({
            cap: 'rounded', color: ctx.colorA, background: ctx.texture, blurred: ctx.texture,
            drag: v.drag, pigment: v.pigment,
        }) },
    { id: 'oil', kind: 'stroke',
        params: [{ key: 'paint', min: 0.5, max: 1 }, { key: 'drag', min: 0, max: 120 }, { key: 'noise', min: 0.1, max: 1 }],
        make: (v, ctx) => new OilStrokeRenderer({
            cap: 'rounded', color: ctx.colorA, background: ctx.texture,
            paint: v.paint, drag: v.drag, noise: v.noise,
        }) },
    { id: 'chrome', kind: 'stroke',
        params: [{ key: 'noise', min: 0, max: 0.7 }, { key: 'specular', min: 0.3, max: 1.4 }],
        make: (v, ctx) => new ChromeStrokeRenderer({ cap: 'rounded', noise: v.noise, specular: v.specular }) },
    { id: 'pixels', kind: 'stroke',
        params: [{ key: 'cell', min: 0.02, max: 0.08 }, { key: 'jitter', min: 0, max: 0.4 }],
        make: (v, ctx) => new PixelStrokeRenderer({ cell: v.cell, jitter: v.jitter, colors: ctx.colors }) },
    { id: 'spiky-blob', kind: 'blob',
        params: [{ key: 'spikeAmp', min: 0.06, max: 0.3 }, { key: 'sharp', min: 1.5, max: 10 },
            { key: 'axis', pick: ['along', 'across'] }],
        make: (v, ctx) => {
            const [gradientFrom, gradientTo] = gradPoints(ctx, v.axis);
            return new ShapedBlobRenderer({
                color: ctx.colorA, colorB: ctx.colorB, gradientFrom, gradientTo,
                spikes: 14, spikeAmp: v.spikeAmp, sharp: v.sharp,
            });
        } },
    { id: 'knife-oil', kind: 'blob',
        params: [{ key: 'relief', min: 0.3, max: 1.5 }, { key: 'gloss', min: 0.1, max: 1.1 }],
        make: (v, ctx) => new PaintBlobRenderer({
            color: ctx.colorA, colorB: ctx.colorB, fade: 0.05, relief: v.relief, swell: 0.5,
            knife: true, split: 1, gloss: v.gloss, edgeSoft: 0.008, noiseFreq: 3.5,
        }) },
    { id: 'wash', kind: 'blob',
        params: [{ key: 'pigment', min: 0.3, max: 1 }, { key: 'wet', min: 0.1, max: 0.9 }, { key: 'flow', min: 0.01, max: 0.09 }],
        make: (v, ctx) => new WashBlobRenderer({
            color: ctx.colorA, background: ctx.texture,
            pigment: v.pigment, feather: 0.05, rim: 0.2, flow: v.flow, wet: v.wet,
        }) },
    { id: 'metal', kind: 'blob',
        params: [{ key: 'relief', min: 0.1, max: 0.9 }],
        make: (v, ctx) => new MaterialBlobRenderer({ mode: 'metal', relief: v.relief }) },
    { id: 'rock', kind: 'blob',
        params: [{ key: 'relief', min: 0.2, max: 1 }],
        make: (v, ctx) => new StoneBlobRenderer({
            mode: 'rock', color: ctx.colorA, colorB: ctx.colorB, relief: v.relief,
        }) },
    { id: 'tube-candy', kind: 'stroke',
        params: [{ key: 'twist', min: 1, max: 12 }, { key: 'stripes', min: 2, max: 10 }, { key: 'depth', min: 0.04, max: 0.24 }],
        make: (v, ctx) => new TubeStrokeRenderer({
            mode: 'candy', colors: ctx.colors.slice(0, 4),
            twist: v.twist, stripes: v.stripes, depth: v.depth,
        }) },
    { id: 'tube-wobble', kind: 'stroke',
        params: [{ key: 'twist', min: 1, max: 12 }, { key: 'wobbleFreq', min: 8, max: 20 }, { key: 'depth', min: 0.04, max: 0.24 }],
        make: (v, ctx) => new TubeStrokeRenderer({
            mode: 'wobble', colorA: ctx.colorA, colorB: ctx.colorB,
            twist: v.twist, wobbleFreq: v.wobbleFreq, depth: v.depth,
        }) },
    { id: 'tube-metal', kind: 'stroke',
        params: [{ key: 'twist', min: 1, max: 12 }, { key: 'bend', min: 0.2, max: 0.6 }, { key: 'depth', min: 0.04, max: 0.24 }],
        make: (v, ctx) => new TubeStrokeRenderer({
            mode: 'metal', background: ctx.texture, tint: ctx.tintLight,
            twist: v.twist, bend: v.bend, depth: v.depth,
        }) },
    { id: 'tri-facets', kind: 'stroke',
        params: [{ key: 'twist', min: 1, max: 12 }, { key: 'spacing', min: 0.35, max: 1.2 }, { key: 'depth', min: 0.04, max: 0.24 }],
        make: (v, ctx) => new TriangleStrokeRenderer({
            mode: 'facets', colorA: ctx.colorA,
            twist: v.twist, spacing: v.spacing, depth: v.depth,
        }) },
    { id: 'tri-grain', kind: 'stroke',
        params: [{ key: 'twist', min: 1, max: 12 }, { key: 'spacing', min: 0.35, max: 1.2 }, { key: 'depth', min: 0.04, max: 0.24 }],
        make: (v, ctx) => new TriangleStrokeRenderer({
            mode: 'grain', colorA: ctx.colorA, colorB: ctx.colorB,
            twist: v.twist, spacing: v.spacing, depth: v.depth,
        }) },
    { id: 'tri-metal', kind: 'stroke',
        params: [{ key: 'twist', min: 1, max: 12 }, { key: 'bend', min: 0.2, max: 0.6 }, { key: 'depth', min: 0.04, max: 0.24 }],
        make: (v, ctx) => new TriangleStrokeRenderer({
            mode: 'metal', background: ctx.texture, tint: ctx.tintLight,
            twist: v.twist, bend: v.bend, depth: v.depth,
        }) },
];


// The two world points a flat tool's gradient runs between: the drawn chord for
// 'along', its perpendicular through the middle for 'across'.
function gradPoints(ctx, axis) {
    const a = ctx.start, b = ctx.end;
    if (axis !== 'across') return [[a.x, a.y], [b.x, b.y]];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.max(Math.hypot(dx, dy), 0.2);
    const px = -dy / len, py = dx / len;
    const r = Math.max(len * 0.25, 0.15);
    return [[mx - px * r, my - py * r], [mx + px * r, my + py * r]];
}

function randomValues(entry) {
    return Object.fromEntries(entry.params.map(p => {
        if (p.pick) return [p.key, p.pick[Math.floor(Math.random() * p.pick.length)]];
        const v = p.min + Math.random() * (p.max - p.min);
        return [p.key, p.step >= 1 ? Math.round(v) : v];
    }));
}

// ---------------------------------------------------------------------------
// State: the current tool and everything a mark needs. `seedOverride` is set
// while a replayed record drives the cycle, so seeded looks reproduce.
const state = {
    tool: registry[0], values: {}, widthPx: 24, sens: 1,
    colorA: '#333333', colorB: '#666666', colors: ['#333333'],
    palette: null, seedOverride: null,
};
let replaying = false;

const stage = new StrokeStage(document.getElementById('canvas'));
const board = new DrawingBoard(stage);
const recorder = new StrokeRecorder();

function buildMark(path, points, seed) {
    maybeAutoReroll(points);
    const useSeed = state.seedOverride ?? seed;
    const ctx = {
        colorA: state.colorA, colorB: state.colorB, colors: state.colors,
        texture: board.texture, seed: useSeed,
        start: path[0], end: path[path.length - 1],
        tintLight: new THREE.Color(state.colorA).lerp(new THREE.Color('#ffffff'), 0.55).getStyle(),
    };
    const width = state.widthPx / PIXELS_PER_UNIT;
    const pressureAt = pressureAlong(points);
    if (state.tool.kind === 'blob') {
        const scale = 1 + state.sens * pressureResponse(averagePressure(points), 1, PRESSURE_FLOOR);
        const radius = Math.min(Math.max(width * 1.3 * scale, 0.05), 0.45);
        const contour = blobOutline(path, { span: 0.12, radius });
        if (!contour) return null;
        const renderer = state.tool.make(state.values, ctx);
        const mesh = renderer.build(contour, useSeed);
        mesh.position.z = 0.05;
        return { mesh, renderer };
    }
    const renderer = state.tool.make(state.values, ctx);
    const base = taperByArc(width, pathArcLength(path));
    const def = new StrokeDef({
        points: path.map(p => new THREE.Vector3(p.x, p.y, 0)),
        widthLeft: limitWidthSlope(path,
            s => base(s) * (1 + state.sens * pressureResponse(pressureAt(s), 1, PRESSURE_FLOOR))),
        renderer,
        seed: useSeed,
    });
    const mesh = def.build();
    mesh.position.z = 0.05;
    return { mesh, renderer };
}

// Auto randomize: with the toggle on, the colors and the whole tool (width,
// parameters, pressure sensitivity) reroll on every release, and again each
// time the pen travels the set number of pixels within a stroke.
let autoRandom = false;
let autoPx = 200;
let strokeRerollLen = 0;

function autoReroll() {
    const hueValue = Math.floor(Math.random() * 128);
    const toolValue = Math.floor(Math.random() * 128);
    dialHue.set(hueValue, false);
    dialTool.set(toolValue, false);
    newPalette(hueValue / 127 * 360);
    rerollTool(toolValue);
    refreshPreview();
}

function maybeAutoReroll(points) {
    if (!autoRandom || replaying) return;
    const lengthPx = pathArcLength(points) * PIXELS_PER_UNIT;
    if (lengthPx - strokeRerollLen >= autoPx) {
        strokeRerollLen = lengthPx;
        autoReroll();
    }
}

const cycle = setupDrawCycle({
    stage, board,
    canvas: document.getElementById('canvas'),
    build: buildMark,
    onCommit: (points, seed) => {
        strokeRerollLen = 0;
        if (autoRandom && !replaying) autoReroll();
        if (replaying) return;
        recorder.add({
            toolId: state.tool.id, values: { ...state.values },
            widthPx: state.widthPx, sens: state.sens,
            colorA: state.colorA, colorB: state.colorB, colors: [...state.colors],
            seed,
        }, points);
    },
});

// ---------------------------------------------------------------------------
// Palette. The first hue always follows the hue dial; the rest reroll.
function newPalette(hue) {
    const hues = [hue, ...Array.from({ length: 3 }, () => Math.random() * 360)];
    state.palette = Palette.fromHues(hues, {
        nLum: 5, lumHigh: 0.9, lumLow: 0.3, vibHigh: 0.95, vibLow: 0.3,
    });
    const dark = state.palette.entries.filter(e => e.L < 0.68);
    const firstDark = state.palette.entries.slice(0, 5).filter(e => e.L < 0.68);
    state.colorA = (firstDark[Math.floor(firstDark.length / 2)] ?? dark[0]).hex;
    state.colorB = dark[Math.floor(Math.random() * dark.length)].hex;
    state.colors = dark.map(e => e.hex);
}

function rerollTool(widthValue) {
    state.widthPx = 2 + widthValue / 127 * 58;
    state.tool = registry[Math.floor(Math.random() * registry.length)];
    state.values = randomValues(state.tool);
    // Pressure can widen the stroke by up to three times at full sensitivity.
    state.sens = Math.random() * 2;
}

// ---------------------------------------------------------------------------
// Preview: a box at the bottom right showing the current tool on a wiggle.
const preview = new THREE.Group();
preview.position.z = 0.2;
stage.add(preview);
// Semi-transparent black, so drawing behind the preview shows through.
const previewPaper = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.4, depthWrite: false }));
preview.add(previewPaper);
const PREVIEW_W = 1.1, PREVIEW_H = 0.62;
previewPaper.scale.set(PREVIEW_W, PREVIEW_H, 1);
let previewMark = null;

function previewCenter() {
    return {
        x: stage.extentX - 0.08 - PREVIEW_W / 2,
        y: -stage.extentY + 0.08 + PREVIEW_H / 2,
    };
}

function positionPreview() {
    const c = previewCenter();
    preview.position.x = c.x;
    preview.position.y = c.y;
}

function refreshPreview() {
    if (previewMark) {
        stage.remove(previewMark.mesh);
        previewMark.renderer.dispose(previewMark.mesh);
        previewMark = null;
    }
    // The mark is built at its world position rather than inside the offset
    // group: a blob's distance field lives in world space, so a translated
    // parent would separate the quad from its own contour.
    const c = previewCenter();
    const width = Math.min(state.widthPx / PIXELS_PER_UNIT, 0.15);
    const phase = Math.random() * Math.PI * 2;
    const freq = 4 + Math.random() * 4;
    const path = [];
    const n = 28;
    for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        path.push(new THREE.Vector3(
            c.x + (t - 0.5) * PREVIEW_W * 0.72,
            c.y + Math.sin(phase + t * freq) * PREVIEW_H * 0.2,
            0
        ));
    }
    const ctx = {
        colorA: state.colorA, colorB: state.colorB, colors: state.colors,
        texture: board.texture, seed: Math.floor(Math.random() * 1000),
        start: path[0], end: path[path.length - 1],
        tintLight: new THREE.Color(state.colorA).lerp(new THREE.Color('#ffffff'), 0.55).getStyle(),
    };
    let mark = null;
    if (state.tool.kind === 'blob') {
        const contour = blobOutline(path, { span: 0.1, radius: Math.min(Math.max(width * 1.3, 0.06), 0.16) });
        if (contour) {
            const renderer = state.tool.make(state.values, ctx);
            mark = { mesh: renderer.build(contour, ctx.seed), renderer };
        }
    } else {
        const renderer = state.tool.make(state.values, ctx);
        const def = new StrokeDef({
            points: path, widthLeft: taperByArc(width, pathArcLength(path)),
            renderer, seed: ctx.seed,
        });
        mark = { mesh: def.build(), renderer };
    }
    if (mark) {
        mark.mesh.position.z = 0.21;
        stage.add(mark.mesh);
        previewMark = mark;
    }
    stage.draw();
}

// ---------------------------------------------------------------------------
// Dials, frame-latched: input only stores the value, the update runs once on
// the next frame.
const hueLatch = new FrameLatch(v => { newPalette(v / 127 * 360); refreshPreview(); });
const toolLatch = new FrameLatch(v => { rerollTool(v); refreshPreview(); });

const dialHue = new Dial(document.getElementById('dial-hue'),
    { label: 'Hue', value: Math.floor(Math.random() * 128), onInput: v => hueLatch.set(v) });
const dialTool = new Dial(document.getElementById('dial-tool'),
    { label: 'Tool', value: 48, onInput: v => toolLatch.set(v) });

const midi = new MidiInput({
    onMessage: m => {
        console.log('[midi]', m.type, 'ch', m.channel, m.detail, m.data, m.port);
        if (m.type !== 'control change') return;
        if (m.data[1] === 16) dialHue.set(m.data[2]);
        else if (m.data[1] === 17) dialTool.set(m.data[2]);
    },
    onDevices: inputs => console.log('[midi] inputs:', inputs.map(i => i.name).join(', ') || 'none'),
});
midi.start()
    .then(() => console.log('[midi] access granted'))
    .catch(err => console.log('[midi] unavailable:', err.message));

// ---------------------------------------------------------------------------
// Clear: a fresh canvas color and a few scattered marks, all from the palette
// and all recorded, so a replay reproduces them too.
function clearAll() {
    // A gradient background, as plain data so the recorder can reproduce it.
    // The two colors come from different hue groups (entries are hue-major,
    // five luminance steps per hue), so the gradient actually reads as one.
    const groupLight = g => {
        const group = state.palette.entries.slice(g * 5, g * 5 + 5).filter(e => e.L > 0.55);
        return (group[Math.floor(Math.random() * group.length)] ?? state.palette.entries[g * 5]).hex;
    };
    const gi = Math.floor(Math.random() * 4);
    const gj = (gi + 1 + Math.floor(Math.random() * 3)) % 4;
    const background = {
        type: Math.random() < 0.5 ? 'linear' : 'radial',
        colorA: groupLight(gi), colorB: groupLight(gj),
        angle: Math.random() * Math.PI * 2,
        center: [0.2 + Math.random() * 0.6, 0.2 + Math.random() * 0.6],
    };
    cycle.disposeGhost();
    board.clear(background);
    recorder.begin(background);
    for (let i = 0; i < 3; i++) {
        rerollTool(Math.floor(Math.random() * 128));
        const dark = state.colors;
        state.colorA = dark[Math.floor(Math.random() * dark.length)];
        state.colorB = dark[Math.floor(Math.random() * dark.length)];
        cycle.feed(scatterPath(stage.extentX, stage.extentY), true);
    }
    // Back to what the dials say.
    newPalette(dialHue.value / 127 * 360);
    rerollTool(dialTool.value);
    refreshPreview();
}

// ---------------------------------------------------------------------------
// Replay: everything since the last clear, through the same cycle, with the
// idle time skipped.
function applyRecord(record) {
    state.tool = registry.find(r => r.id === record.toolId) ?? registry[0];
    state.values = { ...record.values };
    state.widthPx = record.widthPx;
    state.sens = record.sens;
    state.colorA = record.colorA;
    state.colorB = record.colorB;
    state.colors = [...record.colors];
    state.seedOverride = record.seed;
}

const replayBtn = document.getElementById('replay-btn');
const clearBtn = document.getElementById('clear-btn');
let player = null;

replayBtn.addEventListener('click', () => {
    // While a replay runs the same button reads Stop, and stopping jumps
    // straight to the end state.
    if (replaying) { player?.finish(); return; }
    if (recorder.records.length === 0) return;
    replaying = true;
    cycle.input.enabled = false;
    replayBtn.textContent = 'Stop';
    clearBtn.style.display = 'none';
    autoBtn.style.display = 'none';
    autoPanel.style.display = 'none';
    const saved = {
        tool: state.tool, values: { ...state.values }, widthPx: state.widthPx,
        sens: state.sens, colorA: state.colorA, colorB: state.colorB, colors: [...state.colors],
    };
    board.clear(recorder.background);
    stage.draw();
    player = replayRecords({
        records: recorder.records,
        applyTool: applyRecord,
        feed: cycle.feed,
        pointsPerFrame: 4,
        onDone: () => {
            Object.assign(state, saved, { seedOverride: null });
            replaying = false;
            player = null;
            cycle.input.enabled = true;
            replayBtn.textContent = 'Replay';
            clearBtn.style.display = '';
            autoBtn.style.display = '';
            autoPanel.style.display = autoRandom ? '' : 'none';
            refreshPreview();
        },
    });
});

clearBtn.addEventListener('click', () => {
    if (replaying) return;
    clearAll();
});

const autoBtn = document.getElementById('auto-btn');
const autoPanel = document.getElementById('auto-panel');
autoBtn.addEventListener('click', () => {
    autoRandom = !autoRandom;
    autoBtn.classList.toggle('active', autoRandom);
    autoPanel.style.display = autoRandom ? '' : 'none';
});
document.getElementById('auto-px').addEventListener('input', e => {
    autoPx = parseFloat(e.target.value);
    document.getElementById('auto-px-val').textContent = autoPx;
});

document.getElementById('fullscreen-btn').addEventListener('click', () => {
    const layout = document.getElementById('layout');
    if (document.fullscreenElement) document.exitFullscreen();
    else layout.requestFullscreen();
});

stage.onResize(() => { positionPreview(); refreshPreview(); });

// ---------------------------------------------------------------------------
newPalette(dialHue.value / 127 * 360);
rerollTool(dialTool.value);
positionPreview();
clearAll();
// The first layout pass can land after init; refresh the preview once it has.
requestAnimationFrame(() => { positionPreview(); refreshPreview(); });
