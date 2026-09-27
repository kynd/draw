import * as THREE from 'three';
import { StrokeDef } from '../../lib/StrokeDef.js';
import { PIXELS_PER_UNIT } from '../../lib/CanvasBuffer.js';
import { HaloStrokeRenderer } from '../../lib/renderers/HaloStrokeRenderer.js';
import { BrushStrokeRenderer } from '../../lib/renderers/BrushStrokeRenderer.js';
import { randomSchemePalette, paperColor } from '../../lib/SchemePaletteMaker.js';
import { StrokeStage } from '../../lib/demo/stage.js';
import { taper } from '../../lib/demo/strokePaths.js';

// Three self-crossing strokes, one per column: a glow and a shadow (single-hue halos)
// and a two-pigment brush. All three keep single coverage through the layer, so a
// crossing neither darkens nor doubles; the brush's crossing blends its pigments instead
// of maxing to white, which is the color-over path the multicolor marks take.
const widthInput = document.getElementById('width');
const stage = new StrokeStage(document.getElementById('canvas'));

let entries = [];
let colors = null;

function randomizeColors() {
    const palette = randomSchemePalette('vivid-wheel');
    stage.setBackground(paperColor(palette.entries[0].H));
    const hexes = palette.toHexArray();
    return { a: hexes[0], b: hexes[2 % hexes.length], c: hexes[4 % hexes.length] };
}

// A loop that turns a little more than once, so it crosses itself near the start.
function loopPath(cx, cy, s) {
    const pts = [];
    const N = 60;
    for (let i = 0; i <= N; i++) {
        const t = i / N;
        const a = -0.5 + t * Math.PI * 2 * 1.12;
        const r = s * (0.5 - 0.1 * t);
        pts.push(new THREE.Vector3(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 1.1, 0));
    }
    return pts;
}

function rebuild() {
    entries.forEach(({ mesh, renderer }) => { stage.remove(mesh); renderer.dispose(mesh); });
    entries = [];

    const width = parseFloat(widthInput.value) / PIXELS_PER_UNIT;
    const s = Math.min(stage.extentY * 1.3, stage.extentX * 0.6);
    const cols = [-stage.extentX * 0.62, 0, stage.extentX * 0.62];

    const renderers = [
        new HaloStrokeRenderer({ mode: 'glow', color: colors.a, haloColor: colors.b }),
        new HaloStrokeRenderer({ mode: 'shadow', color: colors.a }),
        new BrushStrokeRenderer({ colorA: colors.b, colorB: colors.c, rough: 0.4, dry: 0.15 }),
    ];
    renderers.forEach((renderer, i) => {
        const def = new StrokeDef({
            points: loopPath(cols[i], 0, s),
            widthLeft: taper(width), renderer, seed: 3 + i * 7,
        });
        const mesh = def.build();
        stage.add(mesh);
        entries.push({ mesh, renderer });
    });
    stage.draw();
}

widthInput.addEventListener('input', () => {
    document.getElementById('width-val').textContent = widthInput.value;
    rebuild();
});
document.getElementById('random-btn').addEventListener('click', () => {
    colors = randomizeColors();
    rebuild();
});

stage.onResize(() => rebuild());
colors = randomizeColors();
rebuild();
