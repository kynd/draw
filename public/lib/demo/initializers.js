import * as THREE from 'three';
import { StrokeDef } from '../StrokeDef.js';
import { randomThemedPalette, paperGradient, PALETTE_THEMES } from '../ThemedPaletteMaker.js';
import { blobOutline } from '../pathEffects.js';
import { StrokeStage } from './stage.js';
import { DrawingBoard } from './drawingBoard.js';
import { toolRegistry, randomValues } from './toolRegistry.js';
import { scatterPath, taperByArc } from './strokePaths.js';
import { pathArcLength } from './pressure.js';

/**
 * Canvas initializers: compositions that fill a fresh canvas, so a drawing
 * never starts from blank paper. Each initializer is one function taking
 * `{ stage, board, palette }`: it clears the board to a paper gradient and
 * bakes its composition, rolling everything else (tools, colors, placement)
 * itself. Placement uses Math.random, like the scatter it grew from; a host
 * that needs determinism records what the strokes drew.
 */

const strokeTools = () => toolRegistry.filter(e => e.kind === 'stroke');
const blobTools = () => toolRegistry.filter(e => e.kind === 'blob');
const pick = list => list[Math.floor(Math.random() * list.length)];

function markContext(board, palette, colorA, colorB, path) {
    return {
        colorA, colorB,
        colors: palette.entries.map(e => e.hex),
        texture: board.texture,
        seed: Math.random() * 1000,
        start: path[0], end: path[path.length - 1],
        tintLight: new THREE.Color(colorA).lerp(new THREE.Color('#ffffff'), 0.55).getStyle(),
    };
}

function bakeStroke(board, entry, values, path, width, ctx) {
    const renderer = entry.make(values, ctx);
    const def = new StrokeDef({
        points: path,
        widthLeft: taperByArc(width, pathArcLength(path)),
        renderer,
        seed: ctx.seed,
    });
    const mesh = def.build();
    board.bake([mesh]);
    renderer.dispose(mesh);
}

/** One random stroke with a random stroke tool and palette colors. */
function bakeRandomStroke(board, palette, path) {
    const entry = pick(strokeTools());
    const colors = palette.entries.map(e => e.hex);
    const ctx = markContext(board, palette, pick(colors), pick(colors), path);
    bakeStroke(board, entry, randomValues(entry), path,
        (10 + Math.random() * 20) / 200, ctx);
}

/** One to four random strokes; the first runs long, the rest stay short. */
function bakeRandomStrokes(stage, board, palette) {
    const count = 1 + Math.floor(Math.random() * 4);
    for (let i = 0; i < count; i++) {
        const length = i === 0 ? 2.0 + Math.random() * 1.2 : undefined;
        bakeRandomStroke(board, palette, scatterPath(stage.extentX, stage.extentY, { length }));
    }
}

// ---------------------------------------------------------------------------
// Scatter: the drawing tool's own start.

/** A paper gradient and one to four scattered strokes, the first one long. */
export function scatterInit({ stage, board, palette }) {
    board.clear(paperGradient(palette));
    bakeRandomStrokes(stage, board, palette);
}

// ---------------------------------------------------------------------------
// Pattern: one stroke tool drawing one composition.

function line(ax, ay, bx, by, n = 24) {
    return Array.from({ length: n }, (_, i) => {
        const t = i / (n - 1);
        return new THREE.Vector3(ax + (bx - ax) * t, ay + (by - ay) * t, 0);
    });
}

function stripePaths(ex, ey, angle, spacing) {
    const R = Math.hypot(ex, ey) + 0.3;
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const nx = -dy, ny = dx;
    const paths = [];
    for (let o = -R + Math.random() * spacing; o <= R; o += spacing) {
        paths.push(line(nx * o - dx * R, ny * o - dy * R, nx * o + dx * R, ny * o + dy * R));
    }
    return paths;
}

const PATTERNS = [
    // Stripes at a random angle.
    (ex, ey) => stripePaths(ex, ey, Math.random() * Math.PI, 0.3 + Math.random() * 0.35),
    // A grid: the same stripes twice, perpendicular.
    (ex, ey) => {
        const angle = Math.random() * Math.PI;
        const spacing = 0.35 + Math.random() * 0.35;
        return [
            ...stripePaths(ex, ey, angle, spacing),
            ...stripePaths(ex, ey, angle + Math.PI / 2, spacing),
        ];
    },
    // Wave rows.
    (ex, ey) => {
        const spacing = 0.3 + Math.random() * 0.3;
        const amp = spacing * (0.25 + Math.random() * 0.5);
        const freq = 2 + Math.random() * 4;
        const paths = [];
        for (let y = -ey - amp + Math.random() * spacing; y <= ey + amp; y += spacing) {
            const phase = Math.random() * Math.PI * 2;
            const n = 48;
            paths.push(Array.from({ length: n }, (_, i) => {
                const x = -ex - 0.3 + (i / (n - 1)) * (2 * ex + 0.6);
                return new THREE.Vector3(x, y + Math.sin(x * freq + phase) * amp, 0);
            }));
        }
        return paths;
    },
];

function drawPattern(stage, board, palette) {
    const entry = pick(strokeTools());
    const values = randomValues(entry);
    const colors = palette.entries.map(e => e.hex);
    const a = pick(colors), b = pick(colors);
    // Narrow, so the pattern reads as lines rather than bands.
    const width = (3 + Math.random() * 5) / 200;
    const paths = pick(PATTERNS)(stage.extentX, stage.extentY);
    paths.forEach((path, i) => {
        const ctx = markContext(board, palette, i % 2 ? b : a, i % 2 ? a : b, path);
        bakeStroke(board, entry, values, path, width, ctx);
    });
}

/**
 * A random stroke tool drawing one composition over the paper (stripes, a
 * grid, or wave rows) in two alternating palette colors, with even odds of a
 * second composition overlapping the first.
 */
export function patternInit({ stage, board, palette }) {
    board.clear(paperGradient(palette));
    drawPattern(stage, board, palette);
    if (Math.random() < 0.5) drawPattern(stage, board, palette);
}

// ---------------------------------------------------------------------------
// Split: the canvas divided into flat color regions.

function centroid(poly) {
    const c = new THREE.Vector3();
    poly.forEach(p => c.add(p));
    return c.multiplyScalar(1 / poly.length);
}

/** The polygon clipped to one side of the line through `p` along `d`. */
function clipHalf(poly, p, d, side) {
    const out = [];
    const sd = q => (d.x * (q.y - p.y) - d.y * (q.x - p.x)) * side;
    for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        const da = sd(a), db = sd(b);
        if (da >= 0) out.push(a);
        if ((da > 0 && db < 0) || (da < 0 && db > 0)) {
            const t = da / (da - db);
            out.push(new THREE.Vector3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 0));
        }
    }
    return out;
}

function splitOnce(region) {
    const c = centroid(region);
    const p = {
        x: c.x + (Math.random() - 0.5) * 0.5,
        y: c.y + (Math.random() - 0.5) * 0.5,
    };
    const angle = Math.random() * Math.PI;
    const d = { x: Math.cos(angle), y: Math.sin(angle) };
    const a = clipHalf(region, p, d, 1);
    const b = clipHalf(region, p, d, -1);
    if (a.length < 3 || b.length < 3) return [region];
    return [a, b];
}

function maybeSplit(region, depth) {
    if (depth >= 3 || Math.random() < 0.5) return [region];
    return splitOnce(region).flatMap(r => maybeSplit(r, depth + 1));
}

/**
 * The canvas divided by a random straight line, each part divided again at
 * even odds a few levels deep, every region filled with a flat palette
 * color, and one to four random strokes on top.
 */
export function splitInit({ stage, board, palette }) {
    board.clear(paperGradient(palette));
    const ex = stage.extentX + 0.05, ey = stage.extentY + 0.05;
    const canvas = [
        new THREE.Vector3(-ex, -ey, 0), new THREE.Vector3(ex, -ey, 0),
        new THREE.Vector3(ex, ey, 0), new THREE.Vector3(-ex, ey, 0),
    ];
    const regions = splitOnce(canvas).flatMap(r => maybeSplit(r, 1));
    const colors = [...palette.entries.map(e => e.hex)]
        .sort(() => Math.random() - 0.5);
    const meshes = regions.map((region, i) => {
        const shape = new THREE.Shape();
        shape.moveTo(region[0].x, region[0].y);
        region.slice(1).forEach(p => shape.lineTo(p.x, p.y));
        shape.closePath();
        return new THREE.Mesh(
            new THREE.ShapeGeometry(shape),
            new THREE.MeshBasicMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide })
        );
    });
    board.bake(meshes);
    meshes.forEach(m => { m.geometry.dispose(); m.material.dispose(); });
    bakeRandomStrokes(stage, board, palette);
}

// ---------------------------------------------------------------------------
// Fills: a few very big fills over the edges.

/**
 * One to three very big fills with random fill tools. Each fill's spine runs
 * from a point past one edge into the far half of the canvas, so the fill
 * always crosses the midline without having to cover the center.
 */
export function fillsInit({ stage, board, palette }) {
    board.clear(paperGradient(palette));
    const colors = palette.entries.map(e => e.hex);
    const count = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
        const entry = pick(blobTools());
        const edge = Math.floor(Math.random() * 4);
        const t = () => Math.random() * 2 - 1;
        const ex = stage.extentX, ey = stage.extentY;
        // How far into the far half the spine reaches: from just past the
        // midline to past the opposite edge.
        const across = 0.1 + Math.random() * 1.1;
        let ax, ay, bx, by;
        if (edge < 2) {
            const side = edge === 0 ? -1 : 1;
            ax = side * ex * 1.05; ay = t() * ey;
            bx = -side * ex * across; by = t() * ey;
        } else {
            const side = edge === 2 ? -1 : 1;
            ay = side * ey * 1.05; ax = t() * ex;
            by = -side * ey * across; bx = t() * ex;
        }
        const wobble = 0.15 + Math.random() * 0.3;
        const phase = Math.random() * Math.PI * 2;
        const len = Math.hypot(bx - ax, by - ay) || 1;
        const nx = -(by - ay) / len, ny = (bx - ax) / len;
        const n = 32;
        const gesture = Array.from({ length: n }, (_, k) => {
            const s = k / (n - 1);
            const w = Math.sin(s * Math.PI * 2 + phase) * wobble;
            return new THREE.Vector3(
                ax + (bx - ax) * s + nx * w,
                ay + (by - ay) * s + ny * w,
                0
            );
        });
        // A fat radius against the spine's length, so the fill reads as a
        // rounded mass rather than a thin band.
        const contour = blobOutline(gesture, { span: 0.15, radius: 0.55 + Math.random() * 0.35 });
        if (!contour) continue;
        const ctx = markContext(board, palette, pick(colors), pick(colors), gesture);
        const renderer = entry.make(randomValues(entry), ctx);
        const mesh = renderer.build(contour, ctx.seed);
        board.bake([mesh]);
        renderer.dispose(mesh);
    }
}

// ---------------------------------------------------------------------------

const ROLL_THEMES = PALETTE_THEMES.filter(th => th.id !== 'black').map(th => th.id);

/**
 * The harness the initializer demos share: a stage, a board, and the corner
 * button that runs the initializer again with a fresh palette and theme.
 */
export function setupInitializerDemo(initialize) {
    const stage = new StrokeStage(document.getElementById('canvas'));
    const board = new DrawingBoard(stage);

    function run() {
        const palette = randomThemedPalette(ROLL_THEMES[Math.floor(Math.random() * ROLL_THEMES.length)]);
        initialize({ stage, board, palette });
        stage.draw();
    }

    document.getElementById('reinit-btn').addEventListener('click', run);
    stage.onResize(() => {
        if (pending) {
            pending = false;
            run();
            return;
        }
        stage.draw();
    });
    // The first layout pass can land after construction, when the stage still
    // has no size, so the first run waits for the resize that sizes it.
    let pending = stage.extentX <= 0.01;
    if (!pending) run();
    return { stage, board };
}
