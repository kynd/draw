import * as THREE from 'three';
import { seededRandom } from '../random.js';
import { randomThemedPalette, paperColor } from '../ThemedPaletteMaker.js';
import { StrokeStage } from './stage.js';
import { DrawingBoard } from './drawingBoard.js';
import { DrawInput } from './drawInput.js';

/**
 * The harness the endpoint-shape demos share: a drawing board where each
 * gesture becomes one shape from its start and end points, shown live while
 * drawing and baked on release.
 *
 * `shapes` is [{ label, make(a, b, seed) }], offered in the shape select
 * under a cycle that advances per stroke. `makeRenderer(ctx)` returns one
 * shape's fill; ctx carries { color, texture, start, end, seed, values },
 * with `values` read from the `controls` sliders by id.
 */
export function setupShapeBoard({ shapes, makeRenderer, controls = {}, theme = 'vivid-dark' }) {
    const stage = new StrokeStage(document.getElementById('canvas'));
    const board = new DrawingBoard(stage);
    const rand = seededRandom(29);

    const select = document.getElementById('shape-select');
    shapes.forEach((shape, i) => {
        const option = document.createElement('option');
        option.value = String(i);
        option.textContent = shape.label;
        select.appendChild(option);
    });
    const ctrl = Object.fromEntries(Object.keys(controls).map(k =>
        [k, document.getElementById(k)]));
    Object.entries(controls).forEach(([k, value]) => {
        ctrl[k].value = String(value);
        document.getElementById(`${k}-val`).textContent = value.toFixed(2);
        ctrl[k].addEventListener('input', () => {
            document.getElementById(`${k}-val`).textContent =
                parseFloat(ctrl[k].value).toFixed(2);
        });
    });

    let palette = randomThemedPalette(theme);
    let backgroundSpec = null;
    let seed = 1;
    let cycle = 0;
    let color = '#000000';
    let live = null;

    function rollBackground() {
        return {
            type: rand() < 0.5 ? 'linear' : 'radial',
            colorA: paperColor(palette.entries[0].H, rand),
            colorB: paperColor(palette.entries[1 % palette.length].H, rand),
            angle: rand() * Math.PI * 2,
            center: [0.25 + rand() * 0.5, 0.25 + rand() * 0.5],
        };
    }

    function nextStroke() {
        seed += 1;
        color = palette.entries[Math.floor(rand() * palette.length)].hex;
    }

    function values() {
        return Object.fromEntries(Object.keys(controls).map(k =>
            [k, parseFloat(ctrl[k].value)]));
    }

    /** The shape the next stroke draws: the pinned one, or the cycle's turn. */
    function currentShape() {
        return select.value === 'cycle'
            ? shapes[cycle % shapes.length]
            : shapes[parseInt(select.value, 10)];
    }

    function makeEntry(shape, a, b) {
        const contour = shape.make(a, b, seed);
        if (!contour) return null;
        const renderer = makeRenderer({
            color, texture: board.texture, start: a, end: b, seed,
            values: values(),
        });
        const mesh = renderer.build(contour, seed);
        mesh.position.z = 0.05;
        return { mesh, renderer };
    }

    function bake(entry) {
        board.bake([entry.mesh]);
        entry.renderer.dispose(entry.mesh);
        nextStroke();
    }

    function disposeLive() {
        if (!live) return;
        stage.remove(live.mesh);
        live.renderer.dispose(live.mesh);
        live = null;
    }

    // The gesture's own path, shown while drawing and gone on release.
    const pointerLine = new THREE.Line(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({ color: '#000000', transparent: true, opacity: 0.35 })
    );
    pointerLine.position.z = 0.06;
    pointerLine.frustumCulled = false;
    stage.add(pointerLine);

    function setLine(points) {
        pointerLine.geometry.dispose();
        const geometry = new THREE.BufferGeometry();
        const array = new Float32Array(points.length * 3);
        points.forEach((p, i) => {
            array[i * 3] = p.x;
            array[i * 3 + 1] = p.y;
            array[i * 3 + 2] = 0;
        });
        geometry.setAttribute('position', new THREE.BufferAttribute(array, 3));
        pointerLine.geometry = geometry;
    }

    function onChange(points, done) {
        disposeLive();
        setLine(done ? [] : points);
        if (points.length >= 2) {
            const entry = makeEntry(currentShape(), points[0], points[points.length - 1]);
            if (entry && done) {
                bake(entry);
                if (select.value === 'cycle') cycle += 1;
            } else if (entry) {
                live = entry;
                stage.add(entry.mesh);
            }
        }
        stage.draw();
    }

    /** One starting shape of each kind, so the page never opens empty. */
    function seedShapes() {
        shapes.forEach((shape, i) => {
            const cx = (i - (shapes.length - 1) / 2) * stage.extentX * 0.62;
            const cy = (rand() - 0.5) * stage.extentY * 0.6;
            const angle = rand() * Math.PI * 2;
            const r = 0.35 + rand() * 0.25;
            const a = new THREE.Vector3(cx - Math.cos(angle) * r, cy - Math.sin(angle) * r, 0);
            const b = new THREE.Vector3(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r, 0);
            const entry = makeEntry(shape, a, b);
            if (entry) bake(entry);
        });
    }

    function reset() {
        backgroundSpec = rollBackground();
        board.clear(backgroundSpec);
        cycle = 0;
        seedShapes();
        stage.draw();
    }

    new DrawInput(document.getElementById('canvas'), stage, { onChange });

    document.getElementById('random-btn').addEventListener('click', () => {
        palette = randomThemedPalette(theme);
        nextStroke();
        reset();
    });
    document.getElementById('clear-btn').addEventListener('click', () => {
        board.clear(backgroundSpec);
        stage.draw();
    });

    stage.onResize(() => {
        if (pendingReset) {
            pendingReset = false;
            reset();
            return;
        }
        stage.draw();
    });

    nextStroke();
    // The first layout pass can land after construction, when the stage still
    // has no size, so the first reset waits for the resize that sizes it.
    let pendingReset = stage.extentX <= 0.01;
    if (!pendingReset) reset();
    return { stage, board };
}
