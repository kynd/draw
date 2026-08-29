import { StrokeDef } from '../../lib/StrokeDef.js';
import { RibbonStrokeRenderer } from '../../lib/renderers/RibbonStrokeRenderer.js';
import { DebossStrokeRenderer } from '../../lib/renderers/DebossStrokeRenderer.js';
import { StrokeHalo } from '../../lib/StrokeHalo.js';
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

// One halo per effect. Each renders its own strokes into a private target, blurs
// there, and hands back a plane, so the softness cannot fold with the path.
const shadowHalo = new StrokeHalo({ color: '#101014', opacity: 0.45 });
const glowHalo = new StrokeHalo({ opacity: 0.85 });
stage.add(shadowHalo.mesh);
stage.add(glowHalo.mesh);
stage.addPreRender((renderer, camera, w, h) => {
    shadowHalo.update(renderer, camera, w, h);
    glowHalo.update(renderer, camera, w, h);
});

let entries = [];
let silhouettes = [];
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
    silhouettes.forEach(({ mesh, renderer }) => renderer.dispose(mesh));
    silhouettes = [];

    const width = parseFloat(ctrl.width.value);
    const offset = parseFloat(ctrl.offset.value);
    const softness = parseFloat(ctrl.softness.value);
    const { spread } = layout(stage.extentY, width * 1.4);
    let samples = 0, vertices = 0, triangles = 0;

    const build = (renderer, points, seed, track = true) => {
        const def = new StrokeDef({ points, widthLeft: taper(width), renderer, seed });
        const mesh = def.build();
        if (track) {
            stage.add(mesh);
            const s = mesh.userData.stats;
            samples += s.sampleCount;
            vertices += s.vertexCount;
            triangles += s.triangleCount;
            entries.push({ mesh, renderer });
        } else {
            silhouettes.push({ mesh, renderer });
        }
        return mesh;
    };

    for (let i = 0; i < ROWS; i++) {
        const points = straightThenWiggle(centerY(i, ROWS, spread), { z0: 0.02 + i * 0.02 });
        if (i === 1) {
            build(new DebossStrokeRenderer({ cap: CAPS[i], color: colors[i] }), points, SEEDS[i]);
        } else {
            build(new RibbonStrokeRenderer({ cap: CAPS[i], color: colors[i] }), points, SEEDS[i]);
        }
    }

    // Silhouette copies for the halos: same shapes, private scenes.
    const shadowPoints = straightThenWiggle(centerY(0, ROWS, spread), { z0: 0.001 });
    shadowHalo.setSource([build(
        new RibbonStrokeRenderer({ cap: CAPS[0], color: '#ffffff' }), shadowPoints, SEEDS[0], false
    )]);
    const glowPoints = straightThenWiggle(centerY(2, ROWS, spread), { z0: 0.001 });
    glowHalo.setSource([build(
        new RibbonStrokeRenderer({ cap: CAPS[2], color: '#ffffff' }), glowPoints, SEEDS[2], false
    )]);

    shadowHalo.blur = Math.round(softness * 3);
    shadowHalo.mesh.position.set(offset, offset, 0.005);
    glowHalo.blur = Math.round(softness * 5);
    glowHalo.setColor(glowColor);
    glowHalo.setOpacity(parseFloat(ctrl.glow.value));
    glowHalo.mesh.position.set(0, 0, 0.005);

    readout.innerHTML = `<div class="dp-stats">`
        + `<span>strokes<strong>${ROWS}</strong></span>`
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
