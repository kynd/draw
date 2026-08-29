import * as THREE from 'three';
import { StrokeDef } from '../../lib/StrokeDef.js';
import { RibbonStrokeRenderer } from '../../lib/renderers/RibbonStrokeRenderer.js';
import { StrokeStage } from '../../lib/demo/stage.js';
import { DrawingBoard } from '../../lib/demo/drawingBoard.js';
import { setupDrawCycle } from '../../lib/demo/drawCycle.js';
import { pressureAlong, pressureResponse, limitWidthSlope } from '../../lib/demo/pressure.js';

const controls = {};
['base', 'add', 'curve', 'limit', 'minmove'].forEach(id => {
    const input = document.getElementById(id);
    const val = input.nextElementSibling;
    const decimals = id === 'minmove' ? 3 : (id === 'curve' ? 2 : (id === 'add' ? 2 : 3));
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
        const add = parseFloat(controls.add.value);
        const gamma = parseFloat(controls.curve.value);
        const limit = parseFloat(controls.limit.value);
        const pressureAt = pressureAlong(points);
        const renderer = new RibbonStrokeRenderer({ cap: 'rounded', color: '#808080' });
        const def = new StrokeDef({
            points: path.map(p => new THREE.Vector3(p.x, p.y, 0)),
            widthLeft: limitWidthSlope(path,
                s => base + add * pressureResponse(pressureAt(s), gamma), limit),
            renderer,
            seed,
        });
        const mesh = def.build();
        mesh.position.z = 0.05;
        document.getElementById('stat-points').textContent = points.length;
        document.getElementById('stat-width').textContent = def.widthLeft(1).toFixed(3);
        return { mesh, renderer };
    },
    minDistance: parseFloat(document.getElementById('minmove').value),
});

controls.minmove.addEventListener('input', () => {
    cycle.input.minDistance = parseFloat(controls.minmove.value);
});

document.getElementById('clear-btn').addEventListener('click', () => {
    cycle.disposeGhost();
    board.clear('#ffffff');
    stage.draw();
});
