import * as THREE from 'three';
import { resampleEvery, catmullRomSpline, splitByTurn, hasSettledStart, smoothByWidth } from '../curves.js';
import { DrawInput } from './drawInput.js';
import { StrokeHalo } from '../StrokeHalo.js';

// Each symmetry copy owns a block of seed slots starting at (i + 1) * STRIDE, wide enough
// that no hand-drawn gesture (whose base pieces count up from 0) reaches it. Exported so a
// player can tell a gesture's copies apart from its own split pieces by the seed gap.
export const ECHO_STRIDE = 100;

/**
 * The draw-then-bake cycle every freehand demo shares.
 *
 * Wires a DrawInput to a stage and a DrawingBoard: the drawn points are split
 * into pieces wherever the direction turns abruptly, each piece is lightly
 * smoothed, `build` turns it into a mesh, the pointer's own path shows as a one
 * pixel black line while drawing, and the finished pieces bake into the board.
 * The splitting means fast zigzag squiggling bakes as separate strokes, one per
 * leg, instead of one folded line. While the stage's wireframe overlay is on,
 * the last baked mark keeps its wireframe, as plain black lines, until the next
 * mark starts.
 *
 * `build(path, points, seed, colorK, srcLength)` receives one piece's smoothed
 * path, its raw points (which carry pressure), the piece's seed, the echo copy
 * index (null for the base gesture), and the arc length of the whole gesture the
 * piece was split from (so a mark can fade over the stroke, not the piece). It
 * returns `{ mesh, renderer }` or null.
 *
 * Each piece is held until it carries `holdArc` of arc, so a mark appears
 * with its direction already settled instead of flickering through the first
 * few samples; a piece still below the gate at release draws nothing. With a
 * `widthFor` callback the smoothing follows the width (`smoothByWidth`): a
 * narrow stroke tracks the hand, a wide one rounds its turns before they can
 * fold the geometry. A `smooth(points, width)` callback replaces that step
 * entirely, for a host that supplies its own smoothing (a comparison demo).
 *
 * The pointer is one source of strokes, not the only one: the returned `feed`
 * takes (points, done) exactly as the pointer produces them, so a replay or a
 * generated stroke runs through the same cycle. `onCommit(points, seed)` fires
 * once per piece after it bakes, with the raw points that made it, so a
 * recorded piece replays as its own stroke; `onRelease()` fires once after all
 * of a gesture's pieces have committed. `split` sets the turn threshold and
 * measurement window ({ angle, span }), `true` for the default threshold,
 * `false` to draw unsplit, or a function returning any of those, read per
 * gesture, for a host whose current tool decides.
 * `echo` (a function returning `points => paths[]` or null, read per feed)
 * draws extra paths derived from the gesture — a symmetry's copies — as part
 * of the gesture's own build, so what bakes at release is exactly what was
 * on screen. Their pieces commit after the gesture's, each `onCommit` call
 * carrying the copy's index as its third argument. `buildEcho(path, run,
 * seed, k)` builds an echo's mark (`build` when omitted).
 * `pointerTrace` shows or hides the pointer's own line; the returned
 * `setPointerTrace` changes it later.
 */
export function setupDrawCycle({ stage, board, canvas, build, minDistance, onCommit, onRelease,
    split = true, holdArc = 0.06, widthFor = null, smooth = null,
    echo = null, buildEcho = null,
    pointerTrace = true, bindInput = true }) {
    let seed = 1;

    const DEFAULT_SPLIT = { angle: Math.PI * 0.55, span: 0.05 };
    function splitConfig() {
        const s = typeof split === 'function' ? split() : split;
        return s === true ? DEFAULT_SPLIT : s;
    }

    let live = null;
    function disposeLive() {
        if (!live) return;
        stage.remove(live.group);
        for (const piece of live.pieces) piece.renderer.dispose(piece.mesh);
        if (live.sils) {
            for (const sil of live.sils) sil.renderer.dispose(sil.mesh);
            _halo?.setSource([]);
        }
        live = null;
    }

    // A blurred halo under the cores, for tools whose build carries a `sil`
    // (a silhouette of the piece) and a `halo` spec. One instance serves every
    // halo gesture: only the live stroke needs it, since a finished one bakes
    // into the board. Created on the first halo gesture, so a demo with no halo
    // tool pays nothing. Its plane renders between the board and the cores.
    let _halo = null;
    function ensureHalo() {
        if (_halo) return;
        _halo = new StrokeHalo({ opacity: 1 });
        _halo.mesh.position.z = 0.01;
        stage.add(_halo.mesh);
        // Updated every frame so the live halo tracks the growing gesture and a
        // resize re-fits it; an empty source renders nothing.
        stage.addPreRender((renderer, camera, w, h) => _halo.update(renderer, camera, w, h));
    }

    const HALO_HOLD = holdArc || 0.06;
    // Points the halo at the live gesture's silhouettes (or clears it), fading it
    // in over the whole gesture: nothing until the hold, full once the stroke is
    // as long as it is wide. The core stays at full strength.
    function driveHalo(current) {
        if (current && current.haloSpec) {
            ensureHalo();
            const spec = current.haloSpec;
            const width = widthFor?.() ?? 0;
            const fade = width > HALO_HOLD
                ? Math.min(Math.max((current.baseLength - HALO_HOLD) / (width - HALO_HOLD), 0), 1)
                : (current.baseLength >= HALO_HOLD ? 1 : 0);
            _halo.setSource(current.sils.map(s => s.mesh));
            _halo.setColor(spec.color);
            _halo.setOpacity(spec.opacity * fade);
            _halo.blur = spec.blur;
            _halo.mesh.position.set(spec.offset ?? 0, spec.offset ?? 0, 0.01);
        } else if (_halo) {
            _halo.setSource([]);
        }
    }

    // After the bake: the bake borrowed the plane and switched its blending, so
    // take both back, and drop the silhouettes now that the blur is on the board.
    function finishHaloBake(current) {
        stage.add(_halo.mesh);
        _halo.mesh.material.blending = THREE.NormalBlending;
        for (const sil of current.sils) sil.renderer.dispose(sil.mesh);
        current.sils = null;
        _halo.setSource([]);
    }

    // The last baked mark, kept as a wire-only overlay so the wireframe stays
    // readable over the bake. The mark's own shader would redraw the baked pixels
    // in place, so the overlay swaps in plain black lines.
    let ghost = null;
    function makeWireOnly(object) {
        // Flag the meshes themselves: the stage's wireframe pass walks meshes,
        // and a mark may be a group, which it would skip.
        object.traverse(child => {
            if (!child.isMesh) return;
            child.userData.wireOnly = true;
            child.userData.origMaterial = child.material;
            child.material = new THREE.MeshBasicMaterial({ color: '#000000', wireframe: true });
        });
    }
    function disposeGhost() {
        if (!ghost) return;
        stage.remove(ghost.group);
        ghost.group.traverse(child => {
            if (!child.isMesh || !child.userData.origMaterial) return;
            child.material.dispose();
            child.material = child.userData.origMaterial;
            delete child.userData.origMaterial;
        });
        for (const piece of ghost.pieces) piece.renderer.dispose(piece.mesh);
        ghost = null;
    }

    // The pointer's own path, shown over the live mark while drawing and gone on
    // release. THREE.Line stays one pixel wide at any scale. depthTest is off so a
    // 3D stroke that rises off the canvas cannot bury the trace under itself.
    const pointerLine = new THREE.Line(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({ color: '#000000', depthTest: false, depthWrite: false })
    );
    pointerLine.position.z = 0.06;
    pointerLine.frustumCulled = false;
    pointerLine.visible = pointerTrace;
    pointerLine.renderOrder = 10;
    // Drawn in the stage's overlay pass, above the coverage-layer composites.
    pointerLine.userData.overlay = true;
    stage.add(pointerLine);

    // The processed spine each piece is actually built from (the smoothed path,
    // not the raw pointer), as segments so separate pieces do not join up. A
    // debug overlay, off by default.
    const spineLine = new THREE.LineSegments(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({ color: '#1a6fe0', depthTest: false, depthWrite: false })
    );
    spineLine.position.z = 0.062;
    spineLine.frustumCulled = false;
    spineLine.visible = false;
    spineLine.renderOrder = 11;
    spineLine.userData.overlay = true;
    stage.add(spineLine);

    function setPointerTrace(on) {
        pointerLine.visible = on;
        stage.draw();
    }

    function setSpineTrace(on) {
        spineLine.visible = on;
        stage.draw();
    }

    function setSpineLine(paths) {
        spineLine.geometry.dispose();
        const verts = [];
        for (const path of paths) {
            for (let i = 0; i < path.length - 1; i++) {
                verts.push(path[i].x, path[i].y, 0, path[i + 1].x, path[i + 1].y, 0);
            }
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        spineLine.geometry = geometry;
    }

    function setPointerLine(points) {
        pointerLine.geometry.dispose();
        const geometry = new THREE.BufferGeometry();
        const array = new Float32Array(points.length * 3);
        points.forEach((p, i) => {
            array[i * 3] = p.x;
            array[i * 3 + 1] = p.y;
            array[i * 3 + 2] = 0;
        });
        geometry.setAttribute('position', new THREE.BufferAttribute(array, 3));
        pointerLine.geometry = geometry;
    }

    function smoothPiece(points) {
        if (points.length < 2) return null;
        // Smoothing follows the width where the host supplies one; otherwise
        // a light fixed pass. Either spline is local: a new point reshapes
        // only the last few segments, so the drawn part holds still while
        // the stroke grows.
        const width = widthFor?.();
        let path;
        if (smooth) {
            // The host supplies the smoothing (a comparison demo swaps methods live).
            path = smooth(points, width);
        } else if (width != null) {
            // Forced from the start: a stroke shorter than one span draws straight, then
            // splines from the first point, so the start never follows the raw jitter.
            path = smoothByWidth(points, width, { forceStart: true });
        } else {
            const knots = resampleEvery(points, 0.06);
            path = knots.length >= 3 ? catmullRomSpline(knots, 6) : points;
        }
        if (path.length < 2) return null;
        // A path with no extent (all points coincident, as a replay's first few
        // points can be) would make the renderers' arc-length sampling divide
        // by zero. There is nothing to draw yet.
        let arc = 0;
        for (let i = 1; i < path.length; i++) {
            arc += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
        }
        if (arc < 1e-6) return null;
        return path;
    }

    // Each piece's seed and draw order come from its own fixed slot, not from
    // a running count, so a piece keeps its look as other parts of the gesture
    // grow or split. The base gesture owns slots 0..; each symmetry copy owns
    // a block of STRIDE starting at (i + 1) * STRIDE, wide enough that no
    // hand-drawn gesture reaches it.
    const STRIDE = ECHO_STRIDE;
    function buildFromPoints(points) {
        if (points.length < 2) return null;
        const cfg = splitConfig();
        const group = new THREE.Group();
        const pieces = [];
        const committed = [];
        const spinePaths = [];
        // Silhouettes of the halo pieces and the gesture's halo spec, collected
        // so the whole gesture blurs as one shape (see driveHalo).
        const sils = [];
        let haloSpec = null;

        // Arc length of a point list, so a mark can fade by the whole gesture it
        // belongs to rather than by its own split piece.
        const arcOf = pts => {
            let s = 0;
            for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
            return s;
        };

        // Builds one run at a fixed slot; its seed and z never depend on how
        // many other runs exist. `srcLength` is the length of the whole gesture the
        // run was split from, passed on so a mark can fade over the stroke, not the piece.
        const addRun = (run, slot, colorK, srcLength) => {
            if (holdArc && !hasSettledStart(run, holdArc)) return;
            const path = smoothPiece(run);
            if (!path) return;
            spinePaths.push(path);
            const builder = colorK === null ? build : (buildEcho ?? build);
            const mark = builder(path, run, seed + slot, colorK, srcLength);
            if (!mark) return;
            // Single-coverage pieces composite through the coverage layer in
            // draw order, later over earlier; a hair of z keeps that order.
            mark.mesh.position.z += Math.min(slot, 40) * 0.0002;
            group.add(mark.mesh);
            pieces.push(mark);
            if (mark.sil) { sils.push(mark.sil); haloSpec = mark.halo; }
            committed.push({ points: run, seed: seed + slot, echo: colorK });
        };

        const baseLength = arcOf(points);
        (cfg ? splitByTurn(points, cfg) : [points]).forEach((run, k) => addRun(run, k, null, baseLength));
        if (!pieces.length) return null;
        const paths = echo?.()?.(points) ?? [];
        paths.forEach((copy, i) => {
            const base = (i + 1) * STRIDE;
            const copyLength = arcOf(copy);
            (cfg ? splitByTurn(copy, cfg) : [copy]).forEach((run, k) => addRun(run, base + k, i, copyLength));
        });
        return { group, pieces, committed, spinePaths, sils, haloSpec, baseLength,
            seedSpan: (paths.length + 1) * STRIDE };
    }

    function feed(points, done) {
        disposeGhost();
        disposeLive();
        live = buildFromPoints(points);
        if (live) stage.add(live.group);
        driveHalo(live);
        // The pointer trace and spine overlays stay after release, showing the finished
        // stroke until the next press begins one. A new press feeds a single point, which
        // clears both here (an empty spine, a one-point line with nothing to draw).
        setPointerLine(points);
        setSpineLine(live ? live.spinePaths : []);
        if (done && live) {
            if (live.haloSpec) {
                // One render through the normal path blurs the final silhouettes into
                // the halo texture (the preRender does the update); then the plane
                // bakes under the cores in one pass.
                stage.drawNow();
                board.bake([_halo.mesh, live.group]);
                finishHaloBake(live);
            } else {
                board.bake([live.group]);
            }
            ghost = live;
            makeWireOnly(ghost.group);
            // The bake scene borrowed the group; the overlay needs it back.
            stage.add(ghost.group);
            live = null;
            for (const piece of ghost.committed) onCommit?.(piece.points, piece.seed, piece.echo ?? null);
            seed += ghost.seedSpan;
            onRelease?.();
        }
        stage.draw();
    }

    // Builds several records into one live group so they animate together, the way a
    // symmetric stroke's copies did while it was drawn, rather than one after another.
    // Each item is `{ points, prepare }`: `prepare` sets that record's state (its seed and
    // colors) right before it builds, so every copy keeps the exact look it recorded.
    function feedGroup(items, done) {
        disposeGhost();
        disposeLive();
        const group = new THREE.Group();
        const pieces = [], committed = [], spinePaths = [];
        let seedSpan = 0;
        for (const item of items) {
            item.prepare?.();
            const built = buildFromPoints(item.points);
            if (!built) continue;
            group.add(built.group);
            pieces.push(...built.pieces);
            committed.push(...built.committed);
            spinePaths.push(...built.spinePaths);
            seedSpan = Math.max(seedSpan, built.seedSpan);
            // feedGroup serves symmetric strokes, which carry no halo; drop any
            // silhouettes a build produced so they cannot leak.
            if (built.sils) for (const sil of built.sils) sil.renderer.dispose(sil.mesh);
        }
        live = pieces.length ? { group, pieces, committed, spinePaths, seedSpan } : null;
        if (live) stage.add(group);
        setPointerLine(items[0]?.points ?? []);
        setSpineLine(live ? spinePaths : []);
        if (done && live) {
            board.bake([live.group]);
            ghost = live;
            makeWireOnly(ghost.group);
            stage.add(ghost.group);
            live = null;
            for (const piece of ghost.committed) onCommit?.(piece.points, piece.seed, piece.echo ?? null);
            seed += ghost.seedSpan;
            onRelease?.();
        }
        stage.draw();
    }

    // `bindInput: false` runs the cycle without pointer listeners of its own,
    // for a host that feeds events through its API instead.
    const input = bindInput ? new DrawInput(canvas, stage, { minDistance, onChange: feed }) : null;

    // The seed counter, exposed so a mirror fed the same points can sync it
    // and build identical marks.
    const getSeed = () => seed;
    const setSeed = value => { seed = value; };

    return { disposeGhost, input, feed, feedGroup, setPointerTrace, setSpineTrace, getSeed, setSeed };
}
