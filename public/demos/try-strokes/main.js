import { RibbonStrokeRenderer } from '../../lib/renderers/RibbonStrokeRenderer.js';
import { BrushStrokeRenderer } from '../../lib/renderers/BrushStrokeRenderer.js';
import { WatercolorStrokeRenderer } from '../../lib/renderers/WatercolorStrokeRenderer.js';
import { SmearStrokeRenderer } from '../../lib/renderers/SmearStrokeRenderer.js';
import { WetBrushStrokeRenderer } from '../../lib/renderers/WetBrushStrokeRenderer.js';
import { OilStrokeRenderer } from '../../lib/renderers/OilStrokeRenderer.js';
import { ChromeStrokeRenderer } from '../../lib/renderers/ChromeStrokeRenderer.js';
import { MirrorStrokeRenderer } from '../../lib/renderers/MirrorStrokeRenderer.js';
import { GlassStrokeRenderer } from '../../lib/renderers/GlassStrokeRenderer.js';
import { PixelStrokeRenderer } from '../../lib/renderers/PixelStrokeRenderer.js';
import { PolygonStrokeRenderer } from '../../lib/renderers/PolygonStrokeRenderer.js';
import { LineStrokeRenderer } from '../../lib/renderers/LineStrokeRenderer.js';
import { StrokeStage } from '../../lib/demo/stage.js';
import { wireWireframeToggle } from '../../lib/demo/panel.js';
import { DrawingBoard } from '../../lib/demo/drawingBoard.js';
import { setupTryDrawing } from '../../lib/demo/tryPanel.js';

const width = (value, min = 0.02, max = 0.16) =>
    ({ key: 'width', label: 'Width', min, max, step: 0.005, value });

const registry = [
    {
        id: 'ribbon', label: 'Ribbon',
        params: [width(0.07)],
        make: (v, ctx) => new RibbonStrokeRenderer({ cap: 'rounded', color: ctx.colorA }),
    },
    {
        id: 'ribbon-ragged', label: 'Ribbon (ragged)',
        params: [width(0.07)],
        make: (v, ctx) => new RibbonStrokeRenderer({ cap: 'ragged', color: ctx.colorA }),
    },
    {
        id: 'brush', label: 'Brush',
        params: [width(0.09),
            { key: 'bristles', label: 'Bristles', min: 4, max: 60, step: 1, value: 26 },
            { key: 'rough', label: 'Rough', min: 0, max: 1, step: 0.02, value: 0.35 },
            { key: 'dry', label: 'Dry', min: 0, max: 0.8, step: 0.02, value: 0.3 }],
        make: (v, ctx) => new BrushStrokeRenderer({
            cap: 'ragged', colorA: ctx.colorA, colorB: ctx.colorB,
            bristles: v.bristles, rough: v.rough, dry: v.dry,
        }),
    },
    {
        id: 'watercolor', label: 'Watercolor',
        params: [width(0.1, 0.04, 0.2),
            { key: 'pigment', label: 'Pigment', min: 0, max: 1, step: 0.02, value: 0.55 },
            { key: 'rim', label: 'Rim', min: 0, max: 1, step: 0.02, value: 0.45 }],
        make: (v, ctx) => new WatercolorStrokeRenderer({
            cap: 'rounded', color: ctx.colorA, background: ctx.texture, blurred: ctx.texture,
            pigment: v.pigment, rim: v.rim,
        }),
    },
    {
        id: 'smear', label: 'Smear',
        params: [width(0.1, 0.04, 0.2),
            { key: 'drag', label: 'Drag', min: 0, max: 220, step: 5, value: 90 },
            { key: 'variation', label: 'Vary', min: 0, max: 1, step: 0.02, value: 0.75 }],
        make: (v, ctx) => new SmearStrokeRenderer({
            cap: 'rounded', color: ctx.colorA, background: ctx.texture,
            drag: v.drag, variation: v.variation,
        }),
    },
    {
        id: 'wet-brush', label: 'Wet brush',
        params: [width(0.1, 0.04, 0.2),
            { key: 'drag', label: 'Drag', min: 0, max: 160, step: 5, value: 55 },
            { key: 'pigment', label: 'Pigment', min: 0, max: 1, step: 0.02, value: 0.45 }],
        make: (v, ctx) => new WetBrushStrokeRenderer({
            cap: 'rounded', color: ctx.colorA, background: ctx.texture, blurred: ctx.texture,
            drag: v.drag, pigment: v.pigment,
        }),
    },
    {
        id: 'oil', label: 'Oil',
        params: [width(0.1, 0.04, 0.2),
            { key: 'paint', label: 'Coverage', min: 0.3, max: 1, step: 0.02, value: 1 },
            { key: 'drag', label: 'Drag', min: 0, max: 160, step: 5, value: 25 },
            { key: 'noise', label: 'Ridges', min: 0, max: 1, step: 0.02, value: 0.5 }],
        make: (v, ctx) => new OilStrokeRenderer({
            cap: 'rounded', color: ctx.colorA, background: ctx.texture,
            paint: v.paint, drag: v.drag, noise: v.noise,
        }),
    },
    {
        id: 'chrome', label: 'Chrome',
        params: [width(0.11, 0.05, 0.2),
            { key: 'noise', label: 'Liquid', min: 0, max: 0.8, step: 0.02, value: 0.22 },
            { key: 'specular', label: 'Specular', min: 0, max: 1.5, step: 0.05, value: 0.85 }],
        make: (v, ctx) => new ChromeStrokeRenderer({
            cap: 'rounded', noise: v.noise, specular: v.specular,
        }),
    },
    {
        id: 'mirror', label: 'Mirror',
        params: [width(0.11, 0.05, 0.2),
            { key: 'strength', label: 'Bend', min: 0, max: 0.08, step: 0.005, value: 0.025 },
            { key: 'specular', label: 'Specular', min: 0, max: 1.5, step: 0.05, value: 0.7 }],
        make: (v, ctx) => new MirrorStrokeRenderer({
            cap: 'rounded', background: ctx.texture, strength: v.strength, specular: v.specular,
        }),
    },
    {
        id: 'glass', label: 'Glass',
        params: [width(0.11, 0.05, 0.2),
            { key: 'refract', label: 'Bend', min: 0, max: 0.15, step: 0.005, value: 0.05 },
            { key: 'specular', label: 'Specular', min: 0, max: 1.5, step: 0.05, value: 0.9 }],
        make: (v, ctx) => new GlassStrokeRenderer({
            cap: 'rounded', background: ctx.texture, refract: v.refract,
            reflect: v.refract * 0.4, specular: v.specular,
        }),
    },
    {
        id: 'pixels', label: 'Pixels',
        params: [width(0.09),
            { key: 'cell', label: 'Cell', min: 0.015, max: 0.1, step: 0.005, value: 0.04 },
            { key: 'jitter', label: 'Drop', min: 0, max: 0.5, step: 0.02, value: 0.12 }],
        make: (v, ctx) => new PixelStrokeRenderer({ cell: v.cell, jitter: v.jitter, colors: ctx.colors }),
    },
    {
        id: 'facets', label: 'Facets',
        params: [width(0.09),
            { key: 'facets', label: 'Count', min: 3, max: 60, step: 1, value: 14 },
            { key: 'jitter', label: 'Jitter', min: 0, max: 1, step: 0.02, value: 0.45 }],
        make: (v, ctx) => new PolygonStrokeRenderer({ facets: v.facets, jitter: v.jitter, colors: ctx.colors }),
    },
    {
        id: 'lanes', label: 'Lanes',
        params: [width(0.09),
            { key: 'lanes', label: 'Count', min: 2, max: 24, step: 1, value: 7 },
            { key: 'duty', label: 'Fill', min: 0.1, max: 1, step: 0.02, value: 0.45 }],
        make: (v, ctx) => new LineStrokeRenderer({ lanes: v.lanes, duty: v.duty, colors: ctx.colors }),
    },
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
    swatchesEl: document.getElementById('color-swatches'),
});
wireWireframeToggle(document.getElementById('wire-btn'), stage);
