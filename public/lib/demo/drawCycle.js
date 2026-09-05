import * as THREE from 'three';
import { resampleEvery, catmullRomSpline, splitByTurn } from '../curves.js';
import { STAIRCASE_WINDOW, STAIRCASE_STEP, STAIRCASE_CAP } from '../renderers/ShaderStrokeRenderer.js';
import { DrawInput } from './drawInput.js';

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
 * `build(path, points, seed)` receives one piece's smoothed path, its raw
 * points (which carry pressure), and the piece's seed, and returns
 * `{ mesh, renderer }` or null.
 *
 * The pointer is one source of strokes, not the only one: the returned `feed`
 * takes (points, done) exactly as the pointer produces them, so a replay or a
 * generated stroke runs through the same cycle. `onCommit(points, seed)` fires
 * once per piece after it bakes, with the raw points that made it, so a
 * recorded piece replays as its own stroke; `onRelease()` fires once after all
 * of a gesture's pieces have committed. `split` sets the turn threshold and
 * measurement window ({ angle, span }), or `false` to draw unsplit.
 * `pointerTrace` shows or hides the pointer's own line; the returned
 * `setPointerTrace` changes it later.
 */
export function setupDrawCycle({ stage, board, canvas, build, minDistance, onCommit, onRelease,
    split = { angle: Math.PI * 0.55, span: 0.05 }, pointerTrace = true }) {
    let seed = 1;

    let live = null;
    function disposeLive() {
        if (!live) return;
        stage.remove(live.group);
        for (const piece of live.pieces) piece.renderer.dispose(piece.mesh);
        live = null;
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
    // release. THREE.Line stays one pixel wide at any scale.
    const pointerLine = new THREE.Line(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({ color: '#000000' })
    );
    pointerLine.position.z = 0.06;
    pointerLine.frustumCulled = false;
    pointerLine.visible = pointerTrace;
    stage.add(pointerLine);

    function setPointerTrace(on) {
        pointerLine.visible = on;
        stage.draw();
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
        // Light smoothing, so the mark follows the hand without recording its
        // jitter. The spline is local: a new point reshapes only the last few
        // segments, so the drawn part holds still while the stroke grows.
        const knots = resampleEvery(points, 0.06);
        const path = knots.length >= 3 ? catmullRomSpline(knots, 6) : points;
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

    function buildFromPoints(points) {
        if (points.length < 2) return null;
        const runs = split ? splitByTurn(points, split) : [points];
        const group = new THREE.Group();
        const pieces = [];
        const committed = [];
        // Each piece lifts past the top of the staircase the piece before it
        // climbed, so a translucent single-coverage piece composites over its
        // neighbors instead of losing the depth test where they cross; the
        // dedupe stays confined to folds within one arc window.
        let zLift = 0;
        runs.forEach((run, k) => {
            const path = smoothPiece(run);
            if (!path) return;
            const mark = build(path, run, seed + k);
            if (!mark) return;
            mark.mesh.position.z += Math.min(zLift, STAIRCASE_CAP * STAIRCASE_STEP);
            let arc = 0;
            for (let i = 1; i < run.length; i++) {
                arc += Math.hypot(run[i].x - run[i - 1].x, run[i].y - run[i - 1].y);
            }
            zLift += (Math.floor(arc / STAIRCASE_WINDOW) + 1) * STAIRCASE_STEP;
            group.add(mark.mesh);
            pieces.push(mark);
            committed.push({ points: run, seed: seed + k });
        });
        if (!pieces.length) return null;
        return { group, pieces, committed, seedSpan: runs.length };
    }

    function feed(points, done) {
        disposeGhost();
        disposeLive();
        live = buildFromPoints(points);
        if (live) stage.add(live.group);
        setPointerLine(done ? [] : points);
        if (done && live) {
            board.bake([live.group]);
            ghost = live;
            makeWireOnly(ghost.group);
            // The bake scene borrowed the group; the overlay needs it back.
            stage.add(ghost.group);
            live = null;
            for (const piece of ghost.committed) onCommit?.(piece.points, piece.seed);
            seed += ghost.seedSpan;
            onRelease?.();
        }
        stage.draw();
    }

    const input = new DrawInput(canvas, stage, { minDistance, onChange: feed });

    return { disposeGhost, input, feed, setPointerTrace };
}
