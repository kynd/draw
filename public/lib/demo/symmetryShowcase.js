import * as THREE from 'three';
import { StrokeDef } from '../StrokeDef.js';
import { PIXELS_PER_UNIT } from '../CanvasBuffer.js';
import { randomThemedPalette } from '../ThemedPaletteMaker.js';
import { seededRandom } from '../random.js';
import { resampleEvery, catmullRomSpline } from '../curves.js';
import { StrokeStage } from './stage.js';
import { TestBackground } from './testBackground.js';
import { wireCollapsibles, wireWireframeToggle } from './panel.js';
import { toolRegistry, randomValues } from './toolRegistry.js';
import { taperByArc } from './strokePaths.js';
import { pathArcLength } from './pressure.js';
import { rollSymmetry, symmetricCopies } from './symmetries.js';

const TOOL_IDS = ['pencil', 'brush', 'watercolor'];
const SEEDS = [3.1, 7.4, 11.9];

/**
 * The harness the symmetric-stroke showcases share: three seeded gestures,
 * one per tool (pencil, brush, watercolor), each drawn together with its
 * symmetric copies under one symmetry kind, smoothed the way the drawing
 * demos smooth. Randomizing rerolls the palette, the symmetry, and the
 * copies' colors; the gestures stay.
 */
export function setupSymmetryShowcase({ kind, theme = 'vivid-dark' }) {
    const stage = new StrokeStage(document.getElementById('canvas'));
    let palette = randomThemedPalette(theme);
    const background = new TestBackground(palette, { blur: 6 });
    const plane = background.createPlane(stage.extentX, stage.extentY);
    stage.add(plane);
    const readout = document.getElementById('readout');

    // A seeded wandering gesture starting near the slot's center, so the
    // rotation and mirror axes sit where the copies have room.
    function seededGesture(seed, cx, cy) {
        const rand = seededRandom(seed);
        const angle = rand() * Math.PI * 2;
        const len = 0.9 + rand() * 0.5;
        const amp = 0.15 + rand() * 0.2;
        const freq = 3 + rand() * 4;
        const points = [];
        for (let i = 0; i < 40; i++) {
            const t = i / 39;
            const along = (t - 0.15) * len;
            const across = Math.sin(t * freq + angle) * amp * t;
            points.push(new THREE.Vector3(
                cx + Math.cos(angle) * along - Math.sin(angle) * across,
                cy + Math.sin(angle) * along + Math.cos(angle) * across, 0));
        }
        return points;
    }

    let entries = [];
    function rebuild() {
        entries.forEach(({ mesh, renderer }) => {
            stage.remove(mesh);
            renderer.dispose(mesh);
        });
        entries = [];
        const colors = palette.entries.map(e => e.hex);
        let strokes = 0;

        TOOL_IDS.forEach((id, i) => {
            const entry = toolRegistry.find(e => e.id === id);
            const cx = (i - 1) * stage.extentX * 0.6;
            const cy = (i === 1 ? -0.15 : 0.1) * stage.extentY;
            const raw = seededGesture(SEEDS[i], cx, cy);
            const knots = resampleEvery(raw, 0.06);
            const path = knots.length >= 3 ? catmullRomSpline(knots, 6) : raw;
            const roll = rollSymmetry(kind, colors);
            const colorA = colors[i % colors.length];
            const colorB = colors[(i + 1) % colors.length];
            const [min, max] = entry.width ?? [2, 64];
            const width = (min + 0.45 * (max - min)) / PIXELS_PER_UNIT;
            const values = randomValues(entry);

            [path, ...symmetricCopies(path, roll)].forEach((p, k) => {
                const re = k > 0 ? roll.recolors?.[k - 1] : null;
                const a = re ? re.a : colorA;
                const b = re ? re.b : colorB;
                const ctx = {
                    colorA: a, colorB: b, colors,
                    texture: background.texture, seed: SEEDS[i] + k,
                    start: p[0], end: p[p.length - 1],
                    tintLight: new THREE.Color(a)
                        .lerp(new THREE.Color('#ffffff'), 0.55).getStyle(),
                };
                const renderer = entry.make(values, ctx);
                const mesh = new StrokeDef({
                    points: p,
                    widthLeft: taperByArc(width, pathArcLength(p)),
                    renderer,
                    seed: SEEDS[i] + k,
                }).build();
                mesh.position.z = 0.01 + (i * 8 + k) * 0.002;
                stage.add(mesh);
                entries.push({ mesh, renderer });
                strokes++;
            });
        });

        readout.innerHTML = `<div class="dp-stats">`
            + `<span>gestures<strong>${TOOL_IDS.length}</strong></span>`
            + `<span>strokes<strong>${strokes}</strong></span></div>`;
        stage.draw();
    }

    document.getElementById('random-btn').addEventListener('click', () => {
        palette = randomThemedPalette(theme);
        background.paint(palette, stage.viewport.pixelWidth, stage.viewport.pixelHeight);
        rebuild();
    });
    stage.onResize(() => {
        background.paint(palette, stage.viewport.pixelWidth, stage.viewport.pixelHeight);
        background.resizePlane(plane, stage.extentX, stage.extentY);
        rebuild();
    });

    wireCollapsibles();
    wireWireframeToggle(document.getElementById('wire-btn'), stage);
    background.paint(palette, stage.viewport.pixelWidth, stage.viewport.pixelHeight);
    rebuild();
    return { stage };
}
