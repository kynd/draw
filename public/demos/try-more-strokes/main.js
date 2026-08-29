import { DryMediaStrokeRenderer } from '../../lib/renderers/DryMediaStrokeRenderer.js';
import { DebossStrokeRenderer } from '../../lib/renderers/DebossStrokeRenderer.js';
import { StrokeStage } from '../../lib/demo/stage.js';
import { wireWireframeToggle } from '../../lib/demo/panel.js';
import { DrawingBoard } from '../../lib/demo/drawingBoard.js';
import { setupTryDrawing } from '../../lib/demo/tryPanel.js';

const media = (id, label, preset, widthValue, widthMax) => ({
    id, label,
    params: [
        { key: 'width', label: 'Width', min: 0.003, max: widthMax, step: 0.002, value: widthValue },
        { key: 'grain', label: 'Grain', min: 0, max: 1, step: 0.02, value: preset.grain },
        { key: 'pressure', label: 'Pressure', min: 0, max: 0.9, step: 0.02, value: preset.pressure },
    ],
    make: (v, ctx) => new DryMediaStrokeRenderer({
        cap: 'ragged', color: ctx.colorA,
        grain: v.grain, pressure: v.pressure,
        tooth: preset.tooth, softness: preset.softness, edge: preset.edge, opacity: preset.opacity,
    }),
});

const registry = [
    media('pencil', 'Pencil', { grain: 0.55, pressure: 0.45, tooth: 2.0, softness: 0.35, edge: 0.08, opacity: 1 }, 0.008, 0.03),
    media('charcoal', 'Charcoal', { grain: 0.7, pressure: 0.5, tooth: 4.5, softness: 0.5, edge: 0.3, opacity: 0.92 }, 0.045, 0.1),
    media('pastel', 'Pastel', { grain: 0.8, pressure: 0.4, tooth: 7.0, softness: 0.65, edge: 0.55, opacity: 0.95 }, 0.11, 0.18),
    {
        id: 'deboss', label: 'Deboss',
        params: [
            { key: 'width', label: 'Width', min: 0.03, max: 0.16, step: 0.005, value: 0.09 },
            { key: 'bevel', label: 'Bevel', min: 0.1, max: 1, step: 0.02, value: 0.55 },
            { key: 'amount', label: 'Amount', min: 0, max: 1.5, step: 0.05, value: 0.9 },
        ],
        make: (v, ctx) => new DebossStrokeRenderer({
            cap: 'rounded', color: ctx.colorA, bevel: v.bevel, amount: v.amount,
        }),
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
    pressureEl: document.getElementById('pressure'),
});
wireWireframeToggle(document.getElementById('wire-btn'), stage);
