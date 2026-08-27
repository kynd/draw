import { Palette } from '../Palette.js';
import { blobOutline } from '../pathEffects.js';
import { StrokeStage } from './stage.js';
import { TestBackground } from './testBackground.js';
import { wireCollapsibles, wireWireframeToggle } from './panel.js';
import { seededScribble } from './strokePaths.js';

/**
 * The harness the blob showcase demos share: three seeded gestures run through the
 * blob pipeline, each row filled by a renderer the demo supplies.
 *
 * `makeRow(i, ctx)` returns the row's renderer; ctx carries colors, the background
 * textures when the demo asked for one, and the row seed.
 */
export function setupBlobShowcase({ makeRow, background = false, controls = {} }) {
    const SEEDS = [3, 8, 21];
    const stage = new StrokeStage(document.getElementById('canvas'), {
        fit: { width: 1.70, height: 1.75 },
    });

    let palette = newPalette();
    let testBg = null, plane = null;
    if (background) {
        testBg = new TestBackground(palette);
        plane = testBg.createPlane(stage.extentX, stage.extentY);
        stage.add(plane);
    }

    const readout = document.getElementById('readout');
    const ctrl = Object.fromEntries(Object.keys(controls).map(k =>
        [k, document.getElementById(k)]));

    let entries = [];
    let colors = [];

    function newPalette() {
        return Palette.fromHues(
            Array.from({ length: 4 }, () => Math.random() * 360),
            { nLum: 5, lumHigh: 0.92, lumLow: 0.3, vibHigh: 0.95, vibLow: 0.3 }
        );
    }

    function randomizeColors() {
        palette = newPalette();
        if (testBg) testBg.paint(palette, stage.viewport.pixelWidth, stage.viewport.pixelHeight);
        else stage.setBackground(palette.entries.filter(e => e.L > 0.85)[0]?.hex ?? '#f0ede6');
        const mid = palette.entries.filter(e => e.L > 0.35 && e.L < 0.72);
        const pick = () => mid[Math.floor(Math.random() * mid.length)].hex;
        return SEEDS.map(() => pick());
    }

    function values() {
        return Object.fromEntries(Object.keys(controls).map(k =>
            [k, parseFloat(ctrl[k].value)]));
    }

    function rebuild() {
        entries.forEach(({ mesh, renderer }) => {
            stage.remove(mesh);
            renderer.dispose(mesh);
        });
        entries = [];

        const v = values();
        const ys = [1.02, 0, -1.02];
        let samples = 0;

        SEEDS.forEach((seed, i) => {
            const gesture = seededScribble(seed, { cx: 0.3, cy: ys[i], scale: 0.42 });
            const contour = blobOutline(gesture, { span: 0.12, radius: 0.11 });
            if (!contour) return;
            const renderer = makeRow(i, {
                color: colors[i],
                background: testBg?.texture ?? null,
                blurred: testBg?.blurred ?? null,
                seed,
                values: v,
            });
            const mesh = renderer.build(contour, seed);
            mesh.position.z = 0.02 + i * 0.01;
            stage.add(mesh);
            samples += mesh.userData.stats.sampleCount;
            entries.push({ mesh, renderer });
        });

        readout.innerHTML = `<div class="dp-stats">`
            + `<span>blobs<strong>${entries.length}</strong></span>`
            + `<span>contour points<strong>${samples}</strong></span></div>`;

        stage.draw();
    }

    Object.entries(controls).forEach(([k, decimals]) => {
        ctrl[k].addEventListener('input', () => {
            document.getElementById(`${k}-val`).textContent =
                parseFloat(ctrl[k].value).toFixed(decimals);
            rebuild();
        });
    });
    document.getElementById('random-btn').addEventListener('click', () => {
        colors = randomizeColors();
        rebuild();
    });
    stage.onResize(() => {
        if (testBg) {
            testBg.paint(palette, stage.viewport.pixelWidth, stage.viewport.pixelHeight);
            testBg.resizePlane(plane, stage.extentX, stage.extentY);
        }
        rebuild();
    });

    wireCollapsibles();
    wireWireframeToggle(document.getElementById('wire-btn'), stage);
    colors = randomizeColors();
    rebuild();
    return { stage };
}
