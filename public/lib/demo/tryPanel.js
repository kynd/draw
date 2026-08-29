import * as THREE from 'three';
import { StrokeDef } from '../StrokeDef.js';
import { Palette } from '../Palette.js';
import { taper } from './strokePaths.js';
import { setupDrawCycle } from './drawCycle.js';
import { pressureAlong, averagePressure, limitWidthSlope } from './pressure.js';

/**
 * The try-drawing harness every stroke page shares.
 *
 * A registry entry describes one stroke: its parameter specs and a factory from the
 * current values to a renderer. The harness owns everything else: the dropdown, the
 * parameter rows it rebuilds on selection, the per-stroke memory of adjusted values,
 * the color state (shown in the panel's swatches; the randomize button draws a fresh
 * palette each time). The drawing itself runs on the shared draw cycle, which also
 * keeps the last baked stroke's wireframe while the overlay is on.
 *
 * Pen pressure recorded by DrawInput modulates the width along the stroke, and
 * reaches makeMesh entries as one `pressureScale` for the whole mark. Sensitivity
 * comes from the panel's pressure slider: at 0 pressure does nothing, at 1 full
 * pressure doubles the width.
 *
 * Registry entry: { id, label, params: [{ key, label, min, max, step, value }],
 *   make(values, ctx) } where ctx carries colorA, colorB, colors (a shade list),
 *   texture (the accumulation, for strokes that sample the background), and seed.
 */
export function setupTryDrawing({ stage, board, canvas, registry, select, paramsEl, clearBtn, colorBtn, swatchesEl, pressureEl }) {
    const values = Object.fromEntries(registry.map(r =>
        [r.id, Object.fromEntries(r.params.map(p => [p.key, p.value]))]));
    let currentId = registry[0].id;
    let palette, colors;

    // Pen pressure sensitivity: at 0 pressure does nothing, at 1 full pressure
    // doubles the width. A mouse records zero pressure, so it is unaffected.
    let pressureSens = pressureEl ? parseFloat(pressureEl.value) : 0;
    if (pressureEl) {
        const val = pressureEl.nextElementSibling;
        const show = () => { if (val) val.textContent = pressureSens.toFixed(2); };
        show();
        pressureEl.addEventListener('input', () => {
            pressureSens = parseFloat(pressureEl.value);
            show();
        });
    }

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
        cycle.disposeGhost();
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

    const cycle = setupDrawCycle({
        stage, board, canvas,
        build: (path, points, seed) => {
            const reg = registry.find(r => r.id === currentId);
            const v = values[currentId];
            const pressureAt = pressureAlong(points);

            // An entry may build its own mesh from the path, for marks that are
            // not strokes, such as blob fills. Those have no width; pressure
            // reaches them as one scale for the whole mark.
            if (reg.makeMesh) {
                const made = reg.makeMesh(path, v, {
                    colorA: colors.a, colorB: colors.b, colors: colors.list,
                    texture: board.texture, seed,
                    pressureScale: 1 + pressureSens * averagePressure(points),
                });
                if (!made) return null;
                made.mesh.position.z = 0.05;
                return made;
            }
            const renderer = reg.make(v, {
                colorA: colors.a, colorB: colors.b, colors: colors.list,
                texture: board.texture, seed,
            });
            const baseWidth = taper(v.width);
            const def = new StrokeDef({
                points: path.map(p => new THREE.Vector3(p.x, p.y, 0)),
                widthLeft: limitWidthSlope(path,
                    t => baseWidth(t) * (1 + pressureSens * pressureAt(t))),
                renderer,
                seed,
            });
            const mesh = def.build();
            mesh.position.z = 0.05;
            return { mesh, renderer };
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
