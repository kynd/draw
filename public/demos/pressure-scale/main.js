import * as THREE from 'three';
import { StrokeDef } from '../../lib/StrokeDef.js';
import { RibbonStrokeRenderer } from '../../lib/renderers/RibbonStrokeRenderer.js';
import { StrokeStage } from '../../lib/demo/stage.js';
import { DrawingBoard } from '../../lib/demo/drawingBoard.js';
import { setupDrawCycle } from '../../lib/demo/drawCycle.js';
import { pressureAlong, pressureResponse, limitWidthSlope } from '../../lib/demo/pressure.js';

const controls = {};
['base', 'scale', 'curve', 'limit'].forEach(id => {
    const input = document.getElementById(id);
    const val = input.nextElementSibling;
    const decimals = id === 'base' ? 3 : (id === 'scale' ? 1 : 2);
    const show = () => { val.textContent = parseFloat(input.value).toFixed(decimals); };
    show();
    input.addEventListener('input', show);
    controls[id] = input;
});

const stage = new StrokeStage(document.getElementById('canvas'), {
    fit: { width: 1.70, height: 1.0 }, background: '#ffffff',
});
const board = new DrawingBoard(stage, { background: '#ffffff' });

const cycle = setupDrawCycle({
    stage, board,
    canvas: document.getElementById('canvas'),
    build: (path, points, seed) => {
        const base = parseFloat(controls.base.value);
        const scale = parseFloat(controls.scale.value);
        const gamma = parseFloat(controls.curve.value);
        const limit = parseFloat(controls.limit.value);
        const pressureAt = pressureAlong(points);
        const renderer = new RibbonStrokeRenderer({ cap: 'rounded', color: '#808080' });
        const def = new StrokeDef({
            points: path.map(p => new THREE.Vector3(p.x, p.y, 0)),
            widthLeft: limitWidthSlope(path,
                t => base * (1 + (scale - 1) * pressureResponse(pressureAt(t), gamma)), limit),
            renderer,
            seed,
        });
        const mesh = def.build();
        mesh.position.z = 0.05;
        return { mesh, renderer };
    },
});

document.getElementById('clear-btn').addEventListener('click', () => {
    cycle.disposeGhost();
    board.clear('#ffffff');
    stage.draw();
});
