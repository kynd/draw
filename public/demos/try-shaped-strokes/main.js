import { CloudStrokeRenderer } from '../../lib/renderers/CloudStrokeRenderer.js';
import { RoundedSquareStrokeRenderer } from '../../lib/renderers/RoundedSquareStrokeRenderer.js';
import { SpikeStrokeRenderer } from '../../lib/renderers/SpikeStrokeRenderer.js';
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
