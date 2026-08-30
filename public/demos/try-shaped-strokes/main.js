import { CloudStrokeRenderer } from '../../lib/renderers/CloudStrokeRenderer.js';
import { RoundedSquareStrokeRenderer } from '../../lib/renderers/RoundedSquareStrokeRenderer.js';
import { SpikeStrokeRenderer } from '../../lib/renderers/SpikeStrokeRenderer.js';
import { TubeStrokeRenderer } from '../../lib/renderers/TubeStrokeRenderer.js';
import { TriangleStrokeRenderer } from '../../lib/renderers/TriangleStrokeRenderer.js';
import * as THREE from 'three';
import { StrokeStage } from '../../lib/demo/stage.js';
import { wireWireframeToggle } from '../../lib/demo/panel.js';
import { DrawingBoard } from '../../lib/demo/drawingBoard.js';
import { setupTryDrawing } from '../../lib/demo/tryPanel.js';

const registry = [
    {
        id: 'cloud', label: 'Cloud',
        params: [
            { key: 'width', label: 'Width', min: 0.02, max: 0.14, step: 0.005, value: 0.06 },
            { key: 'blob', label: 'Blob', min: 0.6, max: 3, step: 0.1, value: 1.5 },
            { key: 'offset', label: 'Offset', min: 0, max: 3, step: 0.1, value: 1.3 },
        ],
        make: (v, ctx) => new CloudStrokeRenderer({ color: ctx.colorA, blob: v.blob, offset: v.offset }),
    },
    {
        id: 'squares', label: 'Rounded squares',
        params: [
            { key: 'width', label: 'Width', min: 0.03, max: 0.16, step: 0.005, value: 0.08 },
            { key: 'cell', label: 'Cell', min: 0.08, max: 0.3, step: 0.01, value: 0.14 },
            { key: 'blend', label: 'Blend', min: 0.1, max: 0.6, step: 0.02, value: 0.35 },
        ],
        make: (v, ctx) => new RoundedSquareStrokeRenderer({ color: ctx.colorA, cell: v.cell, blend: v.blend }),
    },
    {
        id: 'spikes', label: 'Spikes',
        params: [
            { key: 'width', label: 'Width', min: 0.03, max: 0.16, step: 0.005, value: 0.09 },
            { key: 'spikes', label: 'Spikes', min: 1, max: 10, step: 0.5, value: 4 },
            { key: 'amp', label: 'Height', min: 0.2, max: 2, step: 0.1, value: 0.9 },
            { key: 'sharp', label: 'Sharp', min: 1, max: 12, step: 0.5, value: 5 },
        ],
        make: (v, ctx) => new SpikeStrokeRenderer({ color: ctx.colorA, spikes: v.spikes, amp: v.amp, sharp: v.sharp }),
    },
    {
        id: 'tube-candy', label: 'Candy tube',
        params: [
            { key: 'width', label: 'Width', min: 0.03, max: 0.14, step: 0.005, value: 0.07 },
            { key: 'twist', label: 'Twist', min: 0, max: 14, step: 0.5, value: 5 },
            { key: 'stripes', label: 'Stripes', min: 1, max: 12, step: 0.5, value: 5 },
        ],
        make: (v, ctx) => new TubeStrokeRenderer({
            mode: 'candy', colors: ctx.colors.slice(0, 4), twist: v.twist, stripes: v.stripes,
        }),
    },
    {
        id: 'tube-wobble', label: 'Wobble tube',
        params: [
            { key: 'width', label: 'Width', min: 0.03, max: 0.14, step: 0.005, value: 0.08 },
            { key: 'twist', label: 'Twist', min: 0, max: 14, step: 0.5, value: 5 },
        ],
        make: (v, ctx) => new TubeStrokeRenderer({
            mode: 'wobble', colorA: ctx.colorA, colorB: ctx.colorB, twist: v.twist,
        }),
    },
    {
        id: 'tube-metal', label: 'Metal tube',
        params: [
            { key: 'width', label: 'Width', min: 0.03, max: 0.14, step: 0.005, value: 0.08 },
            { key: 'twist', label: 'Twist', min: 0, max: 14, step: 0.5, value: 5 },
        ],
        make: (v, ctx) => new TubeStrokeRenderer({
            mode: 'metal', background: ctx.texture, twist: v.twist,
            tint: new THREE.Color(ctx.colorA).lerp(new THREE.Color('#ffffff'), 0.55).getStyle(),
        }),
    },
    {
        id: 'tri-facets', label: 'Facet triangles',
        params: [
            { key: 'width', label: 'Width', min: 0.03, max: 0.14, step: 0.005, value: 0.08 },
            { key: 'twist', label: 'Twist', min: 0, max: 14, step: 0.5, value: 5 },
            { key: 'spacing', label: 'Spacing', min: 0.3, max: 1.4, step: 0.05, value: 0.55 },
        ],
        make: (v, ctx) => new TriangleStrokeRenderer({
            mode: 'facets', colorA: ctx.colorA, twist: v.twist, spacing: v.spacing,
        }),
    },
    {
        id: 'tri-grain', label: 'Grain triangles',
        params: [
            { key: 'width', label: 'Width', min: 0.03, max: 0.14, step: 0.005, value: 0.08 },
            { key: 'twist', label: 'Twist', min: 0, max: 14, step: 0.5, value: 5 },
        ],
        make: (v, ctx) => new TriangleStrokeRenderer({
            mode: 'grain', colorA: ctx.colorA, colorB: ctx.colorB, twist: v.twist,
        }),
    },
    {
        id: 'tri-metal', label: 'Metal triangles',
        params: [
            { key: 'width', label: 'Width', min: 0.03, max: 0.14, step: 0.005, value: 0.08 },
            { key: 'twist', label: 'Twist', min: 0, max: 14, step: 0.5, value: 5 },
        ],
        make: (v, ctx) => new TriangleStrokeRenderer({
            mode: 'metal', background: ctx.texture, twist: v.twist,
            tint: new THREE.Color(ctx.colorA).lerp(new THREE.Color('#ffffff'), 0.55).getStyle(),
        }),
    },
];

const stage = new StrokeStage(document.getElementById('canvas'));
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
    pressureEl: document.getElementById('pressure'),
});
wireWireframeToggle(document.getElementById('wire-btn'), stage);
