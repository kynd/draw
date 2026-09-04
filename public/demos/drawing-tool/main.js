import * as THREE from 'three';
import { StrokeDef } from '../../lib/StrokeDef.js';
import { Palette } from '../../lib/Palette.js';
import { oklchToHex, maxChromaAt } from '../../lib/color.js';
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
import { SmearStrokeRenderer } from '../../lib/renderers/SmearStrokeRenderer.js';
import { MirrorStrokeRenderer } from '../../lib/renderers/MirrorStrokeRenderer.js';
import { GlassStrokeRenderer } from '../../lib/renderers/GlassStrokeRenderer.js';
import { PolygonStrokeRenderer } from '../../lib/renderers/PolygonStrokeRenderer.js';
import { LineStrokeRenderer } from '../../lib/renderers/LineStrokeRenderer.js';
import { DryMediaStrokeRenderer } from '../../lib/renderers/DryMediaStrokeRenderer.js';
import { DebossStrokeRenderer } from '../../lib/renderers/DebossStrokeRenderer.js';
import { CloudStrokeRenderer } from '../../lib/renderers/CloudStrokeRenderer.js';
import { RoundedSquareStrokeRenderer } from '../../lib/renderers/RoundedSquareStrokeRenderer.js';
import { SpikeStrokeRenderer } from '../../lib/renderers/SpikeStrokeRenderer.js';
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
        params: [{ key: 'pigment', min: 0.2, max: 1 }, { key: 'rim', min: 0, max: 1 },
            { key: 'bleed', min: 0, max: 1 }],
        make: (v, ctx) => new WatercolorStrokeRenderer({
            cap: 'rounded', color: ctx.colorA, background: ctx.texture, blurred: ctx.texture,
            pigment: v.pigment, rim: v.rim, bleed: v.bleed,
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
    { id: 'ribbon-square', kind: 'stroke', params: [{ key: 'axis', pick: ['along', 'across'] }],
        make: (v, ctx) => new RibbonStrokeRenderer({
            cap: 'square', color: ctx.colorA, gradient: ctx.colorB, gradientAxis: v.axis,
        }) },
    { id: 'smear', kind: 'stroke',
        params: [{ key: 'drag', min: 20, max: 220 }, { key: 'variation', min: 0, max: 1 }],
        make: (v, ctx) => new SmearStrokeRenderer({
            cap: 'rounded', color: ctx.colorA, background: ctx.texture,
            drag: v.drag, variation: v.variation,
        }) },
    { id: 'mirror', kind: 'stroke',
        params: [{ key: 'strength', min: 0.008, max: 0.07 }, { key: 'specular', min: 0.3, max: 1.4 }],
        make: (v, ctx) => new MirrorStrokeRenderer({
            cap: 'rounded', background: ctx.texture, strength: v.strength, specular: v.specular,
        }) },
    { id: 'glass-stroke', kind: 'stroke',
        params: [{ key: 'refract', min: 0.02, max: 0.14 }, { key: 'specular', min: 0.3, max: 1.4 }],
        make: (v, ctx) => new GlassStrokeRenderer({
            cap: 'rounded', background: ctx.texture, refract: v.refract,
            reflect: v.refract * 0.4, specular: v.specular,
        }) },
    { id: 'polygons', kind: 'stroke',
        params: [{ key: 'facets', min: 4, max: 50, step: 1 }, { key: 'jitter', min: 0, max: 0.9 }],
        make: (v, ctx) => new PolygonStrokeRenderer({ facets: v.facets, jitter: v.jitter, colors: ctx.colors }) },
    { id: 'lanes', kind: 'stroke',
        params: [{ key: 'lanes', min: 2, max: 20, step: 1 }, { key: 'duty', min: 0.15, max: 1 }],
        make: (v, ctx) => new LineStrokeRenderer({ lanes: v.lanes, duty: v.duty, colors: ctx.colors }) },
    { id: 'pencil', kind: 'stroke',
        params: [{ key: 'grain', min: 0.3, max: 0.8 }, { key: 'pressure', min: 0.2, max: 0.7 }],
        make: (v, ctx) => new DryMediaStrokeRenderer({
            cap: 'ragged', color: ctx.colorA, grain: v.grain, pressure: v.pressure,
            tooth: 2.0, softness: 0.35, edge: 0.08, opacity: 1,
        }) },
    { id: 'charcoal', kind: 'stroke',
        params: [{ key: 'grain', min: 0.4, max: 0.9 }, { key: 'pressure', min: 0.2, max: 0.7 }],
        make: (v, ctx) => new DryMediaStrokeRenderer({
            cap: 'ragged', color: ctx.colorA, grain: v.grain, pressure: v.pressure,
            tooth: 4.5, softness: 0.5, edge: 0.3, opacity: 0.92,
        }) },
    { id: 'pastel', kind: 'stroke',
        params: [{ key: 'grain', min: 0.5, max: 1 }, { key: 'pressure', min: 0.2, max: 0.6 }],
        make: (v, ctx) => new DryMediaStrokeRenderer({
            cap: 'ragged', color: ctx.colorA, grain: v.grain, pressure: v.pressure,
            tooth: 7.0, softness: 0.65, edge: 0.55, opacity: 0.95,
        }) },
    { id: 'deboss', kind: 'stroke',
        params: [{ key: 'bevel', min: 0.2, max: 1 }, { key: 'amount', min: 0.3, max: 1.4 }],
        make: (v, ctx) => new DebossStrokeRenderer({
            cap: 'rounded', color: ctx.colorA, bevel: v.bevel, amount: v.amount,
        }) },
    { id: 'cloud', kind: 'stroke',
        params: [{ key: 'blob', min: 0.7, max: 2.6 }, { key: 'offset', min: 0.2, max: 2.6 }],
        make: (v, ctx) => new CloudStrokeRenderer({ color: ctx.colorA, blob: v.blob, offset: v.offset }) },
    { id: 'squares', kind: 'stroke',
        params: [{ key: 'cell', min: 0.08, max: 0.28 }, { key: 'blend', min: 0.1, max: 0.6 }],
        make: (v, ctx) => new RoundedSquareStrokeRenderer({ color: ctx.colorA, cell: v.cell, blend: v.blend }) },
    { id: 'spikes', kind: 'stroke',
        params: [{ key: 'spikes', min: 1, max: 10, step: 0.5 }, { key: 'amp', min: 0.3, max: 1.8 }, { key: 'sharp', min: 1.5, max: 10 }],
        make: (v, ctx) => new SpikeStrokeRenderer({ color: ctx.colorA, spikes: v.spikes, amp: v.amp, sharp: v.sharp }) },
    { id: 'flat-blob', kind: 'blob',
        params: [{ key: 'axis', pick: ['along', 'across'] }],
        make: (v, ctx) => {
            const [gradientFrom, gradientTo] = gradPoints(ctx, v.axis);
            return new ShapedBlobRenderer({ color: ctx.colorA, colorB: ctx.colorB, gradientFrom, gradientTo });
        } },
    { id: 'wobbly-blob', kind: 'blob',
        params: [{ key: 'wobble', min: 0.02, max: 0.12 }, { key: 'axis', pick: ['along', 'across'] }],
        make: (v, ctx) => {
            const [gradientFrom, gradientTo] = gradPoints(ctx, v.axis);
            return new ShapedBlobRenderer({
                color: ctx.colorA, colorB: ctx.colorB, gradientFrom, gradientTo, wobble: v.wobble,
            });
        } },
    { id: 'dry-brush', kind: 'blob',
        params: [{ key: 'dry', min: 0.3, max: 1 }],
        make: (v, ctx) => new PaintBlobRenderer({
            color: ctx.colorA, colorB: ctx.colorB, fade: 0.5, relief: 0.12, swell: 0.8,
            gloss: 0.1, edgeSoft: 0.03, dry: v.dry, noiseFreq: 3.5,
        }) },
    { id: 'flat-paint', kind: 'blob',
        params: [{ key: 'relief', min: 0.1, max: 1 }],
        make: (v, ctx) => new PaintBlobRenderer({
            color: ctx.colorA, colorB: ctx.colorB, fade: 0.12, relief: v.relief, gloss: 0.4, edgeSoft: 0.02,
        }) },
    { id: 'gouache', kind: 'blob',
        params: [{ key: 'flow', min: 0.02, max: 0.14 }],
        make: (v, ctx) => new WashBlobRenderer({
            color: ctx.colorA, background: ctx.texture,
            pigment: 1.1, feather: 0.012, rim: 0.1, flow: v.flow, wet: 0.08, bristle: 0.05,
        }) },
    { id: 'glass-blob', kind: 'blob',
        params: [{ key: 'bend', min: 0.02, max: 0.12 }],
        make: (v, ctx) => new MaterialBlobRenderer({
            mode: 'glass', background: ctx.texture, bend: v.bend, tint: '#dff0f5',
        }) },
    { id: 'facet-glass', kind: 'blob',
        params: [{ key: 'bend', min: 0.02, max: 0.12 }, { key: 'relief', min: 0.15, max: 0.9 }],
        make: (v, ctx) => new MaterialBlobRenderer({
            mode: 'facet', background: ctx.texture, bend: v.bend, relief: v.relief, tint: '#e5eef2',
        }) },
    { id: 'marble', kind: 'blob',
        params: [{ key: 'relief', min: 0.1, max: 1 }],
        make: (v, ctx) => new StoneBlobRenderer({
            mode: 'marble', color: ctx.colorA, colorB: ctx.colorB, relief: v.relief,
        }) },
    { id: 'sand', kind: 'blob',
        params: [{ key: 'relief', min: 0.1, max: 1 }],
        make: (v, ctx) => new StoneBlobRenderer({
            mode: 'sand', color: ctx.colorA, colorB: ctx.colorB, relief: v.relief,
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
// parameters, pressure sensitivity) reroll on every release. The tool comes
// from a step along the trail, so a dialed-back history includes what auto
// mode used.
let autoRandom = false;

function autoReroll() {
    const hueValue = Math.floor(Math.random() * 128);
    dialHue.set(hueValue, false);
    newPalette(hueValue / 127 * 360);
    stepTrail(1);
    refreshPreview();
    syncPane();
}

const cycle = setupDrawCycle({
    stage, board,
    canvas: document.getElementById('canvas'),
    build: buildMark,
    onCommit: (points, seed) => {
        if (replaying) return;
        // Record before the auto reroll: the record must capture the state
        // the mark was drawn with, not the state rolled for the next one.
        recorder.add({
            toolId: state.tool.id, values: { ...state.values },
            widthPx: state.widthPx, sens: state.sens,
            colorA: state.colorA, colorB: state.colorB, colors: [...state.colors],
            seed,
        }, points);
        if (autoRandom) autoReroll();
    },
});

// ---------------------------------------------------------------------------
// Palette. The first hue always follows the hue dial; the rest reroll.
function newPalette(hue, { keepColorA = false } = {}) {
    const hues = [hue, ...Array.from({ length: 3 }, () => Math.random() * 360)];
    state.palette = Palette.fromHues(hues, {
        nLum: 5, lumHigh: 0.9, lumLow: 0.3, vibHigh: 0.95, vibLow: 0.3,
    });
    const dark = state.palette.entries.filter(e => e.L < 0.68);
    if (!keepColorA) {
        const firstDark = state.palette.entries.slice(0, 5).filter(e => e.L < 0.68);
        state.colorA = (firstDark[Math.floor(firstDark.length / 2)] ?? dark[0]).hex;
    }
    state.colorB = dark[Math.floor(Math.random() * dark.length)].hex;
    state.colors = dark.map(e => e.hex);
}

const toolValues = {};
let toolIndex = 0;

// The tool dial walks a trail of rolled tools: the current one with ten
// remembered on each side, so passing a tool over and dialing back finds the
// same one, with the width, parameters, and pressure sensitivity it was
// rolled with. Each step drops the entry on the far end behind and rolls a
// fresh one onto the end ahead.
const TRAIL_SIDE = 10;

function rollEntry() {
    const tool = registry[Math.floor(Math.random() * registry.length)];
    return {
        tool,
        values: randomValues(tool),
        widthPx: 2 + Math.random() * 58,
        // Pressure can widen the stroke by up to three times at full sensitivity.
        sens: Math.random() * 2,
    };
}

const trail = Array.from({ length: TRAIL_SIDE * 2 + 1 }, rollEntry);

function applyRoll(entry) {
    state.tool = entry.tool;
    state.values = entry.values;
    state.widthPx = entry.widthPx;
    state.sens = entry.sens;
    toolIndex = registry.indexOf(entry.tool);
    toolValues[entry.tool.id] = entry.values;
}

function stepTrail(steps) {
    // Adjusted width, parameters, and sensitivity stay with the entry, so the
    // trail remembers the tool as it was left, not as it was rolled.
    trail[TRAIL_SIDE] = {
        tool: state.tool, values: state.values,
        widthPx: state.widthPx, sens: state.sens,
    };
    for (let i = 0; i < Math.abs(steps); i++) {
        if (steps > 0) { trail.shift(); trail.push(rollEntry()); }
        else { trail.pop(); trail.unshift(rollEntry()); }
    }
    applyRoll(trail[TRAIL_SIDE]);
}

function toolLabel(entry) {
    return entry.id.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase());
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
        mark.mesh.visible = !uiHidden && !replaying;
        stage.add(mark.mesh);
        previewMark = mark;
    }
    preview.visible = !uiHidden && !replaying;
    stage.draw();
}

// ---------------------------------------------------------------------------
// Dials, frame-latched: input only stores the value, the update runs once on
// the next frame.
const hueLatch = new FrameLatch(v => {
    if (advancedOn) return;
    newPalette(v / 127 * 360);
    refreshPreview();
});
// The dial's range is quantized into buckets; crossing into a new bucket
// steps the trail by the difference, so turning back retraces the same tools.
const TOOL_STEP = 6;
let toolBucket = Math.round(48 / TOOL_STEP);
const toolLatch = new FrameLatch(v => {
    if (advancedOn) return;
    const bucket = Math.round(v / TOOL_STEP);
    if (bucket === toolBucket) return;
    stepTrail(bucket - toolBucket);
    toolBucket = bucket;
    refreshPreview();
});

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
        applyRoll(rollEntry());
        const dark = state.colors;
        state.colorA = dark[Math.floor(Math.random() * dark.length)];
        state.colorB = dark[Math.floor(Math.random() * dark.length)];
        cycle.feed(scatterPath(stage.extentX, stage.extentY), true);
    }
    // Back to what the dials say: the palette from the hue dial, the tool
    // from the trail's current entry.
    newPalette(dialHue.value / 127 * 360);
    applyRoll(trail[TRAIL_SIDE]);
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

// Everything but Replay and Full screen goes away while a replay runs.
function setReplayUi(on) {
    replayBtn.textContent = on ? 'Stop' : 'Replay';
    const hidden = on ? 'none' : '';
    clearBtn.style.display = hidden;
    autoBtn.style.display = hidden;
    recordBtn.style.display = hidden;
    guideBtn.style.display = hidden;
    advBtn.style.display = hidden;
    guidePanel.style.display = on || !guideMesh ? 'none' : '';
    sidePane.style.display = on || !advancedOn ? 'none' : '';
    // The preview box lives in the scene, so it would be captured into the
    // replay's canvas, and into a recording of it.
    preview.visible = !on && !uiHidden;
    if (previewMark) previewMark.mesh.visible = !on && !uiHidden;
    updateGuideVisibility();
}

function startReplay(onFinished) {
    if (replaying || recorder.records.length === 0) return false;
    replaying = true;
    cycle.input.enabled = false;
    setReplayUi(true);
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
            setReplayUi(false);
            refreshPreview();
            syncPane();
            onFinished?.();
        },
    });
    return true;
}

replayBtn.addEventListener('click', () => {
    // While a replay runs the same button reads Stop, and stopping jumps
    // straight to the end state.
    if (replaying) { player?.finish(); return; }
    startReplay();
});

clearBtn.addEventListener('click', () => {
    if (replaying) return;
    clearAll();
});

const autoBtn = document.getElementById('auto-btn');
autoBtn.addEventListener('click', () => {
    autoRandom = !autoRandom;
    autoBtn.classList.toggle('active', autoRandom);
});

// ---------------------------------------------------------------------------
// Advanced pane: exact HCL color by three dials, the tool by dial or dropdown,
// and every parameter of the current tool as sliders. The two canvas dials hide
// while it is open.
let advancedOn = false;
const advBtn = document.getElementById('adv-btn');
const sidePane = document.getElementById('side-pane');
const dialsEl = document.querySelector('.dp-dials');
const adv = { h: Math.round(Math.random() * 360), c: 70, l: 45 };

function applyAdvancedColor() {
    const L = adv.l / 100;
    const C = maxChromaAt(L, adv.h) * adv.c / 100;
    state.colorA = oklchToHex(L, C, adv.h);
    newPalette(adv.h, { keepColorA: true });
    renderSwatches();
    refreshPreview();
}

function selectToolByIndex(index) {
    toolIndex = Math.max(0, Math.min(registry.length - 1, index));
    state.tool = registry[toolIndex];
    state.values = toolValues[state.tool.id] ??= randomValues(state.tool);
    renderParams();
    renderSwatches();
    refreshPreview();
}

function renderSwatches() {
    const toolColors = document.getElementById('tool-colors');
    toolColors.innerHTML = '';
    for (const hex of [state.colorA, state.colorB]) {
        const sw = document.createElement('div');
        sw.className = 'dp-swatch';
        sw.style.background = hex;
        toolColors.appendChild(sw);
    }
    const grid = document.getElementById('palette-grid');
    grid.innerHTML = '';
    for (const entry of state.palette?.entries ?? []) {
        const cell = document.createElement('div');
        cell.className = 'dp-swatch-cell'
            + (entry.hex === state.colorA || entry.hex === state.colorB ? ' selected' : '');
        cell.style.background = entry.hex;
        grid.appendChild(cell);
    }
}

function paramRow(container, label, min, max, step, value, decimals, onInput) {
    const row = document.createElement('div');
    row.className = 'dp-row';
    const lab = document.createElement('span');
    lab.className = 'dp-label';
    lab.textContent = label;
    const input = document.createElement('input');
    input.type = 'range';
    input.className = 'dp-range';
    input.min = min; input.max = max; input.step = step; input.value = value;
    const val = document.createElement('span');
    val.className = 'dp-val';
    const show = () => { val.textContent = parseFloat(input.value).toFixed(decimals); };
    show();
    input.addEventListener('input', () => { show(); onInput(parseFloat(input.value)); });
    row.append(lab, input, val);
    container.appendChild(row);
}

function renderParams() {
    const container = document.getElementById('tool-params');
    container.innerHTML = '';
    paramRow(container, 'Width', 2, 60, 1, state.widthPx, 0,
        v => { state.widthPx = v; refreshPreview(); });
    paramRow(container, 'Pressure', 0, 2, 0.05, state.sens, 2,
        v => { state.sens = v; });
    for (const param of state.tool.params) {
        const label = param.key.replace(/^./, c => c.toUpperCase());
        if (param.pick) {
            const row = document.createElement('div');
            row.className = 'dp-row';
            const lab = document.createElement('span');
            lab.className = 'dp-label';
            lab.textContent = label;
            const select = document.createElement('select');
            select.className = 'dp-select';
            for (const option of param.pick) {
                const o = document.createElement('option');
                o.value = option;
                o.textContent = option;
                select.appendChild(o);
            }
            select.value = state.values[param.key];
            select.addEventListener('change', () => {
                state.values[param.key] = select.value;
                refreshPreview();
            });
            row.append(lab, select);
            container.appendChild(row);
            continue;
        }
        const step = param.step ?? (param.max - param.min) / 100;
        const decimals = step >= 1 ? 0 : 2;
        paramRow(container, label, param.min, param.max, step, state.values[param.key], decimals,
            v => { state.values[param.key] = v; refreshPreview(); });
    }
}

const dialH = new Dial(document.getElementById('dial-h'),
    { label: 'H', min: 0, max: 360, value: adv.h, onInput: v => { adv.h = v; applyAdvancedColor(); } });
const dialC = new Dial(document.getElementById('dial-c'),
    { label: 'C', min: 0, max: 100, value: adv.c, onInput: v => { adv.c = v; applyAdvancedColor(); } });
const dialL = new Dial(document.getElementById('dial-l'),
    { label: 'L', min: 5, max: 95, value: adv.l, onInput: v => { adv.l = v; applyAdvancedColor(); } });

const toolSelect = document.getElementById('tool-select');
registry.forEach((entry, i) => {
    const o = document.createElement('option');
    o.value = i;
    o.textContent = toolLabel(entry);
    toolSelect.appendChild(o);
});
toolSelect.addEventListener('change', () => {
    selectToolByIndex(parseInt(toolSelect.value, 10));
    dialToolAdv.set(toolIndex, false);
});
// The dial is a shortcut through the same order as the dropdown, not a reroll.
const dialToolAdv = new Dial(document.getElementById('dial-tool-adv'),
    { label: 'Tool', min: 0, max: registry.length - 1, value: 0,
      onInput: i => { selectToolByIndex(i); toolSelect.value = String(toolIndex); } });

function syncPane() {
    if (!advancedOn) return;
    toolSelect.value = String(toolIndex);
    dialToolAdv.set(toolIndex, false);
    renderParams();
    renderSwatches();
}

advBtn.addEventListener('click', () => {
    if (replaying) return;
    advancedOn = !advancedOn;
    advBtn.classList.toggle('active', advancedOn);
    dialsEl.style.display = advancedOn ? 'none' : '';
    sidePane.style.display = advancedOn ? '' : 'none';
    if (advancedOn) {
        applyAdvancedColor();
        selectToolByIndex(toolIndex);
        syncPane();
    }
});

// ---------------------------------------------------------------------------
// While the pen is down, every overlay fades out of the way — the DOM controls
// and the preview box in the scene alike.
let uiHidden = false;
function setUiHidden(hidden) {
    uiHidden = hidden;
    document.getElementById('layout').classList.toggle('dp-ui-hidden', hidden);
    preview.visible = !hidden && !replaying;
    if (previewMark) previewMark.mesh.visible = !hidden && !replaying;
    stage.draw();
}
{
    const canvas = document.getElementById('canvas');
    canvas.addEventListener('pointerdown', () => {
        if (cycle.input.enabled) setUiHidden(true);
    });
    const show = () => setUiHidden(false);
    window.addEventListener('pointerup', show);
    window.addEventListener('pointercancel', show);
}

// ---------------------------------------------------------------------------
// Record: run the replay while capturing the canvas, then save the video. The
// file is mp4 where the browser can encode it, webm otherwise.
const recordBtn = document.getElementById('record-btn');
let recording = false;

recordBtn.addEventListener('click', () => {
    if (recording || replaying || recorder.records.length === 0) return;
    const canvas = document.getElementById('canvas');
    const stream = canvas.captureStream(60);
    const mime = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']
        .find(c => window.MediaRecorder && MediaRecorder.isTypeSupported(c));
    if (!mime) { console.log('[record] MediaRecorder unavailable'); return; }
    const media = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12_000_000 });
    const chunks = [];
    media.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    media.onstop = () => {
        const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
        const blob = new Blob(chunks, { type: mime });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `drawing.${ext}`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    };
    media.start();
    recording = true;
    recordBtn.classList.add('active');
    const ok = startReplay(() => {
        media.stop();
        recording = false;
        recordBtn.classList.remove('active');
    });
    if (!ok) { media.stop(); recording = false; recordBtn.classList.remove('active'); }
});

// ---------------------------------------------------------------------------
// Canvas size, offered in full screen: a fixed centered surface, or the window.
const sizeSelect = document.getElementById('size-select');
function applyCanvasSize(value) {
    const wrap = document.querySelector('.canvas-wrap');
    if (!value) {
        wrap.style.flex = '';
        wrap.style.width = '';
        wrap.style.height = '';
        wrap.style.margin = '';
        return;
    }
    const [w, h] = value.split('x');
    wrap.style.flex = 'none';
    wrap.style.width = `${w}px`;
    wrap.style.height = `${h}px`;
    wrap.style.margin = 'auto';
}
sizeSelect.addEventListener('change', () => {
    applyCanvasSize(sizeSelect.value);
    clearOnResize = true;
});

// ---------------------------------------------------------------------------
// Guide image: an overlay fit to the canvas, with opacity and visibility
// controls. It is never baked and hides during replay and recording, so the
// output is exactly as if it did not exist.
const guideBtn = document.getElementById('guide-btn');
const guidePanel = document.getElementById('guide-panel');
const guideFile = document.getElementById('guide-file');
const guideToggle = document.getElementById('guide-toggle');
let guideMesh = null;
let guideAspect = 1;
let guideVisible = true;
let guideOpacity = 0.5;

function fitGuide() {
    if (!guideMesh) return;
    const w = Math.min(stage.extentX * 2, stage.extentY * 2 * guideAspect);
    guideMesh.scale.set(w, w / guideAspect, 1);
}

function updateGuideVisibility() {
    if (!guideMesh) return;
    guideMesh.visible = guideVisible && !replaying;
    stage.draw();
}

guideBtn.addEventListener('click', () => {
    if (replaying) return;
    guideFile.click();
});
guideFile.addEventListener('change', () => {
    const file = guideFile.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
        guideAspect = image.naturalWidth / Math.max(image.naturalHeight, 1);
        const texture = new THREE.Texture(image);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;
        if (guideMesh) {
            stage.remove(guideMesh);
            guideMesh.material.map?.dispose();
            guideMesh.material.dispose();
            guideMesh.geometry.dispose();
        }
        guideMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(1, 1),
            new THREE.MeshBasicMaterial({
                map: texture, transparent: true, opacity: guideOpacity, depthWrite: false,
            })
        );
        guideMesh.position.z = 1.4;
        stage.add(guideMesh);
        fitGuide();
        guidePanel.style.display = '';
        updateGuideVisibility();
        URL.revokeObjectURL(url);
    };
    image.src = url;
    guideFile.value = '';
});
document.getElementById('guide-opacity').addEventListener('input', e => {
    guideOpacity = parseFloat(e.target.value);
    if (guideMesh) {
        guideMesh.material.opacity = guideOpacity;
        stage.draw();
    }
});
guideToggle.addEventListener('click', () => {
    guideVisible = !guideVisible;
    guideToggle.classList.toggle('active', guideVisible);
    guideToggle.textContent = guideVisible ? 'On' : 'Off';
    updateGuideVisibility();
});

document.getElementById('fullscreen-btn').addEventListener('click', () => {
    const layout = document.getElementById('layout');
    if (document.fullscreenElement) document.exitFullscreen();
    else layout.requestFullscreen();
});

// Toggling full screen restarts the canvas: the clear waits for the resize,
// so the fresh gradient and scatter land on the new size.
let clearOnResize = false;
document.addEventListener('fullscreenchange', () => {
    clearOnResize = true;
    const inFullscreen = Boolean(document.fullscreenElement);
    sizeSelect.style.display = inFullscreen ? '' : 'none';
    if (!inFullscreen) {
        sizeSelect.value = '';
        applyCanvasSize('');
    }
});

stage.onResize(() => {
    positionPreview();
    refreshPreview();
    fitGuide();
    if (clearOnResize && !replaying) {
        clearOnResize = false;
        clearAll();
    }
});

// ---------------------------------------------------------------------------
newPalette(dialHue.value / 127 * 360);
applyRoll(trail[TRAIL_SIDE]);
positionPreview();
// The first layout pass can land after init, when the stage still has no
// size. A scatter drawn then collapses to a point and records a degenerate
// stroke, so the first clear waits for the resize that sizes the stage.
if (stage.extentX > 0.01) clearAll();
else clearOnResize = true;
requestAnimationFrame(() => { positionPreview(); refreshPreview(); });
