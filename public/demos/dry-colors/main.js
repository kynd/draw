import { StrokeDef } from '../../lib/StrokeDef.js';
import { DryMediaStrokeRenderer } from '../../lib/renderers/DryMediaStrokeRenderer.js';
import { Palette } from '../../lib/Palette.js';
import { StrokeStage } from '../../lib/demo/stage.js';
import { wireCollapsibles } from '../../lib/demo/panel.js';
import { straightThenWiggle, layout, centerY, taper } from '../../lib/demo/strokePaths.js';

const SEEDS = [1.0, 2.3, 5.1];
const CAPS = ['rounded', 'square', 'ragged'];

// Pencil, charcoal, pastel: one renderer at three settings.
const MEDIA = [
    { width: 0.008, tooth: 2.0, grain: 0.55, softness: 0.35, edge: 0.08, pressure: 0.45, opacity: 1.0 },
    { width: 0.045, tooth: 4.5, grain: 0.70, softness: 0.50, edge: 0.30, pressure: 0.50, opacity: 0.92 },
    { width: 0.110, tooth: 7.0, grain: 0.80, softness: 0.65, edge: 0.55, pressure: 0.40, opacity: 0.95 },
];
const RAINBOW = [
    ['#b03038', '#b07a28', '#2f7a40', '#2f4a9a'],
    ['#4a3070', '#a03050', '#20606a', '#805020'],
    ['#c04828', '#c0a028', '#3a8a58', '#4858a8'],
];

const readout = document.getElementById('readout');
const ctrl = {
    grain: document.getElementById('grain'),
    pressure: document.getElementById('pressure'),
    scale: document.getElementById('scale'),
};

const stage = new StrokeStage(document.getElementById('canvas'));

let entries = [];
let colors = RAINBOW.map(list => [...list]);

function randomizeColors() {
    const palette = Palette.fromHues(
        Array.from({ length: 4 }, () => Math.random() * 360),
        { nLum: 5, lumHigh: 0.93, lumLow: 0.28, vibHigh: 0.95, vibLow: 0.30 }
    );
    const pick = list => list[Math.floor(Math.random() * list.length)];
    stage.setBackground(pick(palette.entries.filter(e => e.L > 0.85)).hex);

    const dark = palette.entries.filter(e => e.L < 0.6);
    return MEDIA.map(() => Array.from({ length: 4 }, () => pick(dark).hex));
}

function rebuild() {
    entries.forEach(({ mesh, renderer }) => {
        stage.remove(mesh);
        renderer.dispose(mesh);
    });
    entries = [];

    const scale = parseFloat(ctrl.scale.value);
    const grainScale = parseFloat(ctrl.grain.value);
    const pressureScale = parseFloat(ctrl.pressure.value);
    const { spread } = layout(stage.extentY, MEDIA[2].width * scale);
    let samples = 0, vertices = 0, triangles = 0;

    MEDIA.forEach((media, i) => {
        const renderer = new DryMediaStrokeRenderer({
            cap: CAPS[i],
            color: colors[i][0],
            colors: colors[i],
            blend: i === 0 ? 'along' : 'grain',
            grain: media.grain * grainScale,
            tooth: media.tooth,
            pressure: media.pressure * pressureScale,
            softness: media.softness,
            edge: media.edge,
            opacity: media.opacity,
        });
        const def = new StrokeDef({
            points: straightThenWiggle(centerY(i, MEDIA.length, spread), { z0: 0.01 + i * 0.01 }),
            widthLeft: taper(media.width * scale),
            renderer,
            seed: SEEDS[i],
        });
        const mesh = def.build();
        stage.add(mesh);

        const s = mesh.userData.stats;
        samples += s.sampleCount;
        vertices += s.vertexCount;
        triangles += s.triangleCount;
        entries.push({ mesh, renderer });
    });

    readout.innerHTML = `<div class="dp-stats">`
        + `<span>strokes<strong>${MEDIA.length}</strong></span>`
        + `<span>samples<strong>${samples}</strong></span>`
        + `<span>vertices<strong>${vertices}</strong></span>`
        + `<span>triangles<strong>${triangles}</strong></span></div>`;

    stage.draw();
}

Object.values(ctrl).forEach(el => {
    el.addEventListener('input', () => {
        document.getElementById(`${el.id}-val`).textContent = parseFloat(el.value).toFixed(2);
        rebuild();
    });
});

document.getElementById('random-btn').addEventListener('click', () => {
    colors = randomizeColors();
    rebuild();
});

stage.onResize(() => rebuild());
wireCollapsibles();
rebuild();
