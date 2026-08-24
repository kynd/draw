import { StrokeDef } from '../../lib/StrokeDef.js';
import { RibbonStrokeRenderer } from '../../lib/renderers/RibbonStrokeRenderer.js';
import { HaloStrokeRenderer } from '../../lib/renderers/HaloStrokeRenderer.js';
import { EmbossStrokeRenderer } from '../../lib/renderers/EmbossStrokeRenderer.js';
import { Palette } from '../../lib/Palette.js';
import { StrokeStage } from '../../lib/demo/stage.js';
import { wireCollapsibles } from '../../lib/demo/panel.js';
import { straightThenWiggle, layout, centerY, taper } from '../../lib/demo/strokePaths.js';

const ROWS = 3;
const SEEDS = [1.0, 2.3, 5.1];
const CAPS = ['rounded', 'square', 'ragged'];

const readout = document.getElementById('readout');
const ctrl = {
    offset: document.getElementById('offset'),
    softness: document.getElementById('softness'),
    glow: document.getElementById('glow'),
    width: document.getElementById('width'),
};

const stage = new StrokeStage(document.getElementById('canvas'), {
    fit: { width: 1.70, height: 1.60 },
});

let entries = [];
let colors = [];
let glowColor = '#7fd0ff';

function randomizeColors() {
    const palette = Palette.fromHues(
        Array.from({ length: 4 }, () => Math.random() * 360),
        { nLum: 5, lumHigh: 0.93, lumLow: 0.28, vibHigh: 0.95, vibLow: 0.30 }
    );
    const pick = list => list[Math.floor(Math.random() * list.length)];
    stage.setBackground(pick(palette.entries.filter(e => e.L > 0.85)).hex);

    // The glow wants the most saturated bright entry, not any bright entry.
    const bright = palette.entries.filter(e => e.L > 0.55);
    glowColor = bright.reduce((best, e) => (e.C > best.C ? e : best), bright[0]).hex;

    const byHue = new Map();
    palette.entries.filter(e => e.L < 0.6).forEach(e => {
        if (!byHue.has(e.H)) byHue.set(e.H, []);
        byHue.get(e.H).push(e);
    });
    const groups = [...byHue.values()].sort(() => Math.random() - 0.5);
    return Array.from({ length: ROWS }, (_, i) => pick(groups[i % groups.length]).hex);
}

function rebuild() {
    entries.forEach(({ mesh, renderer }) => {
        stage.remove(mesh);
        renderer.dispose(mesh);
    });
    entries = [];

    const width = parseFloat(ctrl.width.value);
    const offset = parseFloat(ctrl.offset.value);
    const softness = parseFloat(ctrl.softness.value);
    const glow = parseFloat(ctrl.glow.value);
    const { spread } = layout(stage.extentY, width * (1 + softness * 0.5));
    let samples = 0, vertices = 0, triangles = 0;

    const addMesh = (renderer, def, position = null) => {
        const mesh = def.build();
        if (position) mesh.position.copy(position);
        stage.add(mesh);
        const s = mesh.userData.stats;
        samples += s.sampleCount;
        vertices += s.vertexCount;
        triangles += s.triangleCount;
        entries.push({ mesh, renderer });
    };

    for (let i = 0; i < ROWS; i++) {
        const points = straightThenWiggle(centerY(i, ROWS, spread), { z0: 0.02 + i * 0.02 });
        const makeDef = renderer => new StrokeDef({
            points, widthLeft: taper(width), renderer, seed: SEEDS[i],
        });

        if (i === 0) {
            const halo = new HaloStrokeRenderer({
                cap: CAPS[i], color: '#101014', feather: softness, opacity: 0.45,
            });
            addMesh(halo, makeDef(halo));
            entries[entries.length - 1].mesh.position.set(offset, -offset, -0.01);
            const ribbon = new RibbonStrokeRenderer({ cap: CAPS[i], color: colors[i] });
            addMesh(ribbon, makeDef(ribbon));
        } else if (i === 1) {
            const emboss = new EmbossStrokeRenderer({ cap: CAPS[i], color: colors[i] });
            addMesh(emboss, makeDef(emboss));
        } else {
            const halo = new HaloStrokeRenderer({
                cap: CAPS[i], color: glowColor, feather: softness * 2.2,
                opacity: glow,
            });
            addMesh(halo, makeDef(halo));
            entries[entries.length - 1].mesh.position.set(0, 0, -0.01);
            const ribbon = new RibbonStrokeRenderer({ cap: CAPS[i], color: colors[i] });
            addMesh(ribbon, makeDef(ribbon));
        }
    }

    readout.innerHTML = `<div class="dp-stats">`
        + `<span>meshes<strong>${entries.length}</strong></span>`
        + `<span>samples<strong>${samples}</strong></span>`
        + `<span>vertices<strong>${vertices}</strong></span>`
        + `<span>triangles<strong>${triangles}</strong></span></div>`;

    stage.draw();
}

Object.values(ctrl).forEach(el => {
    el.addEventListener('input', () => {
        document.getElementById(`${el.id}-val`).textContent =
            parseFloat(el.value).toFixed(el.id === 'width' || el.id === 'offset' ? 3 : 2);
        rebuild();
    });
});

document.getElementById('random-btn').addEventListener('click', () => {
    colors = randomizeColors();
    rebuild();
});

stage.onResize(() => rebuild());
wireCollapsibles();
colors = randomizeColors();
rebuild();
