import * as THREE from 'three';
import { StrokeDef } from '../../lib/StrokeDef.js';
import { PIXELS_PER_UNIT } from '../../lib/CanvasBuffer.js';
import { DryMediaStrokeRenderer } from '../../lib/renderers/DryMediaStrokeRenderer.js';
import { StrokeStage } from '../../lib/demo/stage.js';
import { DrawingBoard } from '../../lib/demo/drawingBoard.js';
import { setupDrawCycle } from '../../lib/demo/drawCycle.js';
import { taperByArc } from '../../lib/demo/strokePaths.js';
import { pathArcLength } from '../../lib/demo/pressure.js';

const PAPER = '#f3f0ea';
const CHARCOAL = '#2a2a2e';

const widthInput = document.getElementById('width');
const stage = new StrokeStage(document.getElementById('canvas'), { background: PAPER });
const board = new DrawingBoard(stage, { background: PAPER });

const cycle = setupDrawCycle({
    stage, board,
    canvas: document.getElementById('canvas'),
    build: (path, points, seed) => {
        const width = parseFloat(widthInput.value) / PIXELS_PER_UNIT;
        const renderer = new DryMediaStrokeRenderer({
            cap: 'ragged', color: CHARCOAL,
            grain: 0.7, tooth: 4.5, pressure: 0.5, softness: 0.5, edge: 0.3, opacity: 0.92,
        });
        const def = new StrokeDef({
            points: path.map(p => new THREE.Vector3(p.x, p.y, 0)),
            widthLeft: taperByArc(width, pathArcLength(path)),
            renderer,
            seed,
        });
        const mesh = def.build();
        mesh.position.z = 0.05;
        return { mesh, renderer };
    },
    pointerTrace: false,
});

// The right half shows the coverage layer's own buffer: a dark backing, and a
// quad sampling the layer's target, so the piece being drawn appears there
// alone, at half scale, with its self-overlaps already reduced.
const backing = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: '#232323' })
);
backing.position.z = 1.0;
backing.userData.overlay = true;
stage.add(backing);

// The buffer's coverage drawn as brightness, so the single-coverage result
// reads directly: a fold does not brighten, because MAX kept one covering.
const view = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.ShaderMaterial({
        uniforms: { uMap: { value: stage.coverage.target.texture } },
        vertexShader: /* glsl */`
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: /* glsl */`
            uniform sampler2D uMap;
            varying vec2 vUv;
            void main() {
                gl_FragColor = vec4(vec3(texture2D(uMap, vUv).a), 1.0);
            }
        `,
    })
);
view.position.z = 1.01;
view.userData.overlay = true;
stage.add(view);

function layoutBufferView() {
    backing.scale.set(stage.extentX, stage.extentY * 2, 1);
    backing.position.x = stage.extentX / 2;
    view.scale.set(stage.extentX * 0.92, stage.extentY * 0.92, 1);
    view.position.x = stage.extentX / 2;
}

document.getElementById('clear-btn').addEventListener('click', () => {
    cycle.disposeGhost();
    board.clear(PAPER);
    stage.draw();
});
widthInput.addEventListener('input', () => {
    document.getElementById('width-val').textContent = widthInput.value;
});

stage.onResize(() => layoutBufferView());
layoutBufferView();
board.clear(PAPER);
stage.draw();
