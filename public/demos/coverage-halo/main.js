import * as THREE from 'three';
import { StrokeDef } from '../../lib/StrokeDef.js';
import { PIXELS_PER_UNIT } from '../../lib/CanvasBuffer.js';
import { HaloStrokeRenderer } from '../../lib/renderers/HaloStrokeRenderer.js';
import { randomSchemePalette, paperColor } from '../../lib/SchemePaletteMaker.js';
import { StrokeStage } from '../../lib/demo/stage.js';
import { DrawingBoard } from '../../lib/demo/drawingBoard.js';
import { setupDrawCycle } from '../../lib/demo/drawCycle.js';
import { uniformWidth } from '../../lib/demo/strokePaths.js';

// A single-hue halo drawn through the coverage layer. The left half draws a glow
// or a shadow; the right half shows the layer's buffer as brightness. A halo is
// one color, so MAX keeps its self-overlap at single coverage: the crossing
// neither darkens nor doubles.
const widthInput = document.getElementById('width');
const modeInput = document.getElementById('mode');
const width = () => parseFloat(widthInput.value) / PIXELS_PER_UNIT;

let colorA = '#46608a';
let haloColor = '#f5e9a8';
let paper = '#f3f0ea';

const stage = new StrokeStage(document.getElementById('canvas'), { background: paper });
const board = new DrawingBoard(stage, { background: paper });

function rollColors() {
    const palette = randomSchemePalette('vivid-wheel');
    const hex = palette.toHexArray();
    colorA = hex[0];
    haloColor = hex[2 % hex.length];
    paper = paperColor(palette.entries[0].H);
    stage.setBackground(paper);
    board.clear(paper);
}

const cycle = setupDrawCycle({
    stage, board,
    canvas: document.getElementById('canvas'),
    build: (path, points, seed) => {
        const glow = modeInput.value === 'glow';
        const renderer = new HaloStrokeRenderer({
            mode: glow ? 'glow' : 'shadow',
            color: colorA, haloColor: glow ? haloColor : colorA,
            spread: glow ? 1.8 : 0.9, opacity: glow ? 0.9 : 0.5,
        });
        const def = new StrokeDef({
            points: path.map(p => new THREE.Vector3(p.x, p.y, 0)),
            widthLeft: uniformWidth(width()), renderer, seed,
        });
        const mesh = def.build();
        mesh.position.z = 0.05;
        return { mesh, renderer };
    },
    widthFor: width,
    split: false,
    pointerTrace: false,
});

// The right half: the coverage layer's buffer, its coverage drawn as brightness,
// so a self-overlap that keeps single coverage reads as one flat shape.
const backing = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: '#232323' })
);
backing.position.z = 1.0;
backing.userData.overlay = true;
stage.add(backing);

const view = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.ShaderMaterial({
        uniforms: { uMap: { value: stage.coverage.target.texture } },
        vertexShader: /* glsl */`
            varying vec2 vUv;
            void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
        `,
        fragmentShader: /* glsl */`
            uniform sampler2D uMap;
            varying vec2 vUv;
            void main() { gl_FragColor = vec4(vec3(texture2D(uMap, vUv).a), 1.0); }
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
    board.clear(paper);
    stage.draw();
});
document.getElementById('random-btn').addEventListener('click', () => {
    cycle.disposeGhost();
    rollColors();
    stage.draw();
});
widthInput.addEventListener('input', () => {
    document.getElementById('width-val').textContent = widthInput.value;
});

stage.onResize(() => layoutBufferView());
rollColors();
layoutBufferView();
stage.draw();
