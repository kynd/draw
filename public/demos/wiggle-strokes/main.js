import { StrokeDef } from '../../lib/StrokeDef.js';
import { PIXELS_PER_UNIT } from '../../lib/CanvasBuffer.js';
import { BrushStrokeRenderer } from '../../lib/renderers/BrushStrokeRenderer.js';
import { wigglePath, wiggleStrokeWidth } from '../../lib/pathEffects.js';
import { randomSchemePalette, paperColor } from '../../lib/SchemePaletteMaker.js';
import { StrokeStage } from '../../lib/demo/stage.js';
import { wireCollapsibles } from '../../lib/demo/panel.js';
import { straightThenWiggle, layout, centerY } from '../../lib/demo/strokePaths.js';

// The three variations of the crossing wave. Amplitude (the overall size) and wavelength
// are shared, set in pixels from the panel; the rows differ only in how the wavelength
// runs and in the lobe profile: the first tightens loose to tight, the second holds it
// constant, the third holds it constant with U-turn lobes instead of sine humps. The
// brush line width is derived from the amplitude and wavelength, so it stays balanced.
const ROWS = [
    { tighten: true,  shape: 'sine' },
    { tighten: false, shape: 'sine' },
    { tighten: false, shape: 'u' },
];
const SEEDS = [3.0, 7.0, 11.0];

const readout = document.getElementById('readout');
const ampInput = document.getElementById('amp');
const wavelengthInput = document.getElementById('wavelength');
const densityInput = document.getElementById('density');

const stage = new StrokeStage(document.getElementById('canvas'));

let entries = [];
let colorGroups = [];

function randomizeColors() {
    const palette = randomSchemePalette('vivid-wheel');
    stage.setBackground(paperColor(palette.entries[0].H));
    const hexes = palette.toHexArray();
    return ROWS.map((_, i) => [hexes[i % hexes.length], hexes[(i + 2) % hexes.length]]);
}

function rebuild() {
    entries.forEach(({ mesh, renderer }) => {
        stage.remove(mesh);
        renderer.dispose(mesh);
    });
    entries = [];

    const amplitude = parseFloat(ampInput.value) / PIXELS_PER_UNIT;
    const wl = parseFloat(wavelengthInput.value) / PIXELS_PER_UNIT;
    const width = wiggleStrokeWidth(amplitude, wl, parseFloat(densityInput.value));
    const { spread } = layout(stage.extentY, amplitude, ROWS.length);
    let samples = 0, vertices = 0, triangles = 0;

    ROWS.forEach((row, i) => {
        const base = straightThenWiggle(centerY(i, ROWS.length, spread), { z0: 0.01 + i * 0.01 });
        const path = wigglePath(base, {
            amplitude,
            cycleStart: wl,
            // The tightening row floors its tight end at the amplitude; the others hold
            // the wavelength constant.
            cycleEnd: row.tighten ? Math.max(wl * 0.28, amplitude) : wl,
            shape: row.shape,
        });
        const [colorA, colorB] = colorGroups[i];
        const renderer = new BrushStrokeRenderer({
            cap: 'rounded', colorA, colorB,
            bristles: Math.max(4, Math.round(width * 700)),
            rough: 0.45, dry: 0.22, samplesPerUnit: 90,
        });
        const def = new StrokeDef({
            points: path,
            widthLeft: () => width,
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
        + `<span>strokes<strong>${entries.length}</strong></span>`
        + `<span>samples<strong>${samples}</strong></span>`
        + `<span>vertices<strong>${vertices}</strong></span>`
        + `<span>triangles<strong>${triangles}</strong></span></div>`;

    stage.draw();
}

[ampInput, wavelengthInput, densityInput].forEach(input => {
    input.addEventListener('input', () => {
        document.getElementById(`${input.id}-val`).textContent =
            parseFloat(input.value).toFixed(input === densityInput ? 1 : 0);
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
