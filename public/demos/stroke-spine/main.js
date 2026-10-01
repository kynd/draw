import * as THREE from 'three';
import { StrokeDef } from '../../lib/StrokeDef.js';
import { PIXELS_PER_UNIT } from '../../lib/CanvasBuffer.js';
import { RibbonStrokeRenderer } from '../../lib/renderers/RibbonStrokeRenderer.js';
import { StrokeStage } from '../../lib/demo/stage.js';
import { DrawingBoard } from '../../lib/demo/drawingBoard.js';
import { setupDrawCycle } from '../../lib/demo/drawCycle.js';
import { uniformWidth } from '../../lib/demo/strokePaths.js';

const PAPER = '#f4f1ea';
const FILL = '#c2d4ea';

const widthInput = document.getElementById('width');
const width = () => parseFloat(widthInput.value) / PIXELS_PER_UNIT;

const stage = new StrokeStage(document.getElementById('canvas'), { background: PAPER });
const board = new DrawingBoard(stage, { background: PAPER });

// One stroke drawn three ways at once: the resulting stroke as a translucent
// ribbon, and over it the pointer's raw path (black) and the smoothed spine
// (blue) the ribbon is built from.
const cycle = setupDrawCycle({
    stage, board,
    canvas: document.getElementById('canvas'),
    build: (path, points, seed) => {
        // Opaque, so the ribbon's self-overlap at a curve does not show as fans;
        // the spine and path draw over it as overlays.
        const renderer = new RibbonStrokeRenderer({ cap: 'rounded', color: FILL });
        const def = new StrokeDef({
            points: path.map(p => new THREE.Vector3(p.x, p.y, 0)),
            widthLeft: uniformWidth(width()),
            renderer, seed,
        });
        const mesh = def.build();
        mesh.position.z = 0.05;
        return { mesh, renderer };
    },
    widthFor: width,
    split: false,
    pointerTrace: true,
});
cycle.setSpineTrace(true);

document.getElementById('clear-btn').addEventListener('click', () => {
    cycle.disposeGhost();
    board.clear(PAPER);
    stage.draw();
});
widthInput.addEventListener('input', () => {
    document.getElementById('width-val').textContent = widthInput.value;
});

board.clear(PAPER);
stage.draw();
