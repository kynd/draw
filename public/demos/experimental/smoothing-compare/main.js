import * as THREE from 'three';
import { StrokeDef } from '../../../lib/StrokeDef.js';
import { PIXELS_PER_UNIT } from '../../../lib/CanvasBuffer.js';
import { BrushStrokeRenderer } from '../../../lib/renderers/BrushStrokeRenderer.js';
import { HaloStrokeRenderer } from '../../../lib/renderers/HaloStrokeRenderer.js';
import { randomSchemePalette, paperColor } from '../../../lib/SchemePaletteMaker.js';
import { StrokeStage } from '../../../lib/demo/stage.js';
import { DrawingBoard } from '../../../lib/demo/drawingBoard.js';
import { setupDrawCycle } from '../../../lib/demo/drawCycle.js';
import { DrawInput } from '../../../lib/demo/drawInput.js';
import { smoothByWidth } from '../../../lib/curves.js';
import { uniformWidth } from '../../../lib/demo/strokePaths.js';

// Draw a stroke and compare how three smoothing methods treat it, on a brush or a
// glow. The black line is the raw pointer path, the blue line is the spine the
// chosen method produces, and the mark is built around that spine.
const methodSel = document.getElementById('method');
const markSel = document.getElementById('mark');
const splitCheck = document.getElementById('split');
const widthInput = document.getElementById('width');
const width = () => parseFloat(widthInput.value) / PIXELS_PER_UNIT;

let palette = randomSchemePalette('vivid-wheel');
let hex = palette.toHexArray();
let paper = paperColor(palette.entries[0].H);

const stage = new StrokeStage(document.getElementById('canvas'), { background: paper });
const board = new DrawingBoard(stage, { background: paper });

// The chosen smoothing method, applied to the raw points before the mark is built.
function smooth(points, w) {
    const m = methodSel.value;
    if (m === 'forced') return smoothByWidth(points, w, { forceStart: true });
    if (m === 'bspline') return smoothByWidth(points, w, { spline: 'bspline' });
    return smoothByWidth(points, w);
}

function makeRenderer(fadeLength) {
    if (markSel.value === 'glow') {
        return new HaloStrokeRenderer({
            mode: 'glow', color: hex[0], haloColor: hex[2 % hex.length],
            spread: 1.4, opacity: 0.85, fadeLength,
        });
    }
    return new BrushStrokeRenderer({
        cap: 'ragged', colorA: hex[0], colorB: hex[3 % hex.length], rough: 0.8, dry: 0.4,
    });
}

let lastPoints = null;

const cycle = setupDrawCycle({
    stage, board,
    canvas: document.getElementById('canvas'),
    smooth,
    widthFor: width,
    split: () => splitCheck.checked,
    pointerTrace: true,
    // The demo drives the cycle from its own input, so it can keep the whole
    // gesture (every split piece) and re-feed it when a control changes.
    bindInput: false,
    build: (path, points, seed, colorK, srcLength) => {
        const renderer = makeRenderer(srcLength);
        const def = new StrokeDef({
            points: path.map(p => new THREE.Vector3(p.x, p.y, 0)),
            widthLeft: uniformWidth(width()), renderer, seed,
        });
        const mesh = def.build();
        mesh.position.z = 0.05;
        return { mesh, renderer };
    },
});
cycle.setSpineTrace(true);

// Capture the whole gesture at release (not per piece), so re-feeding it on a
// control change rebuilds every split piece, not just the last leg.
new DrawInput(document.getElementById('canvas'), stage, {
    onChange: (points, done) => {
        cycle.feed(points, done);
        if (done && points.length >= 2) lastPoints = points.map(p => p.clone());
    },
});

// Re-draw the last stroke with the current settings, so switching method or mark
// compares them on the same stroke.
function redraw() {
    if (!lastPoints || lastPoints.length < 2) return;
    cycle.disposeGhost();
    board.clear(paper);
    cycle.feed(lastPoints, true);
}

methodSel.addEventListener('change', redraw);
markSel.addEventListener('change', redraw);
splitCheck.addEventListener('change', redraw);
widthInput.addEventListener('input', () => {
    document.getElementById('width-val').textContent = widthInput.value;
    redraw();
});
document.getElementById('clear-btn').addEventListener('click', () => {
    cycle.disposeGhost();
    lastPoints = null;
    board.clear(paper);
    stage.draw();
});

board.clear(paper);
stage.draw();
