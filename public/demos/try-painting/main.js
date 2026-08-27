import { ShapedBlobRenderer } from '../../lib/renderers/ShapedBlobRenderer.js';
import { PaintBlobRenderer } from '../../lib/renderers/PaintBlobRenderer.js';
import { WashBlobRenderer } from '../../lib/renderers/WashBlobRenderer.js';
import { MaterialBlobRenderer } from '../../lib/renderers/MaterialBlobRenderer.js';
import { blobOutline } from '../../lib/pathEffects.js';
import { StrokeStage } from '../../lib/demo/stage.js';
import { DrawingBoard } from '../../lib/demo/drawingBoard.js';
import { setupTryDrawing } from '../../lib/demo/tryPanel.js';
import { wireWireframeToggle } from '../../lib/demo/panel.js';

const radius = { key: 'radius', label: 'Radius', min: 0.05, max: 0.3, step: 0.01, value: 0.12 };

function blob(id, label, params, makeRenderer) {
    return {
        id, label,
        params: [radius, ...params],
        makeMesh: (path, v, ctx) => {
            const contour = blobOutline(path, { span: 0.12, radius: v.radius });
            if (!contour) return null;
            const renderer = makeRenderer(v, ctx);
            return { mesh: renderer.build(contour, ctx.seed), renderer };
        },
    };
}

const registry = [
    blob('flat', 'Blob', [], (v, ctx) =>
        new ShapedBlobRenderer({ color: ctx.colorA })),
    blob('spiky', 'Spiky blob', [
        { key: 'spikeAmp', label: 'Spikes', min: 0.02, max: 0.25, step: 0.01, value: 0.1 },
        { key: 'sharp', label: 'Sharp', min: 1, max: 12, step: 0.5, value: 5 },
    ], (v, ctx) => new ShapedBlobRenderer({
        color: ctx.colorA, spikes: 26, spikeAmp: v.spikeAmp, sharp: v.sharp,
    })),
    blob('wobbly', 'Wobbly blob', [
        { key: 'wobble', label: 'Wobble', min: 0.01, max: 0.15, step: 0.005, value: 0.045 },
    ], (v, ctx) => new ShapedBlobRenderer({ color: ctx.colorA, wobble: v.wobble })),
    blob('smudged', 'Smudged paint', [], (v, ctx) => new PaintBlobRenderer({
        color: ctx.colorA, fade: 0.6, relief: 0.15, gloss: 0.15, edgeSoft: 0.1, noiseFreq: 3.5,
    })),
    blob('paint', 'Flat paint', [
        { key: 'relief', label: 'Relief', min: 0, max: 1, step: 0.05, value: 0.35 },
    ], (v, ctx) => new PaintBlobRenderer({
        color: ctx.colorA, fade: 0.12, relief: v.relief, gloss: 0.4, edgeSoft: 0.02,
    })),
    blob('oil', 'Thick oil', [
        { key: 'relief', label: 'Relief', min: 0.2, max: 1.5, step: 0.05, value: 1 },
        { key: 'gloss', label: 'Gloss', min: 0, max: 1.2, step: 0.05, value: 0.6 },
    ], (v, ctx) => new PaintBlobRenderer({
        color: ctx.colorA, fade: 0.05, relief: v.relief, ridged: true,
        gloss: v.gloss, edgeSoft: 0.025, noiseFreq: 4.5,
    })),
    blob('watery', 'Watery wash', [], (v, ctx) => new WashBlobRenderer({
        color: ctx.colorA, background: ctx.texture, pigment: 0.35, feather: 0.1, rim: 0.5,
    })),
    blob('wash', 'Medium wash', [], (v, ctx) => new WashBlobRenderer({
        color: ctx.colorA, background: ctx.texture, pigment: 0.6, feather: 0.045, rim: 0.4,
    })),
    blob('gouache', 'Gouache', [], (v, ctx) => new WashBlobRenderer({
        color: ctx.colorA, background: ctx.texture, pigment: 0.94, feather: 0.012, rim: 0.15,
    })),
    blob('metal', 'Metal', [
        { key: 'relief', label: 'Relief', min: 0, max: 1, step: 0.05, value: 0.3 },
    ], (v, ctx) => new MaterialBlobRenderer({ mode: 'metal', relief: v.relief })),
    blob('glass', 'Glass', [
        { key: 'bend', label: 'Bend', min: 0, max: 0.15, step: 0.005, value: 0.05 },
    ], (v, ctx) => new MaterialBlobRenderer({
        mode: 'glass', background: ctx.texture, bend: v.bend, tint: '#dff0f5',
    })),
    blob('facet', 'Faceted glass', [
        { key: 'bend', label: 'Bend', min: 0, max: 0.15, step: 0.005, value: 0.05 },
        { key: 'relief', label: 'Relief', min: 0, max: 1, step: 0.05, value: 0.45 },
    ], (v, ctx) => new MaterialBlobRenderer({
        mode: 'facet', background: ctx.texture, bend: v.bend, relief: v.relief, tint: '#e5eef2',
    })),
];

const stage = new StrokeStage(document.getElementById('canvas'), { fit: { width: 1.70, height: 1.0 } });
const board = new DrawingBoard(stage);

setupTryDrawing({
    stage, board,
    canvas: document.getElementById('canvas'),
    registry,
    select: document.getElementById('stroke-select'),
    paramsEl: document.getElementById('params'),
    clearBtn: document.getElementById('clear-btn'),
    colorBtn: document.getElementById('color-btn'),
});
wireWireframeToggle(document.getElementById('wire-btn'), stage);
