import * as THREE from 'three';
import { StrokeDef } from '../StrokeDef.js';
import { PIXELS_PER_UNIT } from '../CanvasBuffer.js';
import { randomSchemePalette, paperGradient, PALETTE_SCHEMES } from '../SchemePaletteMaker.js';
import { blobOutline } from '../pathEffects.js';
import { StrokeStage } from './stage.js';
import { DrawingBoard } from './drawingBoard.js';
import { toolRegistry, randomValues } from './toolRegistry.js';
import { scatterPath, uniformWidth } from './strokePaths.js';

/**
 * Canvas initializers: compositions that fill a fresh canvas, so a drawing
 * never starts from blank paper. Each initializer rolls a plan, plain data:
 *
 *   { background, colors, marks: [{ toolId, values, colorA, colorB,
 *     widthPx, path }] }
 *
 * `background` is a board clear spec (the split initializer's color regions
 * ride it as a `regions` spec); each mark is one stroke or fill for the tool
 * named by `toolId`, with the path in world units. A fill's radius rides its
 * `widthPx`: both executors draw the blob's contour at 1.3 times the width.
 *
 * Two executors run a plan. `runInitializer` bakes it straight onto a board,
 * for the demos here. The drawing tool runs one on every clear through its
 * own cycle, picked at random from its config's `initializers`, so the
 * result records, replays, and mirrors like anything drawn. Rolling uses
 * Math.random; a host that needs determinism records what the marks drew.
 *
 * Rolls pick from the given tool set (a page's registry subset); where a
 * roll's preferred kind is missing from the set, any tool stands in.
 */

const pick = list => list[Math.floor(Math.random() * list.length)];

function strokesOf(tools) {
    const s = tools.filter(e => e.kind === 'stroke');
    return s.length ? s : tools;
}

function blobsOf(tools) {
    const b = tools.filter(e => e.kind === 'blob');
    return b.length ? b : tools;
}

function rollStrokeMark(extentX, extentY, tools, colors, { length } = {}) {
    const entry = pick(strokesOf(tools));
    return {
        toolId: entry.id, values: randomValues(entry),
        colorA: pick(colors), colorB: pick(colors),
        widthPx: 10 + Math.random() * 20,
        path: scatterPath(extentX, extentY, { length }),
    };
}

const shuffle = arr => [...arr].sort(() => Math.random() - 0.5);

/** Builds a stroke mark from a ready-made path, choosing a random stroke tool
 * (or a given one) and colors. */
function strokeMark(tools, colors, path, { entry, widthPx } = {}) {
    const e = entry ?? pick(strokesOf(tools));
    return {
        toolId: e.id, values: randomValues(e),
        colorA: pick(colors), colorB: pick(colors),
        widthPx: widthPx ?? 10 + Math.random() * 20,
        path,
    };
}

// --- Geometric shape paths, in world units, centered at (cx, cy) --------------
// Each carries a gentle pressure hump so a pressure-sensitive tool tapers.

function withPressure(points) {
    const n = points.length;
    points.forEach((p, i) => { p.pressure = 0.6 + 0.15 * Math.sin((i / (n - 1)) * Math.PI); });
    return points;
}

function sinePath(cx, cy, angle, len, amp, cycles) {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const phase = Math.random() * Math.PI * 2;
    return withPressure(Array.from({ length: 44 }, (_, i) => {
        const t = i / 43, along = (t - 0.5) * len;
        const across = Math.sin(t * cycles * Math.PI * 2 + phase) * amp;
        return new THREE.Vector3(cx + dx * along - dy * across, cy + dy * along + dx * across, 0);
    }));
}

function zigzagPath(cx, cy, angle, len, amp, teeth) {
    const dx = Math.cos(angle), dy = Math.sin(angle), count = teeth * 2 + 1;
    return withPressure(Array.from({ length: count }, (_, i) => {
        const along = (i / (count - 1) - 0.5) * len;
        const across = (i % 2 === 0 ? -1 : 1) * amp;
        return new THREE.Vector3(cx + dx * along - dy * across, cy + dy * along + dx * across, 0);
    }));
}

function spiralPath(cx, cy, turns, radius) {
    const phase = Math.random() * Math.PI * 2, way = Math.random() < 0.5 ? 1 : -1;
    return withPressure(Array.from({ length: 60 }, (_, i) => {
        const t = i / 59, a = phase + way * t * turns * Math.PI * 2;
        return new THREE.Vector3(cx + Math.cos(a) * radius * t, cy + Math.sin(a) * radius * t, 0);
    }));
}

function circlePath(cx, cy, radius) {
    const phase = Math.random() * Math.PI * 2, sweep = Math.PI * 2 * (0.8 + Math.random() * 0.4);
    return withPressure(Array.from({ length: 48 }, (_, i) =>
        new THREE.Vector3(cx + Math.cos(phase + (i / 47) * sweep) * radius,
            cy + Math.sin(phase + (i / 47) * sweep) * radius, 0)));
}

function straightLinePath(cx, cy, angle, len) {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    return withPressure(Array.from({ length: 10 }, (_, i) => {
        const along = (i / 9 - 0.5) * len;
        return new THREE.Vector3(cx + dx * along, cy + dy * along, 0);
    }));
}

const SHAPES = ['sine', 'zigzag', 'spiral', 'circle', 'straight'];

/** A shape of the named kind, sized so it roughly fits a circle of `size`. */
function shapePath(kind, cx, cy, angle, size) {
    switch (kind) {
        case 'sine':   return sinePath(cx, cy, angle, size * 2.4, size * 0.5, 1.5 + Math.random() * 2);
        case 'zigzag': return zigzagPath(cx, cy, angle, size * 2.2, size * 0.55, 3 + Math.floor(Math.random() * 4));
        case 'spiral': return spiralPath(cx, cy, 1.5 + Math.random() * 2, size);
        case 'circle': return circlePath(cx, cy, size * 0.9);
        default:       return straightLinePath(cx, cy, angle, size * 2.4);
    }
}

/** The bounding center and radius of a path, for spacing and overlap tests. */
function pathBounds(path) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of path) {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, r: 0.5 * Math.hypot(maxX - minX, maxY - minY) };
}

// --- Scatter strategies: each returns marks for a fresh canvas ----------------

/** One to four scattered strokes; the first runs long, the rest stay short. */
function rollFreeMarks(ex, ey, tools, colors) {
    const count = 1 + Math.floor(Math.random() * 4);
    return Array.from({ length: count }, (_, i) => rollStrokeMark(ex, ey, tools, colors,
        { length: i === 0 ? 2.0 + Math.random() * 1.2 : undefined }));
}

/** The same shape repeated across a grid, each copy a different stroke tool, the
 * spacing set from the shape's size so the copies never overlap. */
function rollRepeatMarks(ex, ey, tools, colors) {
    const kind = pick(SHAPES), angle = Math.random() * Math.PI, size = 0.22 + Math.random() * 0.16;
    const base = shapePath(kind, 0, 0, angle, size);
    const spacing = 2 * pathBounds(base).r + 0.2 + Math.random() * 0.2;
    // At most four cells, and only a layout that fits on the canvas.
    const layouts = [[2, 1], [1, 2], [3, 1], [1, 3], [2, 2], [4, 1], [1, 4]]
        .filter(([c, r]) => c * spacing <= 2 * ex && r * spacing <= 2 * ey);
    const [cols, rows] = layouts.length ? pick(layouts) : [1, 1];
    const strokes = shuffle(strokesOf(tools)), a = pick(colors), b = pick(colors), marks = [];
    const x0 = -((cols - 1) / 2) * spacing, y0 = -((rows - 1) / 2) * spacing;
    let k = 0;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++, k++) {
        const cx = x0 + i * spacing, cy = y0 + j * spacing;
        const path = base.map(p => Object.assign(new THREE.Vector3(p.x + cx, p.y + cy, 0), { pressure: p.pressure }));
        const mark = strokeMark(tools, colors, path, { entry: strokes[k % strokes.length] });
        mark.colorA = k % 2 ? b : a; mark.colorB = k % 2 ? a : b;
        marks.push(mark);
    }
    return marks;
}

/** Random scattered strokes, rejection-placed so their bounds never overlap. */
function rollNonOverlapMarks(ex, ey, tools, colors) {
    const target = 2 + Math.floor(Math.random() * 3), placed = [], marks = [];
    for (let attempt = 0; marks.length < target && attempt < target * 12; attempt++) {
        const path = scatterPath(ex, ey, { length: 0.6 + Math.random() * 1.0 });
        const b = pathBounds(path), r = b.r + 0.1;
        if (placed.some(o => Math.hypot(o.cx - b.cx, o.cy - b.cy) < o.r + r)) continue;
        placed.push({ cx: b.cx, cy: b.cy, r });
        marks.push(strokeMark(tools, colors, path));
    }
    return marks.length ? marks : rollFreeMarks(ex, ey, tools, colors);
}

/** The largest square that fits the canvas, centered and split into four cells,
 * with one stroke centered in each cell (four cells, never more). */
function rollQuadrantMarks(ex, ey, tools, colors) {
    const h = Math.min(ex, ey), c = h / 2, size = h * 0.32, marks = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        const cx = sx * c, cy = sy * c;
        const path = shapePath(pick(SHAPES), cx, cy, Math.random() * Math.PI * 2, size);
        for (const p of path) {
            p.x = Math.max(cx - c, Math.min(cx + c, p.x));
            p.y = Math.max(cy - c, Math.min(cy + c, p.y));
        }
        marks.push(strokeMark(tools, colors, path));
    }
    return marks;
}

/** Two to four random straight strokes. */
function rollStraightMarks(ex, ey, tools, colors) {
    const count = 2 + Math.floor(Math.random() * 3);
    return Array.from({ length: count }, () => strokeMark(tools, colors,
        straightLinePath((Math.random() * 2 - 1) * ex * 0.65, (Math.random() * 2 - 1) * ey * 0.6,
            Math.random() * Math.PI, 0.6 + Math.random() * 1.6)));
}

/** Two to four strokes, each tracing a random geometric shape (sine, zigzag,
 * spiral, circle, or line). */
function rollGeometricMarks(ex, ey, tools, colors) {
    const count = 2 + Math.floor(Math.random() * 3);
    return Array.from({ length: count }, () => strokeMark(tools, colors,
        shapePath(pick(SHAPES), (Math.random() * 2 - 1) * ex * 0.55, (Math.random() * 2 - 1) * ey * 0.5,
            Math.random() * Math.PI * 2, 0.3 + Math.random() * 0.45)));
}

/** A single stroke in the center of the canvas. */
function rollCenterMarks(ex, ey, tools, colors) {
    const size = Math.min(ex, ey) * (0.4 + Math.random() * 0.3);
    return [strokeMark(tools, colors, shapePath(pick(SHAPES), 0, 0, Math.random() * Math.PI * 2, size))];
}

/** Three strokes at the vertices of a regular (equilateral) triangle. */
function rollTriangleMarks(ex, ey, tools, colors) {
    const radius = Math.min(ex, ey) * 0.55, size = Math.min(ex, ey) * 0.28, base = Math.random() * Math.PI * 2;
    return Array.from({ length: 3 }, (_, i) => {
        const a = base + i * (Math.PI * 2 / 3);
        return strokeMark(tools, colors,
            shapePath(pick(SHAPES), Math.cos(a) * radius, Math.sin(a) * radius, Math.random() * Math.PI * 2, size));
    });
}

const SCATTER_STRATEGIES = [
    rollFreeMarks, rollRepeatMarks, rollNonOverlapMarks, rollQuadrantMarks,
    rollStraightMarks, rollGeometricMarks, rollCenterMarks, rollTriangleMarks,
];

/** Marks for a scattered start: a strategy is picked at random, so the strokes
 * fall into a pattern (a repeat, a non-overlapping spread, one per quadrant,
 * straight lines, geometric shapes) rather than always a free scatter. */
function rollScatterMarks(extentX, extentY, tools, colors) {
    return pick(SCATTER_STRATEGIES)(extentX, extentY, tools, colors);
}

// ---------------------------------------------------------------------------
// Scatter: the drawing tool's own start.

/** A paper gradient and a scattered start, laid out by a randomly picked
 * strategy (see `rollScatterMarks`). */
function rollScatter({ extentX, extentY, palette, tools = toolRegistry }) {
    const colors = palette.entries.map(e => e.hex);
    return {
        background: paperGradient(palette),
        colors,
        marks: rollScatterMarks(extentX, extentY, tools, colors),
    };
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

function rollPatternMarks(extentX, extentY, tools, colors) {
    const entry = pick(strokesOf(tools));
    const values = randomValues(entry);
    const a = pick(colors), b = pick(colors);
    // Narrow, so the pattern reads as lines rather than bands.
    const widthPx = 3 + Math.random() * 5;
    return pick(PATTERNS)(extentX, extentY).map((path, i) => ({
        toolId: entry.id, values,
        colorA: i % 2 ? b : a, colorB: i % 2 ? a : b,
        widthPx, path,
    }));
}

/**
 * A random stroke tool drawing one composition over the paper (stripes, a
 * grid, or wave rows) in two alternating palette colors, with even odds of a
 * second composition overlapping the first.
 */
function rollPattern({ extentX, extentY, palette, tools = toolRegistry }) {
    const colors = palette.entries.map(e => e.hex);
    const marks = rollPatternMarks(extentX, extentY, tools, colors);
    if (Math.random() < 0.5) marks.push(...rollPatternMarks(extentX, extentY, tools, colors));
    return { background: paperGradient(palette), colors, marks };
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
 * color, and one to four random strokes on top. The regions ride the
 * background spec, so a recording reproduces them with its clear.
 */
function rollSplit({ extentX, extentY, palette, tools = toolRegistry }) {
    const colors = palette.entries.map(e => e.hex);
    const ex = extentX + 0.05, ey = extentY + 0.05;
    const canvas = [
        new THREE.Vector3(-ex, -ey, 0), new THREE.Vector3(ex, -ey, 0),
        new THREE.Vector3(ex, ey, 0), new THREE.Vector3(-ex, ey, 0),
    ];
    const regions = splitOnce(canvas).flatMap(r => maybeSplit(r, 1));
    const shuffled = [...colors].sort(() => Math.random() - 0.5);
    return {
        background: {
            type: 'regions',
            base: paperGradient(palette),
            regions: regions.map((region, i) => ({
                points: region.map(p => [p.x, p.y]),
                color: shuffled[i % shuffled.length],
            })),
        },
        colors,
        marks: rollScatterMarks(extentX, extentY, tools, colors),
    };
}

// ---------------------------------------------------------------------------
// Fills: a few very big fills across the canvas.

/**
 * One to three very big fills with random fill tools. Each fill's spine runs
 * from a point past one edge into the far half of the canvas, so the fill
 * always crosses the midline without having to cover the center.
 */
function rollFills({ extentX, extentY, palette, tools = toolRegistry }) {
    const colors = palette.entries.map(e => e.hex);
    const count = 1 + Math.floor(Math.random() * 2);
    const marks = [];
    for (let i = 0; i < count; i++) {
        const entry = pick(blobsOf(tools));
        const edge = Math.floor(Math.random() * 4);
        const t = () => Math.random() * 2 - 1;
        // How far into the far half the spine reaches: from just past the
        // midline to past the opposite edge.
        const across = 0.1 + Math.random() * 1.1;
        let ax, ay, bx, by;
        if (edge < 2) {
            const side = edge === 0 ? -1 : 1;
            ax = side * extentX * 1.05; ay = t() * extentY;
            bx = -side * extentX * across; by = t() * extentY;
        } else {
            const side = edge === 2 ? -1 : 1;
            ay = side * extentY * 1.05; ax = t() * extentX;
            by = -side * extentY * across; bx = t() * extentX;
        }
        const wobble = 0.15 + Math.random() * 0.3;
        const phase = Math.random() * Math.PI * 2;
        const len = Math.hypot(bx - ax, by - ay) || 1;
        const nx = -(by - ay) / len, ny = (bx - ax) / len;
        const n = 32;
        const path = Array.from({ length: n }, (_, k) => {
            const s = k / (n - 1);
            const w = Math.sin(s * Math.PI * 2 + phase) * wobble;
            return new THREE.Vector3(
                ax + (bx - ax) * s + nx * w,
                ay + (by - ay) * s + ny * w,
                0
            );
        });
        // A fat radius against the spine's length, so the fill reads as a
        // rounded mass; the width carries it to the executors.
        const radius = 0.55 + Math.random() * 0.35;
        marks.push({
            toolId: entry.id, values: randomValues(entry),
            colorA: pick(colors), colorB: pick(colors),
            widthPx: radius / 1.3 * PIXELS_PER_UNIT,
            path,
        });
    }
    return { background: paperGradient(palette), colors, marks };
}

// ---------------------------------------------------------------------------

/** The initializers by id, each rolling a plan from
 * `{ extentX, extentY, palette, tools }`. */
export const INITIALIZERS = {
    scatter: rollScatter,
    pattern: rollPattern,
    split: rollSplit,
    fills: rollFills,
};

/** Bakes a plan straight onto a board, for the initializer demos. */
export function runInitializer({ stage, board }, plan) {
    board.clear(plan.background);
    for (const mark of plan.marks) {
        const entry = toolRegistry.find(e => e.id === mark.toolId);
        if (!entry) continue;
        const width = mark.widthPx / PIXELS_PER_UNIT;
        const ctx = {
            colorA: mark.colorA, colorB: mark.colorB, colors: plan.colors,
            texture: board.texture, seed: Math.random() * 1000,
            start: mark.path[0], end: mark.path[mark.path.length - 1],
            tintLight: new THREE.Color(mark.colorA)
                .lerp(new THREE.Color('#ffffff'), 0.55).getStyle(),
        };
        const renderer = entry.make(mark.values, ctx);
        let mesh = null;
        if (entry.kind === 'blob') {
            const contour = blobOutline(mark.path, { span: 0.12, radius: width * 1.3 });
            if (contour) mesh = renderer.build(contour, ctx.seed);
        } else {
            mesh = new StrokeDef({
                points: mark.path,
                widthLeft: uniformWidth(width),
                renderer,
                seed: ctx.seed,
            }).build();
        }
        if (mesh) {
            board.bake([mesh]);
            renderer.dispose(mesh);
        }
    }
}

const onBoard = roll => ({ stage, board, palette }) =>
    runInitializer({ stage, board },
        roll({ extentX: stage.extentX, extentY: stage.extentY, palette }));

export const scatterInit = onBoard(rollScatter);
export const patternInit = onBoard(rollPattern);
export const splitInit = onBoard(rollSplit);
export const fillsInit = onBoard(rollFills);

const ROLL_THEMES = PALETTE_SCHEMES.filter(th => th.id !== 'black').map(th => th.id);

/**
 * The harness the initializer demos share: a stage, a board, and the corner
 * button that runs the initializer again with a fresh palette and scheme.
 */
export function setupInitializerDemo(initialize) {
    const stage = new StrokeStage(document.getElementById('canvas'));
    const board = new DrawingBoard(stage);

    function run() {
        const palette = randomSchemePalette(ROLL_THEMES[Math.floor(Math.random() * ROLL_THEMES.length)]);
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
