import * as THREE from 'three';
import { StrokeDef } from '../../lib/StrokeDef.js';
import { PIXELS_PER_UNIT } from '../../lib/CanvasBuffer.js';
import { BrushStrokeRenderer } from '../../lib/renderers/BrushStrokeRenderer.js';
import { SmearStrokeRenderer } from '../../lib/renderers/SmearStrokeRenderer.js';
import { StrokeStage } from '../../lib/demo/stage.js';
import { DrawingBoard } from '../../lib/demo/drawingBoard.js';
import { setupDrawCycle } from '../../lib/demo/drawCycle.js';
import { uniformWidth } from '../../lib/demo/strokePaths.js';

const PAPER = '#f3f0ea';

const widthInput = document.getElementById('width');
const stage = new StrokeStage(document.getElementById('canvas'), { background: PAPER });
const board = new DrawingBoard(stage, { background: PAPER });

// Each gesture's seed is fixed while it draws and advances by a fixed span on
// release, so a stroke keeps one color as it grows and the next takes a new one.
// The hue steps by the golden ratio per gesture, so consecutive strokes are well
// separated, and it derives from the seed, so the same drawing replays in the
// same colors. All pieces of one split gesture share the gesture's hue.
const fract = x => x - Math.floor(x);
function colorsForSeed(seed) {
    const gesture = Math.round(seed / 100);
    const h = fract(0.137 + gesture * 0.61803399);
    const a = new THREE.Color().setHSL(h, 0.62, 0.56);
    const b = new THREE.Color().setHSL(fract(h + 0.07), 0.70, 0.44);
    return [`#${a.getHexString()}`, `#${b.getHexString()}`];
}

// Per gesture, pick either the loaded brush or a smear that drags color along
// the path (sampling the buffer it is drawn over). The choice comes from the
// seed, so a stroke keeps one tool as it grows and a replay reproduces it.
function makeRenderer(seed) {
    const gesture = Math.round(seed / 100);
    const [colorA, colorB] = colorsForSeed(seed);
    const smear = fract(Math.sin(gesture * 45.233) * 12543.21) < 0.5;
    return smear
        ? new SmearStrokeRenderer({ cap: 'rounded', color: colorA, background: board.texture, tint: 0.6 })
        : new BrushStrokeRenderer({ cap: 'rounded', colorA, colorB });
}

// A checkerboard cover over the whole canvas, above the board's accumulation
// plane but below the live stroke, so the left pane shows only the current stroke
// over a transparency grid rather than the committed drawing. The committed
// drawing is shown on the right, read straight from the board's buffer texture.
const cover = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.ShaderMaterial({
        uniforms: { uCells: { value: new THREE.Vector2(1, 1) } },
        vertexShader: /* glsl */`
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: /* glsl */`
            uniform vec2 uCells;
            varying vec2 vUv;
            void main() {
                vec2 c = floor(vUv * uCells);
                float k = mod(c.x + c.y, 2.0);
                vec3 col = mix(vec3(0.80), vec3(0.93), k);
                gl_FragColor = vec4(col, 1.0);
            }
        `,
    })
);
cover.position.z = 0.01;
stage.add(cover);

const cycle = setupDrawCycle({
    stage, board,
    canvas: document.getElementById('canvas'),
    build: (path, points, seed) => {
        const width = parseFloat(widthInput.value) / PIXELS_PER_UNIT;
        const renderer = makeRenderer(seed);
        const def = new StrokeDef({
            points: path.map(p => new THREE.Vector3(p.x, p.y, 0)),
            widthLeft: uniformWidth(width),
            renderer,
            seed,
        });
        const mesh = def.build();
        mesh.position.z = 0.05;
        return { mesh, renderer };
    },
    pointerTrace: false,
});

// The right half shows the canvas buffer at the same framing as the left. It
// samples the board's accumulation over the left half of the world (the drawn
// region), so the two panes show the same region: the left the current stroke
// alone, the right the committed buffer, which the stroke joins only when the
// gesture bakes on release.
const view = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.ShaderMaterial({
        uniforms: { uMap: { value: board.texture } },
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
                gl_FragColor = vec4(texture2D(uMap, vec2(vUv.x * 0.5, vUv.y)).rgb, 1.0);
            }
        `,
    })
);
view.position.z = 1.01;
view.userData.overlay = true;
stage.add(view);

function layout() {
    cover.scale.set(stage.extentX * 2, stage.extentY * 2, 1);
    cover.position.set(0, 0, 0.01);
    // Square checker cells of a fixed size in CSS pixels, whatever the canvas size.
    const cell = 11 / PIXELS_PER_UNIT;
    cover.material.uniforms.uCells.value.set(
        (stage.extentX * 2) / cell, (stage.extentY * 2) / cell);
    view.scale.set(stage.extentX, stage.extentY * 2, 1);
    view.position.x = stage.extentX / 2;
}

// The accumulation ping-pongs between two targets, so the front texture changes
// after every bake; point the view at the current one each frame.
stage.addPreRender(() => { view.material.uniforms.uMap.value = board.texture; });

document.getElementById('clear-btn').addEventListener('click', () => {
    cycle.disposeGhost();
    board.clear(PAPER);
    stage.draw();
});
widthInput.addEventListener('input', () => {
    document.getElementById('width-val').textContent = widthInput.value;
});

stage.onResize(() => layout());
layout();
board.clear(PAPER);
stage.draw();
