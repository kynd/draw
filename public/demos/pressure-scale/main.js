import * as THREE from 'three';
import { StrokeDef } from '../../lib/StrokeDef.js';
import { PIXELS_PER_UNIT } from '../../lib/CanvasBuffer.js';
import { RibbonStrokeRenderer } from '../../lib/renderers/RibbonStrokeRenderer.js';
import { StrokeStage } from '../../lib/demo/stage.js';
import { DrawingBoard } from '../../lib/demo/drawingBoard.js';
import { setupDrawCycle } from '../../lib/demo/drawCycle.js';
import { pressureAlong, pressureResponse, limitWidthSlope } from '../../lib/demo/pressure.js';

const controls = {};
['base', 'scale', 'threshold', 'curve', 'limit', 'minmove'].forEach(id => {
    const input = document.getElementById(id);
    const val = input.nextElementSibling;
    const step = parseFloat(input.step);
    const decimals = step >= 1 ? 0 : (step >= 0.1 ? 1 : (step >= 0.01 ? 2 : 3));
    const show = () => { val.textContent = parseFloat(input.value).toFixed(decimals); };
    show();
    input.addEventListener('input', show);
    controls[id] = input;
});

const stage = new StrokeStage(document.getElementById('canvas'), { background: '#ffffff',
});
const board = new DrawingBoard(stage, { background: '#ffffff' });

const cycle = setupDrawCycle({
    stage, board,
    canvas: document.getElementById('canvas'),
    build: (path, points, seed) => {
        const base = parseFloat(controls.base.value) / PIXELS_PER_UNIT;
        const scale = parseFloat(controls.scale.value);
        const gamma = parseFloat(controls.curve.value);
        const threshold = parseFloat(controls.threshold.value);
        const limit = parseFloat(controls.limit.value);
        const pressureAt = pressureAlong(points);
        const renderer = new RibbonStrokeRenderer({ cap: 'rounded', color: '#808080' });
        const def = new StrokeDef({
            points: path.map(p => new THREE.Vector3(p.x, p.y, 0)),
            widthLeft: limitWidthSlope(path,
                s => base * (1 + (scale - 1) * pressureResponse(pressureAt(s), gamma, threshold)), limit),
            renderer,
            seed,
        });
        const mesh = def.build();
        mesh.position.z = 0.05;
        document.getElementById('stat-points').textContent = points.length;
        document.getElementById('stat-width').textContent = (def.widthLeft(1) * PIXELS_PER_UNIT).toFixed(1);
        return { mesh, renderer };
    },
    minDistance: parseFloat(document.getElementById('minmove').value) / PIXELS_PER_UNIT,
});

controls.minmove.addEventListener('input', () => {
    cycle.input.minDistance = parseFloat(controls.minmove.value) / PIXELS_PER_UNIT;
});

document.getElementById('clear-btn').addEventListener('click', () => {
    cycle.disposeGhost();
    board.clear('#ffffff');
    stage.draw();
});
