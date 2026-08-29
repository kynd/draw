import * as THREE from 'three';
import { StrokeDef } from '../StrokeDef.js';
import { Palette } from '../Palette.js';
import { resampleEvery, naturalSpline } from '../curves.js';
import { DrawInput } from './drawInput.js';
import { taper } from './strokePaths.js';

/**
 * The try-drawing harness every stroke page shares.
 *
 * A registry entry describes one stroke: its parameter specs and a factory from the
 * current values to a renderer. The harness owns everything else: the dropdown, the
 * parameter rows it rebuilds on selection, the per-stroke memory of adjusted values,
 * the color state (shown in the panel's swatches; the randomize button draws a fresh
 * palette each time), and the draw-then-bake cycle against a DrawingBoard. While the
 * wireframe overlay is on, the last baked stroke keeps its wireframe, as plain black
 * lines, until the next stroke starts.
 *
 * Registry entry: { id, label, params: [{ key, label, min, max, step, value }],
 *   make(values, ctx) } where ctx carries colorA, colorB, colors (a shade list),
 *   texture (the accumulation, for strokes that sample the background), and seed.
 */
export function setupTryDrawing({ stage, board, canvas, registry, select, paramsEl, clearBtn, colorBtn, swatchesEl }) {
    const values = Object.fromEntries(registry.map(r =>
        [r.id, Object.fromEntries(r.params.map(p => [p.key, p.value]))]));
    let currentId = registry[0].id;
    let seed = 1;
    let palette, colors;

    function newPalette() {
        palette = Palette.fromHues(
            Array.from({ length: 4 }, () => Math.random() * 360),
            { nLum: 5, lumHigh: 0.9, lumLow: 0.3, vibHigh: 0.95, vibLow: 0.3 }
        );
    }
    function nextColors() {
        const dark = palette.entries.filter(e => e.L < 0.68);
        const pick = () => dark[Math.floor(Math.random() * dark.length)].hex;
        colors = { a: pick(), b: pick(), list: dark.map(e => e.hex) };
        if (swatchesEl) {
            const swatches = swatchesEl.querySelectorAll('.dp-swatch');
            if (swatches[0]) swatches[0].style.background = colors.a;
            if (swatches[1]) swatches[1].style.background = colors.b;
        }
    }
    function clearCanvas() {
        disposeGhost();
        const e = palette.entries[Math.floor(Math.random() * palette.entries.length)];
        board.clear(e.hex);
        stage.draw();
    }

    registry.forEach(r => {
        const option = document.createElement('option');
        option.value = r.id;
        option.textContent = r.label;
        select.appendChild(option);
    });

    function buildParams() {
        const reg = registry.find(r => r.id === currentId);
        paramsEl.innerHTML = '';
        reg.params.forEach(p => {
            const row = document.createElement('div');
            row.className = 'dp-row';
            const label = document.createElement('span');
            label.className = 'dp-label';
            label.textContent = p.label;
            const input = document.createElement('input');
            input.type = 'range';
            input.className = 'dp-range';
            input.min = p.min; input.max = p.max; input.step = p.step;
            input.value = values[currentId][p.key];
            const val = document.createElement('span');
            val.className = 'dp-val';
            const decimals = p.step >= 1 ? 0 : (p.step >= 0.01 ? 2 : 3);
            const show = () => { val.textContent = parseFloat(input.value).toFixed(decimals); };
            show();
            input.addEventListener('input', () => {
                values[currentId][p.key] = parseFloat(input.value);
                show();
            });
            row.append(label, input, val);
            paramsEl.appendChild(row);
        });
    }

    let live = null;
    function disposeLive() {
        if (!live) return;
        stage.remove(live.mesh);
        live.renderer.dispose(live.mesh);
        live = null;
    }

    // The last baked stroke, kept as a wire-only overlay so the wireframe stays
    // readable over the bake until the next stroke starts. The stroke's own shader
    // would redraw the baked pixels in place, so the overlay swaps in plain black
    // lines, the same ink as the pointer path.
    let ghost = null;
    function makeWireOnly(mesh) {
        mesh.userData.wireOnly = true;
        mesh.traverse(child => {
            if (!child.isMesh) return;
            child.userData.origMaterial = child.material;
            child.material = new THREE.MeshBasicMaterial({ color: '#000000', wireframe: true });
        });
    }
    function disposeGhost() {
        if (!ghost) return;
        stage.remove(ghost.mesh);
        ghost.mesh.traverse(child => {
            if (!child.isMesh || !child.userData.origMaterial) return;
            child.material.dispose();
            child.material = child.userData.origMaterial;
            delete child.userData.origMaterial;
        });
        ghost.renderer.dispose(ghost.mesh);
        ghost = null;
    }

    // The pointer's own path, shown over the live stroke while drawing and gone on
    // release. THREE.Line stays one pixel wide at any scale.
    const pointerLine = new THREE.Line(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({ color: '#000000' })
    );
    pointerLine.position.z = 0.06;
    pointerLine.frustumCulled = false;
    stage.add(pointerLine);

    function setPointerLine(points) {
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

    function buildStroke(points) {
        if (points.length < 2) return null;
        // Light smoothing, so the mark follows the hand without recording its jitter.
        const knots = resampleEvery(points, 0.06);
        const path = knots.length >= 3 ? naturalSpline(knots, 6) : points;
        if (path.length < 2) return null;

        const reg = registry.find(r => r.id === currentId);
        const v = values[currentId];
        // An entry may build its own mesh from the path, for marks that are not
        // strokes, such as blob fills.
        if (reg.makeMesh) {
            const made = reg.makeMesh(path, v, {
                colorA: colors.a, colorB: colors.b, colors: colors.list,
                texture: board.texture, seed,
            });
            if (!made) return null;
            made.mesh.position.z = 0.05;
            return made;
        }
        const renderer = reg.make(v, {
            colorA: colors.a, colorB: colors.b, colors: colors.list,
            texture: board.texture, seed,
        });
        const def = new StrokeDef({
            points: path.map(p => new THREE.Vector3(p.x, p.y, 0)),
            widthLeft: taper(v.width),
            renderer,
            seed,
        });
        const mesh = def.build();
        mesh.position.z = 0.05;
        return { mesh, renderer };
    }

    new DrawInput(canvas, stage, {
        onChange: (points, done) => {
            disposeGhost();
            disposeLive();
            live = buildStroke(points);
            if (live) stage.add(live.mesh);
            setPointerLine(done ? [] : points);
            if (done && live) {
                board.bake([live.mesh]);
                ghost = live;
                makeWireOnly(ghost.mesh);
                // The bake scene borrowed the mesh; the overlay needs it back.
                stage.add(ghost.mesh);
                live = null;
                seed++;
            }
            stage.draw();
        },
    });

    select.addEventListener('change', () => {
        currentId = select.value;
        buildParams();
    });
    clearBtn.addEventListener('click', clearCanvas);
    // A fresh palette each time, so the colors are not draws from the same deck.
    colorBtn.addEventListener('click', () => { newPalette(); nextColors(); });

    newPalette();
    nextColors();
    clearCanvas();
    buildParams();
}
