import * as THREE from 'three';
import { StrokeDef } from '../../../lib/StrokeDef.js';
import { PIXELS_PER_UNIT } from '../../../lib/CanvasBuffer.js';
import { RibbonStrokeRenderer } from '../../../lib/renderers/RibbonStrokeRenderer.js';
import { HaloStrokeRenderer } from '../../../lib/renderers/HaloStrokeRenderer.js';
import { StrokeHalo } from '../../../lib/StrokeHalo.js';
import { randomSchemePalette, paperColor } from '../../../lib/SchemePaletteMaker.js';
import { StrokeStage } from '../../../lib/demo/stage.js';
import { DrawingBoard } from '../../../lib/demo/drawingBoard.js';
import { DrawInput } from '../../../lib/demo/drawInput.js';
import { splitByTurn, hasSettledStart, smoothByWidth } from '../../../lib/curves.js';
import { uniformWidth } from '../../../lib/demo/strokePaths.js';

// Draw glow and shadow strokes two ways and compare them. The geometry halo is the
// current HaloStrokeRenderer: each piece inflates its own silhouette, composited
// through the coverage layer. The blur halo renders the whole gesture's cores
// (every split piece) into one target and blurs it there, so splits dissolve into
// one soft shape and the reach cannot fold on a sharp turn.
const HOLD = 0.06;
const SPLIT = { angle: Math.PI * 0.55, span: 0.05 };

const haloSel = document.getElementById('halo');
const effectSel = document.getElementById('effect');
const splitCheck = document.getElementById('split');
const blurInput = document.getElementById('blur');
const widthInput = document.getElementById('width');

const haloMode = () => haloSel.value;          // 'blur' | 'geometry'
const effect = () => effectSel.value;          // 'glow' | 'shadow'
const splitOn = () => splitCheck.checked;
const blurPasses = () => parseInt(blurInput.value, 10);
const width = () => parseFloat(widthInput.value) / PIXELS_PER_UNIT;

let palette = randomSchemePalette('vivid-wheel');
let paper = paperColor(palette.entries[0].H);
// The stroke's own hue, and the glow's (the most saturated entry).
let strokeColor = palette.entries[0].hex;
let glowColor = palette.entries.reduce((b, e) => (e.C > b.C ? e : b), palette.entries[0]).hex;

const canvas = document.getElementById('canvas');
// Match the tool's supersampling so the soft shading does not alias at 1:1.
const stage = new StrokeStage(canvas, { background: paper, minPixelRatio: 2 });
const board = new DrawingBoard(stage, { background: paper });

// One blur halo, reused across gestures: only the live gesture needs it, since a
// finished gesture's halo bakes into the board.
const halo = new StrokeHalo({ opacity: 0.9 });
stage.add(halo.mesh);
stage.addPreRender((renderer, camera, w, h) => halo.update(renderer, camera, w, h));

let seed = 1;
let live = null;   // { meshes: [], renderers: [], sils: [{mesh, renderer}] | null }

function arc(pts) {
    let s = 0;
    for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    return s;
}

const clamp01 = x => Math.min(Math.max(x, 0), 1);

// A plain ribbon in the stroke color, for a core or (in a throwaway color) a
// silhouette the halo blurs.
function ribbon(path, color, z, s) {
    const renderer = new RibbonStrokeRenderer({ cap: 'rounded', color });
    const def = new StrokeDef({
        points: path.map(p => new THREE.Vector3(p.x, p.y, 0)),
        widthLeft: uniformWidth(width()), renderer, seed: s,
    });
    const mesh = def.build();
    mesh.position.z = z;
    return { mesh, renderer };
}

// The gesture's smoothed pieces: split at sharp turns when asked, each held until
// it has settled, each smoothed from the first point.
function pieces(points) {
    const runs = splitOn() ? splitByTurn(points, SPLIT) : [points];
    const out = [];
    runs.forEach((run, k) => {
        if (!hasSettledStart(run, HOLD)) return;
        const path = smoothByWidth(run, width(), { forceStart: true });
        if (path.length >= 2 && arc(path) > 1e-6) out.push({ path, k });
    });
    return out;
}

function configureHalo(fade) {
    halo.blur = blurPasses();
    if (effect() === 'glow') {
        halo.setColor(glowColor);
        halo.setOpacity(0.9 * fade);
        halo.mesh.position.set(0, 0, 0.005);
    } else {
        halo.setColor('#101014');
        halo.setOpacity(0.5 * fade);
        const off = 0.018;
        halo.mesh.position.set(off, off, 0.005);
    }
}

function disposeLive() {
    if (!live) return;
    live.meshes.forEach((m, i) => { stage.remove(m); live.renderers[i].dispose(m); });
    if (live.sils) {
        halo.setSource([]);
        live.sils.forEach(s => s.renderer.dispose(s.mesh));
    }
    live = null;
}

function build(points, done) {
    disposeLive();
    const ps = pieces(points);
    if (!ps.length) {
        halo.setSource([]);
        if (done && points.length >= 2) seed += Math.max(1, (splitOn() ? splitByTurn(points, SPLIT).length : 1));
        stage.draw();
        return;
    }
    const length = arc(points);
    const fade = clamp01((length - HOLD) / Math.max(width() - HOLD, 1e-4));
    const meshes = [], renderers = [];

    if (haloMode() === 'blur') {
        const sils = [];
        ps.forEach(({ path, k }) => {
            const core = ribbon(path, strokeColor, 0.02 + Math.min(k, 40) * 0.0002, seed + k);
            stage.add(core.mesh);
            meshes.push(core.mesh);
            renderers.push(core.renderer);
            // A silhouette copy for the halo. Its color does not matter; the halo
            // reads only coverage. It lives in the halo's private scene, never the stage.
            sils.push(ribbon(path, '#ffffff', 0, seed + k));
        });
        halo.setSource(sils.map(s => s.mesh));
        configureHalo(fade);
        live = { meshes, renderers, sils };

        if (done) {
            // Freeze the final shape into the halo texture, then bake the blurred
            // plane under the cores in one pass so it accumulates like any stroke.
            halo.update(stage.renderer, stage.buffer.camera,
                stage.viewport.pixelWidth, stage.viewport.pixelHeight);
            board.bake([halo.mesh, ...meshes]);
            // Bake borrowed the plane and switched its blending; take both back.
            stage.add(halo.mesh);
            halo.mesh.material.blending = THREE.NormalBlending;
            disposeLive();
            seed += ps[ps.length - 1].k + 1;
        }
    } else {
        ps.forEach(({ path, k }) => {
            const renderer = new HaloStrokeRenderer({
                mode: effect(), color: strokeColor, haloColor: glowColor,
                spread: 1.4, opacity: effect() === 'glow' ? 0.85 : 0.5, fadeLength: length,
            });
            const def = new StrokeDef({
                points: path.map(p => new THREE.Vector3(p.x, p.y, 0)),
                widthLeft: uniformWidth(width()), renderer, seed: seed + k,
            });
            const mesh = def.build();
            mesh.position.z = 0.02 + Math.min(k, 40) * 0.0002;
            stage.add(mesh);
            meshes.push(mesh);
            renderers.push(renderer);
        });
        halo.setSource([]);
        live = { meshes, renderers, sils: null };

        if (done) {
            board.bake(meshes);
            disposeLive();
            seed += ps[ps.length - 1].k + 1;
        }
    }
    stage.draw();
}

new DrawInput(canvas, stage, { onChange: build });

function reset() {
    disposeLive();
    board.clear(paper);
    stage.draw();
}

blurInput.addEventListener('input', () => {
    document.getElementById('blur-val').textContent = blurInput.value;
});
widthInput.addEventListener('input', () => {
    document.getElementById('width-val').textContent = widthInput.value;
});
document.getElementById('colors-btn').addEventListener('click', () => {
    palette = randomSchemePalette('vivid-wheel');
    paper = paperColor(palette.entries[0].H);
    strokeColor = palette.entries[0].hex;
    glowColor = palette.entries.reduce((b, e) => (e.C > b.C ? e : b), palette.entries[0]).hex;
    stage.setBackground(paper);
    reset();
});
document.getElementById('clear-btn').addEventListener('click', reset);

board.clear(paper);
stage.draw();
