import { StrokeDef } from '../../lib/StrokeDef.js';
import { BrushStrokeRenderer } from '../../lib/renderers/BrushStrokeRenderer.js';
import { spiralPath, entangledPaths, scatteredPaths } from '../../lib/pathEffects.js';
import { Palette } from '../../lib/Palette.js';
import { StrokeStage } from '../../lib/demo/stage.js';
import { wireCollapsibles } from '../../lib/demo/panel.js';
import { straightThenWiggle, layout, centerY, taper } from '../../lib/demo/strokePaths.js';

const ROWS = 3;
const SEEDS = [3.0, 7.0, 11.0];

const readout = document.getElementById('readout');
const ctrl = {
    turns: document.getElementById('turns'),
    width: document.getElementById('width'),
};

const stage = new StrokeStage(document.getElementById('canvas'));

let entries = [];
let colorGroups = [];

function randomizeColors() {
    const palette = Palette.fromHues(
        Array.from({ length: 4 }, () => Math.random() * 360),
        { nLum: 5, lumHigh: 0.93, lumLow: 0.28, vibHigh: 0.95, vibLow: 0.30 }
    );
    const pick = list => list[Math.floor(Math.random() * list.length)];
    stage.setBackground(pick(palette.entries.filter(e => e.L > 0.85)).hex);

    const byHue = new Map();
    palette.entries.filter(e => e.L < 0.62).forEach(e => {
        if (!byHue.has(e.H)) byHue.set(e.H, []);
        byHue.get(e.H).push(e);
    });
    const groups = [...byHue.values()].sort(() => Math.random() - 0.5);
    return Array.from({ length: ROWS }, (_, i) =>
        groups[i % groups.length].map(e => e.hex));
}

/**
 * Derived paths for row `i`. The count of sub-strokes and their offset from the base
 * both follow the width, so a heavier stroke spreads further and splits into more
 * parts rather than only thickening.
 */
function derive(i, base, width) {
    const reach = width * 7;
    if (i === 0) {
        return [spiralPath(base, { turns: parseInt(ctrl.turns.value, 10), radius: reach })];
    }
    if (i === 1) {
        return entangledPaths(base, {
            count: Math.round(3 + width * 260),
            amplitude: reach,
            seed: SEEDS[i],
        });
    }
    return scatteredPaths(base, {
        count: Math.round(25 + width * 3200),
        offset: reach,
        length: 0.04 + width * 1.2,
        seed: SEEDS[i],
    });
}

function rebuild() {
    entries.forEach(({ mesh, renderer }) => {
        stage.remove(mesh);
        renderer.dispose(mesh);
    });
    entries = [];

    const width = parseFloat(ctrl.width.value);
    const { spread } = layout(stage.extentY, width * 8);
    let samples = 0, vertices = 0, triangles = 0, strokes = 0;

    for (let i = 0; i < ROWS; i++) {
        const base = straightThenWiggle(centerY(i, ROWS, spread), { z0: 0.01 + i * 0.01 });
        const group = colorGroups[i];
        derive(i, base, width).forEach((path, k) => {
            const renderer = new BrushStrokeRenderer({
                cap: 'rounded',
                colorA: group[k % group.length],
                colorB: group[(k + 2) % group.length],
                bristles: Math.max(4, Math.round(width * 700)),
                rough: 0.45,
                dry: 0.22,
                samplesPerUnit: 90,
            });
            const def = new StrokeDef({
                points: path,
                widthLeft: taper(width),
                renderer,
                seed: SEEDS[i] + k,
            });
            const mesh = def.build();
            stage.add(mesh);

            const s = mesh.userData.stats;
            samples += s.sampleCount;
            vertices += s.vertexCount;
            triangles += s.triangleCount;
            strokes++;
            entries.push({ mesh, renderer });
        });
    }

    readout.innerHTML = `<div class="dp-stats">`
        + `<span>strokes<strong>${strokes}</strong></span>`
        + `<span>samples<strong>${samples}</strong></span>`
        + `<span>vertices<strong>${vertices}</strong></span>`
        + `<span>triangles<strong>${triangles}</strong></span></div>`;

    stage.draw();
}

Object.values(ctrl).forEach(el => {
    el.addEventListener('input', () => {
        document.getElementById(`${el.id}-val`).textContent =
            el.id === 'width' ? parseFloat(el.value).toFixed(3) : el.value;
        rebuild();
    });
});

document.getElementById('random-btn').addEventListener('click', () => {
    colorGroups = randomizeColors();
    rebuild();
});

stage.onResize(() => rebuild());
wireCollapsibles();
colorGroups = randomizeColors();
rebuild();
